"""Toolsets module - External tools for the AISCAN assistant."""

from __future__ import annotations

from .web_search import (
    WebSearchPayload,
    WebSearchResult,
    fetch_webpage,
    get_web_search_status,
    is_web_search_available,
    search_web,
)

from .agent_tools import (
    AgentContext,
    ResolvedFiltersPayload,
    ResolvedGenesPayload,
    ResolvedEmbeddingsPayload,
    KnowledgeSearchPayload,
    resolve_filters,
    resolve_gene,
    resolve_embedding,
    search_knowledge_base,
    web_search,
)

__all__ = [
    "WebSearchPayload",
    "WebSearchResult",
    "search_web",
    "fetch_webpage",
    "is_web_search_available",
    "get_web_search_status",
    "AgentContext",
    "DatasetSummaryPayload",
    "ResolvedFiltersPayload",
    "ResolvedGenesPayload",
    "ResolvedEmbeddingsPayload",
    "KnowledgeSearchPayload",
    "summarize_dataset",
    "resolve_filters",
    "resolve_gene",
    "resolve_embedding",
    "search_knowledge_base",
    "web_search",
]
