"""
Reranker service for AISCAN RAG system.
Wraps FlashRank for high-precision document reranking.
"""
import logging
from typing import Dict, List, Any, Optional

from flashrank import Ranker, RerankRequest

logger = logging.getLogger(__name__)

class Reranker:
    """Wrapper for FlashRank reranker."""
    
    def __init__(self, model_name: str = "ms-marco-MiniLM-L-12-v2"):
        """Initialize the reranker."""
        logger.info(f"Initializing FlashRank with model: {model_name}")
        self.ranker = Ranker(model_name=model_name)

    def rank(self, 
             query: str, 
             documents: List[Dict[str, Any]], 
             top_k: int = 5) -> List[Dict[str, Any]]:
        """Rerank a list of documents based on query relevance.
        
        Args:
            query: The search query
            documents: List of document dictionaries.
            top_k: Number of results to return
            
        Returns:
            List of reranked document dictionaries with added 'similarity_score'
        """
        if not documents:
            return []
            
        try:
            passages = []
            for i, doc in enumerate(documents):
                text = doc.get("content") or doc.get("text") or ""
                passages.append({
                    "id": i,
                    "text": text,
                    "meta": doc
                })
                
            rerank_request = RerankRequest(query=query, passages=passages)
            results = self.ranker.rerank(rerank_request)
            
            ranked_docs = []
            for res in results:
                original_doc = res["meta"]
                original_doc["similarity_score"] = res["score"]
                ranked_docs.append(original_doc)
                
            return ranked_docs[:top_k]
            
        except Exception as e:
            logger.error(f"Reranking failed: {e}")
            return documents[:top_k]

_reranker: Optional[Reranker] = None

def get_reranker() -> Reranker:
    """Get global reranker instance."""
    global _reranker
    if _reranker is None:
        _reranker = Reranker()
    return _reranker
