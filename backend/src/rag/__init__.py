"""RAG (Retrieval-Augmented Generation) module for AISCAN."""

from __future__ import annotations

from .embedding_service import (
    EmbeddingService,
    get_embedding_service,
    initialize_embedding_service,
)
from .vector_store import (
    VectorStore,
    get_vector_store,
    initialize_vector_store,
)
from .knowledge_processor import (
    KnowledgeProcessor,
    load_knowledge_documents,
)
from .init_knowledge_base import KnowledgeBaseInitializer

__all__ = [
    "EmbeddingService",
    "get_embedding_service",
    "initialize_embedding_service",
    "VectorStore",
    "get_vector_store",
    "initialize_vector_store",
    "KnowledgeProcessor",
    "load_knowledge_documents",
    "KnowledgeBaseInitializer",
]

