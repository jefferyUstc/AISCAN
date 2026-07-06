"""
Production-grade vector store for AISCAN RAG system.
Handles document storage, retrieval, and management with ChromaDB.
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import chromadb
from chromadb.config import Settings as ChromaSettings

from ..config import Paths, get_settings

logger = logging.getLogger(__name__)


class VectorStore:
    """Production-grade vector store with ChromaDB backend."""
    
    def __init__(self, 
                 persist_directory: Optional[str] = None,
                 collection_name: Optional[str] = None,
                 embedding_function: Optional[Any] = None):
        """Initialize the vector store.
        
        Args:
            persist_directory: Directory to persist the database (defaults to Paths config)
            collection_name: Name of the collection (defaults to settings)
            embedding_function: Custom embedding function (optional)
        """
        settings = get_settings()
        
        self.persist_directory = Path(persist_directory or Paths.get_vector_store_path())
        self.collection_name = collection_name or settings.rag.collection_name
        
        self.persist_directory.mkdir(parents=True, exist_ok=True)
        
        self.client = chromadb.PersistentClient(
            path=str(self.persist_directory),
            settings=ChromaSettings(
                anonymized_telemetry=False,
                allow_reset=True
            )
        )
        
        self.collection = self.client.get_or_create_collection(
            name=self.collection_name,
            metadata={"hnsw:space": "cosine"},
            embedding_function=embedding_function
        )
    
    def add_documents(self, 
                     documents: List[str],
                     embeddings: List[List[float]],
                     metadatas: Optional[List[Dict[str, Any]]] = None,
                     ids: Optional[List[str]] = None) -> List[str]:
        """Add documents to the vector store.
        
        Args:
            documents: List of document texts
            embeddings: List of embedding vectors
            metadatas: List of metadata dictionaries
            ids: List of document IDs (auto-generated if None)
            
        Returns:
            List of document IDs that were added
        """
        if not documents:
            logger.warning("No documents provided for addition")
            return []
        
        if len(documents) != len(embeddings):
            raise ValueError("Number of documents must match number of embeddings")
        
        if ids is None:
            ids = [str(uuid.uuid4()) for _ in documents]
        
        if metadatas is None:
            metadatas = [{"source": "unknown"} for _ in documents]
        
        if len(documents) != len(metadatas) or len(documents) != len(ids):
            raise ValueError("All input lists must have the same length")
        
        try:
            self.collection.add(
                documents=documents,
                embeddings=embeddings,
                metadatas=metadatas,
                ids=ids
            )
            
            return ids
            
        except Exception as e:
            logger.error(f"Failed to add documents: {e}")
            raise RuntimeError(f"Could not add documents to vector store: {e}")
    
    def search(self, 
              query_embedding: List[float],
              n_results: int = 5,
              where: Optional[Dict[str, Any]] = None,
              include: Optional[List[str]] = None) -> Dict[str, Any]:
        """Search for similar documents.
        
        Args:
            query_embedding: Query embedding vector
            n_results: Number of results to return
            where: Metadata filter conditions
            include: Fields to include in results
            
        Returns:
            Dictionary with search results
        """
        if include is None:
            include = ["documents", "metadatas", "distances"]

        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=min(n_results, self.collection.count()),
            where=where,
            include=include
        )

        logger.debug(f"Search returned {len(results.get('documents', [[]])[0])} results")
        return results
    
    def search_by_text(self,
                      query_text: str,
                      embedding_service,
                      n_results: int = 5,
                      where: Optional[Dict[str, Any]] = None,
                      rerank: bool = True) -> List[Dict[str, Any]]:
        """Search using text query (requires embedding service).
        
        Args:
            query_text: Text query
            embedding_service: Service to encode the query
            n_results: Number of results to return
            where: Metadata filter conditions
            rerank: Whether to use FlashRank reranking
            
        Returns:
            List of search result dictionaries
        """
        query_embedding = embedding_service.encode_text(query_text)

        initial_top_k = n_results * 4 if rerank else n_results

        results = self.search(
            query_embedding=query_embedding,
            n_results=initial_top_k,
            where=where
        )

        formatted_results = []
        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]

        for doc, metadata, distance in zip(documents, metadatas, distances):
            processed_metadata = metadata.copy()
            for key in ["genes", "cell_types", "methods", "pathways", "topics"]:
                if key in processed_metadata and processed_metadata[key]:
                    processed_metadata[key] = [item.strip() for item in processed_metadata[key].split(",") if item.strip()]
                else:
                    processed_metadata[key] = []

            formatted_results.append({
                "content": doc,
                "metadata": processed_metadata,
                "distance": float(distance)
            })

        if rerank and formatted_results:
            from .reranker import get_reranker
            reranker = get_reranker()
            formatted_results = reranker.rank(query_text, formatted_results, top_k=n_results)

            logger.debug(f"Reranked {len(documents)} candidates to top {len(formatted_results)}")

        # Guarantee every result exposes a numeric similarity_score for callers,
        # regardless of the rerank path (rerank off, or reranker fell back to
        # distance-ordered docs without a score).
        for res in formatted_results:
            score = res.get("similarity_score")
            if score is None:
                score = 1.0 - float(res["distance"])
            res["similarity_score"] = float(score)

        return formatted_results
    
    def get_document_count(self) -> int:
        """Get the total number of documents in the collection."""
        return self.collection.count()
    
    def get_collection_info(self) -> Dict[str, Any]:
        """Get information about the collection."""
        return {
            "name": self.collection_name,
            "document_count": self.collection.count(),
            "persist_directory": str(self.persist_directory),
            "metadata": self.collection.metadata
        }
    
    def reset_collection(self) -> bool:
        """Reset the collection (delete all documents).
        
        Returns:
            True if successful, False otherwise
        """
        try:
            self.client.delete_collection(self.collection_name)
            self.collection = self.client.create_collection(
                name=self.collection_name,
                metadata={"hnsw:space": "cosine"}
            )
            return True
        except Exception as e:
            logger.error(f"Failed to reset collection: {e}")
            return False
    
    def health_check(self) -> Dict[str, Any]:
        """Perform health check on the vector store.
        
        Returns:
            Dictionary with health status information
        """
        try:
            count = self.collection.count()
            return {
                "status": "healthy",
                "collection_name": self.collection_name,
                "document_count": count,
                "persist_directory": str(self.persist_directory),
                "client_type": type(self.client).__name__
            }
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
                "collection_name": self.collection_name
            }


# Global instance
_vector_store: Optional[VectorStore] = None


def get_vector_store() -> VectorStore:
    """Get the global vector store instance."""
    global _vector_store
    if _vector_store is None:
        _vector_store = VectorStore()
    return _vector_store


def initialize_vector_store(persist_directory: Optional[str] = None,
                           collection_name: Optional[str] = None) -> VectorStore:
    """Initialize the global vector store with custom parameters."""
    global _vector_store
    
    kwargs = {}
    if persist_directory:
        kwargs['persist_directory'] = persist_directory
    if collection_name:
        kwargs['collection_name'] = collection_name
    
    _vector_store = VectorStore(**kwargs)
    return _vector_store
