"""Session-aware assistant engine using OpenAI Agents SDK sessions."""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Dict, List, Optional

from agents import Runner, SQLiteSession
from agents.mcp import MCPServerStdio
from fastapi import HTTPException
from openai import (
    APIConnectionError,
    APIStatusError,
    AuthenticationError,
    RateLimitError,
)

from ..agent_runtime import AgentContext, AssistantPayload, build_base_agent
from ..config import get_settings, Paths
from ..dataset_store import DatasetStore
from ..models import AssistantAnnotations, AssistantResponse, Filter
from ..rag import get_embedding_service, get_vector_store

LOGGER = logging.getLogger(__name__)


class SessionAwareAssistantEngine:
    """Assistant orchestrator using OpenAI Agents SDK built-in sessions."""

    def __init__(self, dataset_store: DatasetStore) -> None:
        settings = get_settings()
        
        self.enabled = bool(settings.openai_api_key)
        self.dataset_store = dataset_store
        self.settings = settings
        
        self.base_agent = build_base_agent(settings.llm.model_name)
        
        self.session_db_path = str(Paths.SESSION_DB)
        
        self.embedding_service = get_embedding_service()
        self.vector_store = get_vector_store()

    def _get_session(self, user_id: str, session_id: str) -> SQLiteSession:
        """Get or create an SDK session for the user/session combination."""
        composite_session_id = f"{user_id}:{session_id}"
        return SQLiteSession(composite_session_id, self.session_db_path)

    async def generate_with_session(
        self,
        user_id: str,
        prompt: str,
        context: Dict[str, Any],
        session_id: str,
    ) -> AssistantResponse:
        """Generate response using SDK's built-in session management."""
        if not prompt.strip():
            raise HTTPException(status_code=400, detail="Prompt must not be empty")

        session = self._get_session(user_id, session_id)

        if not self.enabled:
            return self._fallback_response(None)

        # Narrow fallback: only the user-actionable OpenAI errors get a graceful
        # reply. Everything else (5xx, AgentsException, our own bugs) must
        # propagate so it surfaces as a 500 with traceback — silent fallbacks
        # mask real problems.
        try:
            return await self._run_agent_with_sdk_session(session, prompt, context)
        except (AuthenticationError, RateLimitError, APIConnectionError) as exc:
            LOGGER.warning("OpenAI side issue: %s: %s", type(exc).__name__, exc)
            return self._fallback_response(exc)
        except APIStatusError as exc:
            status = getattr(exc, "status_code", 0) or 0
            if 400 <= status < 500:
                LOGGER.warning("OpenAI rejected request (%s): %s", status, exc)
                return self._fallback_response(exc)
            raise

    async def _run_agent_with_sdk_session(
        self,
        session: SQLiteSession,
        prompt: str,
        request_context: Dict[str, Any],
    ) -> AssistantResponse:
        """Run the agent with SDK session-based conversation history."""
        instructions = self._compose_instructions(request_context)
        
        agent = self.base_agent.clone(instructions=instructions)

        agent_context = self._build_agent_context(request_context)

        chembl_path = self.settings.chembl_mcp_path
        if chembl_path and os.path.exists(chembl_path):
            # Catch only subprocess spawn failures here. OpenAI/Runner errors
            # raised inside the `async with` block must propagate — retrying
            # without MCP would just hit the same upstream issue.
            try:
                LOGGER.info("Connecting to ChEMBL MCP server at %s", chembl_path)
                async with MCPServerStdio(
                    name="ChEMBL MCP",
                    params={"command": "node", "args": [chembl_path]},
                    cache_tools_list=True,
                ) as mcp_server:
                    payload = await self._run_agent(
                        agent.clone(mcp_servers=[mcp_server]),
                        prompt, agent_context, session,
                    )
                    return self._payload_to_response(payload)
            except (FileNotFoundError, OSError, ConnectionError, BrokenPipeError) as exc:
                LOGGER.warning(
                    "ChEMBL MCP unavailable (%s: %s); continuing without it",
                    type(exc).__name__, exc,
                )

        payload = await self._run_agent(agent, prompt, agent_context, session)
        return self._payload_to_response(payload)

    async def _run_agent(
        self,
        agent,
        prompt: str,
        agent_context: AgentContext,
        session: SQLiteSession,
    ) -> AssistantPayload:
        """Invoke Runner.run under a turn cap and wall-clock timeout."""
        timeout = self.settings.llm.request_timeout_seconds
        try:
            result = await asyncio.wait_for(
                Runner.run(
                    agent,
                    prompt,
                    context=agent_context,
                    session=session,
                    max_turns=self.settings.llm.max_turns,
                ),
                timeout=timeout,
            )
        except asyncio.TimeoutError as exc:
            raise HTTPException(
                status_code=504,
                detail=f"Assistant exceeded {timeout:.0f}s timeout.",
            ) from exc
        return result.final_output_as(AssistantPayload)

    def _compose_instructions(self, context: Dict[str, Any]) -> str:
        """Compose instructions with current dataset state."""
        dataset = self.dataset_store.get_overview().dataset
        filter_text = self._humanize_filters(context.get("filters"))
        
        stats_text = []
        if dataset.obsStats:
            for col, stat in dataset.obsStats.items():
                if stat.get("type") == "numeric":
                    stats_text.append(f"- {col} (numeric): range [{stat['min']:.2f}, {stat['max']:.2f}], mean {stat['mean']:.2f}")
                elif stat.get("type") == "categorical":
                    cats = ", ".join(map(str, stat.get("categories", [])))
                    stats_text.append(f"- {col} (categorical): {cats}")
                elif stat.get("type") == "categorical_high_cardinality":
                    sample = ", ".join(map(str, stat.get("sample", [])))
                    stats_text.append(f"- {col} (categorical, {stat['unique_count']} unique): {sample}, ...")
        
        obs_context = "\n".join(stats_text)

        desc_text = f"Dataset Description:\n{dataset.description}\n\n" if dataset.description else ""

        summary = (
            f"Dataset {dataset.name} (id {dataset.id}) has {dataset.cellCount} cells and {dataset.geneCount} features.\n"
            f"Active embedding: {dataset.activeEmbedding}. Available embeddings: {', '.join(dataset.availableEmbeddings)}.\n"
            f"Active filters: {filter_text}.\n\n"
            f"{desc_text}"
            f"Cell Metadata (obs) columns:\n{obs_context}"
        )
        return f"{self.base_agent.instructions}\n{summary}"

    def _build_agent_context(self, context: Dict[str, Any]) -> AgentContext:
        """Build agent context from request context."""
        request_filters: List[Filter] = []
        raw_filters = context.get("filters")
        if isinstance(raw_filters, list):
            for item in raw_filters:
                if isinstance(item, dict):
                    dimension = item.get("dimension")
                    value = item.get("value")
                    if dimension and value:
                        request_filters.append(Filter(dimension=str(dimension), value=str(value)))
        
        return AgentContext(
            dataset_store=self.dataset_store, 
            request_filters=request_filters,
            embedding_service=self.embedding_service,
            vector_store=self.vector_store
        )

    def _payload_to_response(self, payload: AssistantPayload) -> AssistantResponse:
        """Convert payload to response format."""
        annotations: Optional[AssistantAnnotations] = None
        if any([payload.title, payload.summary, payload.filters, payload.actions, payload.citations]):
            annotations = AssistantAnnotations(
                title=payload.title,
                summary=payload.summary,
                filters=payload.filters or None,
                actions=payload.actions or None,
                citations=payload.citations or None,
            )
        reply_text = payload.message.strip() if payload.message else ""
        return AssistantResponse(reply=reply_text, annotations=annotations)

    def _fallback_response(self, exc: Optional[BaseException]) -> AssistantResponse:
        """Return fallback response with a user-actionable reason when possible."""
        if exc is None:
            msg = "AI assistant is not configured (OPENAI_API_KEY missing)."
        else:
            msg = self._classify_error(exc)
        return AssistantResponse(reply=msg, annotations=None)

    @staticmethod
    def _classify_error(exc: BaseException) -> str:
        """Map a caught OpenAI exception to a user-facing diagnostic message."""
        if isinstance(exc, AuthenticationError):
            return "OpenAI authentication failed. Check OPENAI_API_KEY."
        if isinstance(exc, RateLimitError):
            return "OpenAI rate limit exceeded. Please retry in a moment."
        if isinstance(exc, APIConnectionError):
            return "Could not reach OpenAI. Check your network."
        if isinstance(exc, APIStatusError):
            detail = ""
            try:
                body = exc.response.json()
                detail = (body.get("error") or {}).get("message", "") or ""
            except Exception:
                pass
            if not detail:
                detail = getattr(exc, "message", "") or str(exc)
            status = getattr(exc, "status_code", "?")
            return f"OpenAI rejected the request ({status}): {detail}"
        # Should not reach here — outer try/except only catches the above types.
        return f"Assistant error: {type(exc).__name__}: {exc}"

    @staticmethod
    def _humanize_filters(filters: Optional[object]) -> str:
        """Convert filters to human-readable string."""
        if not filters:
            return "none"
        elements: List[str] = []
        for filter_ in filters:
            if isinstance(filter_, dict):
                dimension = filter_.get("dimension")
                value = filter_.get("value")
                if dimension and value:
                    elements.append(f"{dimension}={value}")
            elif isinstance(filter_, Filter):
                elements.append(f"{filter_.dimension}={filter_.value}")
        return ", ".join(elements) or "none"

    async def get_session_messages(self, user_id: str, session_id: str) -> List[Dict[str, Any]]:
        """Get messages for a specific session using SDK."""
        session = self._get_session(user_id, session_id)
        items = await session.get_items()
        
        messages = []
        for i, item in enumerate(items):
            role = item.get("role", "unknown")
            content = item.get("content", "")
            
            if isinstance(content, list):
                text_parts = [p.get("text", "") for p in content if p.get("type") == "text"]
                content = " ".join(text_parts)
            
            messages.append({
                "id": f"{session_id}-{i}",
                "role": role,
                "content": content if isinstance(content, str) else str(content),
            })
        
        return messages

    async def clear_session(self, user_id: str, session_id: str) -> None:
        """Clear a specific session."""
        session = self._get_session(user_id, session_id)
        await session.clear_session()
