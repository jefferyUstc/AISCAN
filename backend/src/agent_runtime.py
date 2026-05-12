"""Runtime primitives for the openai-agents powered assistant."""

from __future__ import annotations

from typing import List, Optional

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

Output is delivered as a structured object (AssistantPayload). Put your
natural-language reply in `message`; leave `filters` / `actions` /
`citations` empty when not applicable.
"""


class AssistantPayload(BaseModel):
    """Schema the model fills in via OpenAI structured output."""
    message: str
    title: Optional[str] = None
    summary: Optional[str] = None
    filters: Optional[List[Filter]] = None
    actions: Optional[List[Action]] = None
    citations: Optional[List[str]] = None


def build_base_agent(model_name: Optional[str] = None) -> Agent:
    """Construct the shared base Agent for the assistant.

    Args:
        model_name: Optional override; falls back to ``settings.llm.model_name``.
    """
    settings = get_settings()
    model = model_name or settings.llm.model_name

    return Agent(
        name="AISCAN Assistant",
        instructions=BASE_INSTRUCTIONS,
        model=model,
        model_settings=build_model_settings(
            model,
            temperature=settings.llm.temperature,
            top_p=settings.llm.top_p,
            reasoning_effort=settings.llm.reasoning_effort,
            verbosity=settings.llm.verbosity,
        ),
        tools=[resolve_filters, resolve_gene, resolve_embedding, search_knowledge_base, web_search],
        output_type=AssistantPayload,
    )
