"""Web search tool using DuckDuckGo (free, no API key required)."""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from ..config import get_settings

logger = logging.getLogger(__name__)

try:
    from bs4 import BeautifulSoup
    BS4_AVAILABLE = True
except ImportError:
    BS4_AVAILABLE = False

try:
    from ddgs import DDGS
    DDGS_AVAILABLE = True
except ImportError:
    try:
        from duckduckgo_search import DDGS
        DDGS_AVAILABLE = True
    except ImportError:
        DDGS_AVAILABLE = False

try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}






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
            error="Empty query provided"
        )
    
    query = query.strip()
    
    if not DDGS_AVAILABLE:
        logger.warning("DDGS library not available. Install with: pip install ddgs")
        return WebSearchPayload(
            query=query,
            results=[],
            total_found=0,
            success=False,
            error="DDGS library not available. Install with: pip install ddgs"
        )
    
    try:
        with DDGS() as ddgs:
            search_results = list(ddgs.text(query, max_results=max_results))
        
        results = [
            WebSearchResult(
                title=result.get("title", ""),
                url=result.get("href", ""),
                snippet=result.get("body", ""),
                source="DuckDuckGo"
            )
            for result in search_results
        ]
        
        logger.info(f"Web search for '{query}' returned {len(results)} results")
        
        return WebSearchPayload(
            query=query,
            results=results,
            total_found=len(results),
            success=True,
            error=None
        )
        
    except Exception as e:
        logger.error(f"Web search failed: {e}")
        return WebSearchPayload(
            query=query,
            results=[],
            total_found=0,
            success=False,
            error=f"Search failed: {str(e)}"
        )


def _is_binary_or_corrupted(content: str) -> bool:
    """Check if content appears to be binary or corrupted."""
    if not content:
        return False
    
    sample = content[:1000]
    printable_chars = sum(1 for c in sample if c.isprintable() or c.isspace())
    total_chars = len(sample)
    
    if total_chars == 0:
        return False
    
    printable_ratio = printable_chars / total_chars
    return printable_ratio < 0.7


def _create_session_with_retry() -> "requests.Session":
    """Create a requests session with retry strategy."""
    settings = get_settings()
    session = requests.Session()
    
    retry_strategy = Retry(
        total=settings.web_search.retry_count,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.headers.update(DEFAULT_HEADERS)
    
    return session


def fetch_webpage(url: str, max_length: Optional[int] = None) -> Dict[str, Any]:
    """
    Fetch and extract text content from a webpage.
    
    Args:
        url: URL to fetch
        max_length: Maximum content length to return (defaults to settings)
    
    Returns:
        Dict with content and metadata
    """
    settings = get_settings()
    
    if max_length is None:
        max_length = settings.web_search.max_content_length
    
    if not REQUESTS_AVAILABLE:
        return {
            "success": False,
            "error": "requests library not available",
            "content": "",
            "url": url
        }
    
    try:
        session = _create_session_with_retry()
        
        response = session.get(url, timeout=settings.web_search.request_timeout, verify=False)
        response.raise_for_status()
        
        content = response.text
        content_type = response.headers.get("Content-Type", "").lower()
        
        if _is_binary_or_corrupted(content):
            logger.warning(f"Content from {url} appears to be binary or corrupted")
            return {
                "success": False,
                "error": "Content appears to be binary or corrupted",
                "content": "",
                "url": url
            }
        
        if BS4_AVAILABLE and "html" in content_type:
            content = _html_to_text(content)
        
        if len(content) > max_length:
            content = content[:max_length] + "\n\n[Content truncated...]"
        
        logger.info(f"Successfully fetched {len(content)} characters from {url}")
        
        return {
            "success": True,
            "content": content,
            "url": url,
            "content_type": content_type,
            "status_code": response.status_code,
        }
        
    except requests.exceptions.Timeout:
        logger.error(f"Timeout fetching {url}")
        return {
            "success": False,
            "error": "Request timed out",
            "content": "",
            "url": url
        }
    except requests.exceptions.HTTPError as e:
        logger.error(f"HTTP error fetching {url}: {e}")
        return {
            "success": False,
            "error": f"HTTP error: {e.response.status_code if e.response else str(e)}",
            "content": "",
            "url": url
        }
    except Exception as e:
        logger.error(f"Failed to fetch {url}: {e}")
        return {
            "success": False,
            "error": str(e),
            "content": "",
            "url": url
        }


def _html_to_text(html_content: str) -> str:
    """Convert HTML to plain text using BeautifulSoup.
    
    Note: This function is only called when BS4_AVAILABLE is True.
    """
    soup = BeautifulSoup(html_content, "html.parser")
    
    for element in soup(["script", "style", "meta", "link", "noscript", "nav", "footer", "aside"]):
        element.decompose()
    
    text = soup.get_text(separator="\n")
    
    text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)
    text = re.sub(r' +', ' ', text)
    
    return text.strip()






def is_web_search_available() -> bool:
    """Check if web search functionality is available."""
    return DDGS_AVAILABLE


def get_web_search_status() -> Dict[str, Any]:
    """Get status of web search dependencies."""
    return {
        "ddgs_available": DDGS_AVAILABLE,
        "requests_available": REQUESTS_AVAILABLE,
        "beautifulsoup_available": BS4_AVAILABLE,
        "web_search_ready": DDGS_AVAILABLE,
    }

