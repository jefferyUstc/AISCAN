"""AISCAN Backend path configuration.

Centralized path management for all backend components.
"""

from pathlib import Path
from typing import Optional
import os

BACKEND_DIR = Path(__file__).parent.parent.parent.absolute()
PROJECT_ROOT = BACKEND_DIR.parent


class Paths:
    """Centralized path configuration for AISCAN backend."""
    
    BACKEND_DIR = BACKEND_DIR
    PROJECT_ROOT = PROJECT_ROOT
    DATA_DIR = BACKEND_DIR / "data"
    
    SESSIONS_DIR = DATA_DIR / "sessions"
    VECTORS_DIR = DATA_DIR / "vectors"
    DOCS_DIR = DATA_DIR / "docs"
    MODELS_DIR = DATA_DIR / "models"
    
    SESSION_DB = SESSIONS_DIR / "sessions.db"
    
    @classmethod
    def ensure_directories(cls) -> None:
        """Create all required directories if they don't exist."""
        directories = [
            cls.DATA_DIR,
            cls.SESSIONS_DIR,
            cls.VECTORS_DIR,
            cls.DOCS_DIR,
            cls.MODELS_DIR,
        ]
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
    
    @classmethod
    def get_database_url(cls) -> str:
        """Get SQLite database URL for sessions."""
        cls.ensure_directories()
        return f"sqlite:///{cls.SESSION_DB}"
    
    @classmethod
    def get_vector_store_path(cls) -> str:
        """Get path for ChromaDB vector store."""
        cls.ensure_directories()
        return str(cls.VECTORS_DIR)
    
    @classmethod
    def get_embedding_model_path(cls) -> str:
        """Get path for cached embedding model."""
        cls.ensure_directories()
        return str(cls.MODELS_DIR)
    
    @classmethod
    def get_knowledge_dir(cls) -> str:
        """Get path for RAG knowledge documents."""
        cls.ensure_directories()
        return str(cls.DOCS_DIR)
    
    @classmethod
    def get_dataset_path(cls) -> str:
        """Get dataset path from environment variable or auto-detect from DATA_DIR.
        
        Returns:
            Path from AISCAN_DATASET env var, or first .h5ad file found in DATA_DIR.
            
        Raises:
            RuntimeError: If no dataset is configured and no .h5ad file found.
        """
        env_path = os.getenv("AISCAN_DATASET")
        if env_path:
            return env_path
        
        cls.ensure_directories()
        h5ad_files = list(cls.DATA_DIR.glob("*.h5ad"))
        if h5ad_files:
            h5ad_files.sort()
            return str(h5ad_files[0])
        
        raise RuntimeError(
            "No dataset found. Either set AISCAN_DATASET environment variable "
            f"or place a .h5ad file in {cls.DATA_DIR}. "
            "Example: export AISCAN_DATASET='/path/to/dataset.h5ad'"
        )

    @classmethod
    def get_dataset_description_path(cls, dataset_path: Path) -> Optional[Path]:
        """Get path for optional dataset description text file.
        
        Args:
            dataset_path: Path to the .h5ad dataset file
            
        Returns:
            Path to .txt file if it exists, else None
        """
        txt_path = dataset_path.with_suffix(".txt")
        return txt_path if txt_path.exists() else None


Paths.ensure_directories()
