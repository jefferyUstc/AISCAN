"""Configuration module for AISCAN backend.

This module provides centralized configuration management including:
- Path configuration (Paths)
- Application settings (Settings, get_settings)

Usage:
    from backend.src.config import Paths, get_settings
    
    settings = get_settings()
    print(settings.llm.model_name)
    print(Paths.DATA_DIR)
"""

from __future__ import annotations

from .paths import Paths
from .settings import (
    APISettings,
    DatasetDisplaySettings,
    EmbeddingSettings,
    LLMSettings,
    RAGSettings,
    SessionSettings,
    Settings,
    WebSearchSettings,
    get_settings,
    reset_settings,
)

__all__ = [
    "Paths",
    "Settings",
    "LLMSettings",
    "EmbeddingSettings",
    "RAGSettings",
    "SessionSettings",
    "WebSearchSettings",
    "DatasetDisplaySettings",
    "APISettings",
    "get_settings",
    "reset_settings",
]
