"""
Production-grade embedding service for AISCAN RAG system.
Handles text encoding with caching and error handling.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Optional

from sentence_transformers import SentenceTransformer

from ..config import Paths, get_settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Production-grade embedding service with caching and error handling.
    
    Note: Use get_embedding_service() to get the singleton instance.
    Direct instantiation creates a new instance each time.
    """
    
    def __init__(self, 
                 model_name: Optional[str] = None,
                 cache_dir: Optional[str] = None,
                 device: Optional[str] = None):
        """Initialize the embedding service.
        
        Args:
            model_name: HuggingFace model name or local path (defaults to settings)
            cache_dir: Directory to cache the model (defaults to Paths config)
            device: Device to run the model on ('cpu', 'cuda', 'mps', None=auto)
        """
        settings = get_settings()
        
        self.model_name = model_name or settings.embedding.model_name
        self.cache_dir = cache_dir or Paths.get_embedding_model_path()
        self.device = device if device is not None else settings.embedding.device
        self._model: Optional[SentenceTransformer] = None
        self._embedding_dim: Optional[int] = None
        
        # Create cache directory
        Path(self.cache_dir).mkdir(parents=True, exist_ok=True)
    
    def _load_model(self) -> SentenceTransformer:
        """Lazy load the embedding model."""
        if self._model is None:
            try:
                # Check if model exists locally
                local_path = Path(self.cache_dir)
                if local_path.exists() and any(local_path.iterdir()):
                    self._model = SentenceTransformer(str(local_path), device=self.device)
                else:
                    logger.info(f"Downloading embedding model: {self.model_name}")
                    self._model = SentenceTransformer(self.model_name, device=self.device)
                    self._model.save(str(local_path))
                
                self._embedding_dim = self._model.get_sentence_embedding_dimension()
                
            except Exception as e:
                logger.error(f"Failed to load embedding model: {e}")
                raise RuntimeError(f"Could not initialize embedding model: {e}") from e
        
        return self._model
    
    @property
    def embedding_dimension(self) -> int:
        """Get the embedding dimension."""
        if self._embedding_dim is None:
            self._load_model()
        return self._embedding_dim
    
    def encode_text(self, text: str, normalize: bool = True) -> List[float]:
        """Encode a single text into embedding vector.
        
        Args:
            text: Input text to encode
            normalize: Whether to normalize the embedding vector
            
        Returns:
            List of float values representing the embedding
        """
        if not text or not text.strip():
            raise ValueError("Cannot encode empty or whitespace-only text")

        model = self._load_model()
        embedding = model.encode(text.strip(), normalize_embeddings=normalize)
        return embedding.tolist()
    
    def encode_batch(self, 
                    texts: List[str], 
                    batch_size: Optional[int] = None,
                    normalize: bool = True,
                    show_progress: bool = True) -> List[List[float]]:
        """Encode multiple texts in batches.
        
        Args:
            texts: List of input texts to encode
            batch_size: Batch size for processing (defaults to settings)
            normalize: Whether to normalize the embedding vectors
            show_progress: Whether to show progress bar
            
        Returns:
            List of embedding vectors
        """
        if batch_size is None:
            batch_size = get_settings().embedding.batch_size
        if not texts:
            logger.warning("Empty text list provided for batch encoding")
            return []
        
        valid_texts = [text.strip() for text in texts if text and text.strip()]
        if len(valid_texts) != len(texts):
            logger.warning(f"Filtered out {len(texts) - len(valid_texts)} empty texts")
        
        if not valid_texts:
            raise ValueError("Cannot encode a batch of only empty or whitespace-only texts")

        model = self._load_model()
        embeddings = model.encode(
            valid_texts,
            batch_size=batch_size,
            normalize_embeddings=normalize,
            show_progress_bar=show_progress
        )
        return embeddings.tolist()
    
    def health_check(self) -> dict:
        """Perform health check on the embedding service.
        
        Returns:
            Dictionary with health status information
        """
        try:
            test_text = "This is a test sentence."
            embedding = self.encode_text(test_text)
            
            return {
                "status": "healthy",
                "model_name": self.model_name,
                "embedding_dimension": self.embedding_dimension,
                "cache_dir": self.cache_dir,
                "test_embedding_length": len(embedding),
                "device": str(self._model.device) if self._model else "not_loaded"
            }
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
                "model_name": self.model_name
            }


_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    """Get the global embedding service instance."""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service


def initialize_embedding_service(model_name: Optional[str] = None,
                                cache_dir: Optional[str] = None,
                                device: Optional[str] = None) -> EmbeddingService:
    """Initialize the global embedding service with custom parameters."""
    global _embedding_service
    
    kwargs = {}
    if model_name:
        kwargs['model_name'] = model_name
    if cache_dir:
        kwargs['cache_dir'] = cache_dir
    if device:
        kwargs['device'] = device
    
    _embedding_service = EmbeddingService(**kwargs)
    return _embedding_service
