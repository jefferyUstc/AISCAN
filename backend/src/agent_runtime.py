"""Runtime primitives for the openai-agents powered assistant."""

from __future__ import annotations

from typing import Any, List, Optional, Sequence

from agents import Agent
from pydantic import BaseModel

from .config import get_settings
from .model_profile import build_model_settings
from .models import Action, Filter
from .toolsets import (
    AgentContext,
    resolve_filters,
    resolve_gene,
    resolve_embedding,
    search_knowledge_base,
    web_search,
)

__all__ = ["AgentContext", "AssistantPayload", "build_base_agent", "BASE_INSTRUCTIONS"]


BASE_INSTRUCTIONS = """\
You are an assistant helping the user explore a single-cell dataset and the
related paper (indexed in the knowledge base).

Response style
- Match length to question complexity. A short factual question gets a
  short answer; do not pad with background or definitions the user did not
  ask for.
- Do not volunteer follow-up offers ("If you'd like, I can also...", "I can
  show...") unless the user explicitly asks for suggestions.

Tool guidance — call a tool only when it actually advances the answer.

- search_knowledge_base(query): first choice whenever the user asks about
  THIS dataset or the related paper.
- web_search(query): use only when the user explicitly asks for external
  sources, or the knowledge base lacks the answer.
- resolve_filters(candidates): verify proposed filter dimension/value pairs
  against the dataset before placing them in `filters`. Pull candidate
  dimensions and values from the "Cell Metadata (obs)" section in context.
- resolve_gene(candidates): verify gene symbols exist before emitting a
  gene-display action. If not found, say so in `message` and emit no actions.
  If found, emit actions=[{"type":"set_color_mode","value":"gene"},
  {"type":"set_gene","value":"<gene>"}].
- resolve_embedding(candidates): verify the embedding name (e.g. "umap",
  "tsne") exists before switching. If not found, say so in `message` and
  emit no actions. If found, emit actions=[{"type":"set_embedding",
  "value":"<embedding>"}].

Output (AssistantPayload). Put the natural-language reply in `message`.
Optional fields default to empty — only fill them when they earn their place:
- `filters` / `actions`: only when this turn warrants a UI filter set or
  action; otherwise leave null.
- `citations`: only when you actually quote a knowledge-base or web source
  inside `message`; do NOT list "sources I happened to consult".
- `title` / `summary`: only when `message` is long enough that a short
  title plus one-sentence summary would help the reader scan. Short answers
  leave both null.
"""


class AssistantPayload(BaseModel):
    """Schema the model fills in via OpenAI structured output."""
    message: str
    title: Optional[str] = None
    summary: Optional[str] = None
    filters: Optional[List[Filter]] = None
    actions: Optional[List[Action]] = None
    citations: Optional[List[str]] = None


def build_base_agent(
    model_name: Optional[str] = None,
    instructions: Optional[str] = None,
    mcp_servers: Optional[Sequence[Any]] = None,
) -> Agent:
    """Construct the shared base Agent for the assistant.

    Args:
        model_name: Optional override; falls back to ``settings.llm.model_name``.
        instructions: Optional system-prompt override; defaults to BASE_INSTRUCTIONS.
            Callers can pre-compose dataset-static context so the prompt stays
            byte-stable across requests and benefits from prompt caching.
        mcp_servers: Long-lived MCP servers (e.g. ChEMBL) to attach to the agent.
    """
    settings = get_settings()
    model = model_name or settings.llm.model_name

    return Agent(
        name="AISCAN Assistant",
        instructions=instructions or BASE_INSTRUCTIONS,
        model=model,
        model_settings=build_model_settings(
            model,
            temperature=settings.llm.temperature,
            top_p=settings.llm.top_p,
            reasoning_effort=settings.llm.reasoning_effort,
            verbosity=settings.llm.verbosity,
            prompt_cache_retention=settings.llm.prompt_cache_retention,
        ),
        tools=[resolve_filters, resolve_gene, resolve_embedding, search_knowledge_base, web_search],
        output_type=AssistantPayload,
        mcp_servers=list(mcp_servers) if mcp_servers else [],
    )
