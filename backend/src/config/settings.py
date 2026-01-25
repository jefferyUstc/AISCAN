"""AISCAN Backend Settings.

Centralized configuration with environment variable support.
Environment variables: AISCAN_MODEL, AISCAN_DATASET, AISCAN_ORGANISM, OPENAI_API_KEY
"""

from __future__ import annotations

import os
from typing import List, Optional

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from .paths import Paths


class LLMSettings(BaseModel):
    """LLM configuration."""
    model_name: str = "gpt-4o-mini"
    temperature: float = 0.15
    max_conversation_history: int = 10


class EmbeddingSettings(BaseModel):
    """Embedding model configuration."""
    model_name: str = "BAAI/bge-m3"
    batch_size: int = 1
    device: Optional[str] = "cpu"


class RAGSettings(BaseModel):
    """RAG/knowledge base configuration."""
    collection_name: str = "aiscan_knowledge"
    chunk_size: int = 1000
    chunk_overlap: int = 150
    min_chunk_size: int = 100
    search_top_k: int = 3


class SessionSettings(BaseModel):
    """Session management configuration."""
    max_session_age_hours: int = 168
    max_idle_hours: int = 24
    max_messages_per_session: int = 100
    trim_to_messages: int = 20
    cleanup_interval_minutes: int = 60


class WebSearchSettings(BaseModel):
    """Web search configuration."""
    max_results: int = 5
    max_content_length: int = 8000
    request_timeout: int = 30
    retry_count: int = 3


class DatasetDisplaySettings(BaseModel):
    """Dataset display configuration.
    
    Note: Named 'DatasetDisplaySettings' to avoid conflict with AISCAN_DATASET env var,
    which is automatically mapped to 'dataset' field by pydantic-settings.
    """
    default_embedding_limit: int = 4000
    random_seed: int = 42
    max_category_values: int = 256


class APISettings(BaseModel):
    """API configuration."""
    version: str = "0.2.0"
    cors_origins: List[str] = ["*"]
    log_level: str = "INFO"


class Settings(BaseSettings):
    """Main settings class with environment variable support."""
    
    model_config = SettingsConfigDict(
        env_prefix="AISCAN_",
        env_nested_delimiter="__",
        extra="ignore",
    )
    
    openai_api_key: Optional[str] = None
    dataset_path: Optional[str] = None
    organism: str = "Unknown"
    
    llm: LLMSettings = Field(default_factory=LLMSettings)
    embedding: EmbeddingSettings = Field(default_factory=EmbeddingSettings)
    rag: RAGSettings = Field(default_factory=RAGSettings)
    session: SessionSettings = Field(default_factory=SessionSettings)
    web_search: WebSearchSettings = Field(default_factory=WebSearchSettings)
    dataset_display: DatasetDisplaySettings = Field(default_factory=DatasetDisplaySettings)
    api: APISettings = Field(default_factory=APISettings)
    
    chembl_mcp_path: Optional[str] = None
    
    def __init__(self, **kwargs):
        if "openai_api_key" not in kwargs:
            kwargs["openai_api_key"] = os.getenv("OPENAI_API_KEY")
        
        if "dataset_path" not in kwargs:
            kwargs["dataset_path"] = os.getenv("AISCAN_DATASET")
        
        env_organism = os.getenv("AISCAN_ORGANISM")
        if env_organism and "organism" not in kwargs:
            kwargs["organism"] = env_organism
        
        legacy_model = os.getenv("AISCAN_MODEL")
        if legacy_model and "llm" not in kwargs:
            kwargs["llm"] = LLMSettings(model_name=legacy_model)
        
        if "chembl_mcp_path" not in kwargs:
            env_path = os.getenv("AISCAN_CHEMBL_MCP_PATH")
            if env_path:
                kwargs["chembl_mcp_path"] = env_path
            else:
                # Default path relative to project root (avoid relying on process CWD)
                default_path = Paths.PROJECT_ROOT / "backend/mcp-servers/chembl-mcp-server/build/index.js"
                if default_path.exists():
                    kwargs["chembl_mcp_path"] = str(default_path)

        super().__init__(**kwargs)


_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """Get global settings instance."""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def reset_settings() -> None:
    """Reset global settings instance (for testing)."""
    global _settings
    _settings = None
