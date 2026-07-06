"""Session-aware assistant engine using OpenAI Agents SDK sessions."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional

from agents import Runner, SQLiteSession
from fastapi import HTTPException
from openai import (
    APIConnectionError,
    APIStatusError,
    AuthenticationError,
    RateLimitError,
)

from ..agent_runtime import (
    AgentContext,
    AssistantPayload,
    BASE_INSTRUCTIONS,
    build_base_agent,
)
from ..config import get_settings, Paths
from ..dataset_store import DatasetStore
from ..models import AssistantAnnotations, AssistantResponse, Filter
from ..rag import get_embedding_service, get_vector_store

LOGGER = logging.getLogger(__name__)


def _iter_filter_pairs(filters: Optional[object]):
    """Yield normalized (dimension, value) string pairs from raw context filters.

    Accepts both dict and Filter entries and skips incomplete ones, giving
    `_build_agent_context` and `_humanize_filters` a single parsing path.
    """
    for item in filters or []:
        if isinstance(item, dict):
            dimension = item.get("dimension")
            value = item.get("value")
        elif isinstance(item, Filter):
            dimension = item.dimension
            value = item.value
        else:
            continue
        if dimension and value:
            yield str(dimension), str(value)


class SessionAwareAssistantEngine:
    """Assistant orchestrator using OpenAI Agents SDK built-in sessions.

    The base agent is constructed once with byte-stable system instructions
    (BASE_INSTRUCTIONS + dataset-static summary) so the system prompt benefits
    from OpenAI prompt caching. Per-request dynamic state (active filters) is
    injected inline into the user message instead of mutating the system
    prompt. A pre-started MCP server, when provided, is attached at agent
    construction time and reused across all requests.
    """

    def __init__(
        self,
        dataset_store: DatasetStore,
        chembl_mcp: Optional[Any] = None,
    ) -> None:
        settings = get_settings()
        self.enabled = bool(settings.openai_api_key)
        self.dataset_store = dataset_store
        self.settings = settings
        self.session_db_path = str(Paths.SESSION_DB)
        self.embedding_service = get_embedding_service()
        self.vector_store = get_vector_store()

        self.base_agent = build_base_agent(
            model_name=settings.llm.model_name,
            instructions=self._build_static_instructions(),
            mcp_servers=[chembl_mcp] if chembl_mcp else None,
        )

    def _get_session(self, user_id: str, session_id: str) -> SQLiteSession:
        composite_session_id = f"{user_id}:{session_id}"
        return SQLiteSession(composite_session_id, self.session_db_path)

    async def generate_with_session(
        self,
        user_id: str,
        prompt: str,
        context: Dict[str, Any],
        session_id: str,
    ) -> AssistantResponse:
        """Generate a response within an SDK-managed session."""
        if not prompt.strip():
            raise HTTPException(status_code=400, detail="Prompt must not be empty")
        if not self.enabled:
            return self._fallback_response(None)

        session = self._get_session(user_id, session_id)

        # Narrow fallback: only the user-actionable OpenAI errors degrade into
        # a graceful reply. 5xx, AgentsException, and bugs propagate so they
        # surface as HTTP 500 with traceback.
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
        agent_context = self._build_agent_context(request_context)
        wrapped = self._wrap_user_message(prompt, request_context)
        payload = await self._run_agent(self.base_agent, wrapped, agent_context, session)
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

    def _build_static_instructions(self) -> str:
        """Compose the system prompt once from BASE_INSTRUCTIONS plus
        dataset-static facts. Per-request state lives in the user message."""
        dataset = self.dataset_store.get_overview().dataset
        stats_lines: List[str] = []
        for col, stat in (dataset.obsStats or {}).items():
            kind = stat.get("type")
            if kind == "numeric":
                stats_lines.append(
                    f"- {col} (numeric): range [{stat['min']:.2f}, {stat['max']:.2f}], "
                    f"mean {stat['mean']:.2f}"
                )
            elif kind == "categorical":
                cats = ", ".join(map(str, stat.get("categories", [])))
                stats_lines.append(f"- {col} (categorical): {cats}")
            elif kind == "categorical_high_cardinality":
                sample = ", ".join(map(str, stat.get("sample", [])))
                stats_lines.append(
                    f"- {col} (categorical, {stat['unique_count']} unique): {sample}, ..."
                )
        desc_block = (
            f"Dataset Description:\n{dataset.description}\n\n"
            if dataset.description else ""
        )
        summary = (
            f"Dataset {dataset.name} (id {dataset.id}) has {dataset.cellCount} cells "
            f"and {dataset.geneCount} features.\n"
            f"Default embedding: {dataset.activeEmbedding}. "
            f"Available embeddings: {', '.join(dataset.availableEmbeddings)}.\n\n"
            f"{desc_block}"
            f"Cell Metadata (obs) columns:\n" + "\n".join(stats_lines)
        )
        return f"{BASE_INSTRUCTIONS}\n{summary}"

    def _wrap_user_message(self, prompt: str, context: Dict[str, Any]) -> str:
        """Prepend per-request state to the user prompt so the system prompt
        stays byte-stable across requests."""
        filter_text = self._humanize_filters(context.get("filters"))
        if filter_text == "none":
            return prompt
        return f"[Active filters: {filter_text}]\n\n{prompt}"

    def _build_agent_context(self, context: Dict[str, Any]) -> AgentContext:
        request_filters = [
            Filter(dimension=dimension, value=value)
            for dimension, value in _iter_filter_pairs(context.get("filters"))
        ]
        return AgentContext(
            dataset_store=self.dataset_store,
            request_filters=request_filters,
            embedding_service=self.embedding_service,
            vector_store=self.vector_store,
        )

    def _payload_to_response(self, payload: AssistantPayload) -> AssistantResponse:
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
        return f"Assistant error: {type(exc).__name__}: {exc}"

    @staticmethod
    def _humanize_filters(filters: Optional[object]) -> str:
        elements = [f"{dimension}={value}" for dimension, value in _iter_filter_pairs(filters)]
        return ", ".join(elements) or "none"

    async def get_session_messages(self, user_id: str, session_id: str) -> List[Dict[str, Any]]:
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
        session = self._get_session(user_id, session_id)
        await session.clear_session()
