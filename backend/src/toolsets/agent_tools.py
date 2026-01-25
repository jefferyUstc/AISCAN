"""Agent tools for AISCAN assistant.

These tools are decorated with @function_tool and require AgentContext.
"""

from __future__ import annotations

import logging

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from agents import RunContextWrapper, function_tool
from pydantic import BaseModel, Field

from ..dataset_store import DatasetStore
from ..models import Filter
from ..rag import get_embedding_service, get_vector_store
from .web_search import search_web as _search_web, WebSearchPayload


logger = logging.getLogger(__name__)

@dataclass
class AgentContext:
    """Holds per-request state available to tools and guardrails."""

    dataset_store: DatasetStore
    request_filters: List[Filter] = field(default_factory=list)
    embedding_service: Optional[Any] = None
    vector_store: Optional[Any] = None

class ResolvedFiltersPayload(BaseModel):
    """Payload for resolved filters tool."""
    filters: List[Filter] = Field(default_factory=list)


class KnowledgeSearchPayload(BaseModel):
    """Payload for knowledge search tool."""
    query: str
    results: List[Dict[str, Any]] = Field(default_factory=list)
    total_found: int = 0
    summary: Optional[str] = None


class ResolvedGenesPayload(BaseModel):
    """Payload for resolve_gene tool."""
    found: List[str] = Field(default_factory=list)
    not_found: List[str] = Field(default_factory=list)

class ResolvedEmbeddingsPayload(BaseModel):
    """Payload for resolve_embedding tool."""
    found: List[str] = Field(default_factory=list)
    not_found: List[str] = Field(default_factory=list)


@function_tool
def resolve_filters(
    ctx: RunContextWrapper[AgentContext],
    candidates: List[Filter],
) -> ResolvedFiltersPayload:
    """
    Verify if the proposed filters are valid for the current dataset.
    
    Args:
        candidates: List of filters (dimension/value pairs) that you think the user wants.
                   You must determine these from the user's prompt and valid columns in context.
                   Example: [{'dimension': 'leiden', 'value': '1'}, {'dimension': 'condition', 'value': 'treated'}]
    
    Returns:
        The subset of candidates that are actually valid in the dataset.
    """
    logger.info(f"Verifying {len(candidates)} filter candidates")
    context = ctx.context
    
    # Delegate to store for verification
    valid_filters = context.dataset_store.verify_filters(candidates)
    
    logger.info(f"Verified {len(valid_filters)} valid filters out of {len(candidates)} candidates")
    return ResolvedFiltersPayload(filters=valid_filters)


@function_tool
def resolve_gene(
    ctx: RunContextWrapper[AgentContext],
    candidates: List[str],
) -> ResolvedGenesPayload:
    """
    Verify whether candidate genes exist in adata.var_names.

    Args:
        candidates: Candidate gene names/symbols extracted from the user prompt.

    Returns:
        found: canonical gene names (from adata.var_names)
        not_found: candidates that do not exist
    """
    context = ctx.context
    result = context.dataset_store.verify_genes(candidates)
    return ResolvedGenesPayload(found=result.get("found", []), not_found=result.get("not_found", []))


@function_tool
def resolve_embedding(
    ctx: RunContextWrapper[AgentContext],
    candidates: List[str],
) -> ResolvedEmbeddingsPayload:
    """
    Verify whether candidate embedding names exist for the current dataset.

    Args:
        candidates: Candidate embedding names from user prompt (e.g. "tsne", "X_tsne").

    Returns:
        found: canonical embedding names (e.g. "tsne")
        not_found: candidates that do not exist
    """
    context = ctx.context
    result = context.dataset_store.verify_embeddings(candidates)
    return ResolvedEmbeddingsPayload(found=result.get("found", []), not_found=result.get("not_found", []))


@function_tool
def search_knowledge_base(
    ctx: RunContextWrapper[AgentContext],
    query: str,
    max_results: int = 3
) -> KnowledgeSearchPayload:
    """Search the scientific knowledge base for relevant information.
    
    Args:
        query: Natural language query describing what you're looking for
        max_results: Maximum number of results to return (1-10)
    
    Returns:
        KnowledgeSearchPayload with search results and scientific context
    """
    context = ctx.context
    
    max_results = max(1, min(max_results, 10))
    if not query or not query.strip():
        return KnowledgeSearchPayload(query=query, results=[], total_found=0, summary="Empty query")
    
    query = query.strip()
    
    embedding_service = context.embedding_service or get_embedding_service()
    vector_store = context.vector_store or get_vector_store()
    
    search_results = vector_store.search_by_text(
        query_text=query,
        embedding_service=embedding_service,
        n_results=max_results
    )
    
    knowledge_items = [
        {
            "content": result["content"],
            "source": result["metadata"].get("source", "unknown"),
            "similarity_score": result["similarity_score"],
            "relevance_score": result["similarity_score"],
            "topics": result["metadata"].get("topics", []),
            "genes": result["metadata"].get("genes", []),
            "cell_types": result["metadata"].get("cell_types", []),
            "methods": result["metadata"].get("methods", []),
            "pathways": result["metadata"].get("pathways", []),
        }
        for result in search_results
    ]
    
    if knowledge_items:
        sources = list(set(item["source"] for item in knowledge_items))
        summary = f"Found {len(knowledge_items)} results from: {', '.join(sources)}"
    else:
        summary = "No relevant literature found."
    return KnowledgeSearchPayload(
        query=query,
        results=knowledge_items,
        total_found=len(knowledge_items),
        summary=summary
    )


@function_tool
def web_search(
    ctx: RunContextWrapper[AgentContext],
    query: str,
    max_results: int = 5
) -> WebSearchPayload:
    """Search the web using DuckDuckGo for scientific literature and research.
    
    Use this tool for:
    - Latest research findings not in the local knowledge base
    - General scientific concepts and definitions
    - Drug mechanisms, gene functions, pathway information
    - Recent publications and reviews
    
    Args:
        query: Search query (be specific for better results)
        max_results: Number of results to return (1-10, default 5)
    
    Returns:
        WebSearchPayload with search results including titles, URLs, and snippets
    """
    return _search_web(query, max_results)

