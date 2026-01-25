"""Session-aware assistant engine using OpenAI Agents SDK sessions."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

from agents import Runner, SQLiteSession
from agents.exceptions import AgentsException
from agents.mcp import MCPServerStdio
from fastapi import HTTPException

from ..agent_runtime import AgentContext, AssistantPayload, build_base_agent
from ..config import get_settings, Paths
from ..dataset_store import DatasetStore
from ..models import Action, AssistantAnnotations, AssistantResponse, Filter
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

        if self.enabled:
            try:
                response = await self._run_agent_with_sdk_session(
                    session, prompt, context
                )
                return response
            except AgentsException as exc:
                LOGGER.exception("openai-agents execution failed")
                return self._fallback_response()
            except Exception as exc:
                LOGGER.exception("Unexpected assistant failure")
                return self._fallback_response()
        else:
            return self._fallback_response()

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
            try:
                LOGGER.info("Connecting to ChEMBL MCP server at %s", chembl_path)
                async with MCPServerStdio(
                    name="ChEMBL MCP",
                    params={
                        "command": "node",
                        "args": [chembl_path],
                    },
                    cache_tools_list=True,
                ) as mcp_server:
                    # openai-agents>=0.6.x supports passing mcp_servers via Agent/clone directly.
                    agent_with_mcp = agent.clone(mcp_servers=[mcp_server])

                    result = await Runner.run(
                        agent_with_mcp,
                        prompt,
                        context=agent_context,
                        session=session,
                    )

                    final_text = getattr(result, "final_output", None) or ""
                    payload = self._parse_json_response(final_text)
                    payload = self._postprocess_payload(payload, prompt)
                    return self._payload_to_response(payload)
            except asyncio.CancelledError:
                raise
            except Exception:
                LOGGER.exception("ChEMBL MCP server failed; falling back to non-MCP run")

        result = await Runner.run(
            agent, 
            prompt, 
            context=agent_context,
            session=session
        )

        final_text = getattr(result, "final_output", None) or ""
        payload = self._parse_json_response(final_text)
        payload = self._postprocess_payload(payload, prompt)
        return self._payload_to_response(payload)

    @staticmethod
    def _normalize_not_exist_text(text: str) -> Optional[str]:
        """
        Normalize common "not exist" replies to strict UI contracts.

        Contracts:
        - Gene: XXX  not exist   (two spaces before 'not')
        - Embedding: XXX not exist
        """
        if not text:
            return None
        m_gene = re.match(r"^Gene:\s*(\S+)\s+not\s+exist\s*$", text)
        if m_gene:
            return f"Gene: {m_gene.group(1)}  not exist"
        m_emb = re.match(r"^Embedding:\s*(\S+)\s+not\s+exist\s*$", text)
        if m_emb:
            return f"Embedding: {m_emb.group(1)} not exist"
        return None

    @staticmethod
    def _norm_token(text: str) -> str:
        """Lowercase + keep only alnum (used for robust matching against user prompts)."""
        return "".join(ch for ch in (text or "").lower() if ch.isalnum())

    def _postprocess_payload(self, payload: AssistantPayload, prompt: str) -> AssistantPayload:
        """
        Safety net: if the model failed to emit actions for certain UI controls we support,
        we can deterministically infer them from the user prompt and dataset metadata.
        This keeps the UI controllable even when the model skips a tool call.
        """
        if not prompt or not payload:
            return payload

        # Embedding switch: only trigger if the prompt actually contains one of the available
        # embedding names (normalized). This avoids accidental matches on generic "show ...".
        if not payload.actions:
            available = list(self.dataset_store.get_overview().dataset.availableEmbeddings or [])
            p_norm = self._norm_token(prompt)
            candidate: Optional[str] = None
            for emb in available:
                emb_norm = self._norm_token(emb)
                if emb_norm and emb_norm in p_norm:
                    candidate = emb
                    break
                if self._norm_token(f"X_{emb}") in p_norm:
                    candidate = emb
                    break

            if candidate:
                result = self.dataset_store.verify_embeddings([candidate])
                found = result.get("found") or []
                if found:
                    payload.actions = [Action(type="set_embedding", value=found[0])]
                    # If the model claimed it doesn't exist, override with a helpful message.
                    if payload.message and payload.message.strip().lower().startswith("embedding:") and "not exist" in payload.message.lower():
                        payload.message = f"Switched embedding to {found[0]}."

        return payload
    
    def _parse_json_response(self, text: str) -> AssistantPayload:
        """Parse JSON response from agent into AssistantPayload."""
        if not text:
            return AssistantPayload(message="No response generated.")
        
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
            text = text.strip()

        normalized = self._normalize_not_exist_text(text)
        if normalized:
            return AssistantPayload(message=normalized)
        
        try:
            data = json.loads(text)
            citations = data.get("citations")
            if citations:
                sanitized_citations = []
                for cit in citations:
                    if isinstance(cit, dict):
                        title = cit.get("title", "Link")
                        url = cit.get("url", "#")
                        sanitized_citations.append(f"[{title}]({url})")
                    elif isinstance(cit, str):
                        sanitized_citations.append(cit)
                citations = sanitized_citations

            raw_message = data.get("message", text)
            if isinstance(raw_message, (dict, list)):
                message = self._format_to_markdown(raw_message)
            else:
                message = str(raw_message) if raw_message is not None else ""
            normalized_msg = self._normalize_not_exist_text(message)
            if normalized_msg:
                message = normalized_msg

            return AssistantPayload(
                message=message,
                title=data.get("title"),
                summary=data.get("summary"),
                filters=[Filter(**f) for f in data.get("filters", []) if f] if data.get("filters") else None,
                actions=[Action(**a) for a in data.get("actions", []) if a] if data.get("actions") else None,
                citations=citations or None,
            )
        except json.JSONDecodeError:
            return AssistantPayload(message=text)

    def _format_to_markdown(self, data: Any, level: int = 0) -> str:
        """Recursively convert structured data to readable Markdown."""
        indent = "  " * level
        if isinstance(data, dict):
            lines = []
            for key, value in data.items():
                clean_key = key.replace("_", " ").title()
                formatted_value = self._format_to_markdown(value, level + 1)
                
                if isinstance(value, (dict, list)) and value:
                    lines.append(f"{indent}- **{clean_key}**:\n{formatted_value}")
                else:
                    lines.append(f"{indent}- **{clean_key}**: {formatted_value.strip()}")
            return "\n".join(lines)
        
        elif isinstance(data, list):
            lines = []
            for item in data:
                formatted_item = self._format_to_markdown(item, level + 1)
                lines.append(f"{indent}- {formatted_item.strip()}")
            return "\n".join(lines)
        
        else:
            return str(data)

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

    def _fallback_response(self) -> AssistantResponse:
        """Return fallback response when AI is unavailable."""
        return AssistantResponse(reply="LLM model unavailable for now.", annotations=None)

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
