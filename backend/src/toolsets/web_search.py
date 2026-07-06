"""Web search tool using DuckDuckGo (free, no API key required)."""

from __future__ import annotations

import logging
from typing import List, Optional

from ddgs import DDGS
from pydantic import BaseModel, Field

from ..config import get_settings

logger = logging.getLogger(__name__)


class WebSearchResult(BaseModel):
    """Single web search result."""
    title: str
    url: str
    snippet: str
    source: str = "DuckDuckGo"


class WebSearchPayload(BaseModel):
    """Web search response payload."""
    query: str
    results: List[WebSearchResult] = Field(default_factory=list)
    total_found: int = 0
    success: bool = True
    error: Optional[str] = None


def search_web(query: str, max_results: Optional[int] = None) -> WebSearchPayload:
    """
    Search the web using DuckDuckGo (free, no API key required).

    Args:
        query: Search query string
        max_results: Maximum number of results to return (1-10, defaults to settings)

    Returns:
        WebSearchPayload with search results
    """
    settings = get_settings()

    if max_results is None:
        max_results = settings.web_search.max_results

    max_results = max(1, min(max_results, 10))

    if not query or not query.strip():
        return WebSearchPayload(
            query=query,
            results=[],
            total_found=0,
            success=False,
            error="Empty query provided",
        )

    query = query.strip()

    try:
        with DDGS() as ddgs:
            search_results = list(ddgs.text(query, max_results=max_results))

        results = [
            WebSearchResult(
                title=result.get("title", ""),
                url=result.get("href", ""),
                snippet=result.get("body", ""),
                source="DuckDuckGo",
            )
            for result in search_results
        ]

        logger.info(f"Web search for '{query}' returned {len(results)} results")

        return WebSearchPayload(
            query=query,
            results=results,
            total_found=len(results),
            success=True,
            error=None,
        )

    except Exception as e:
        logger.error(f"Web search failed: {e}")
        return WebSearchPayload(
            query=query,
            results=[],
            total_found=0,
            success=False,
            error=f"Search failed: {str(e)}",
        )
