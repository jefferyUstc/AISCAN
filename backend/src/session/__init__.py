"""Session management module for AISCAN.

Uses OpenAI Agents SDK's built-in SQLiteSession for conversation persistence.
"""

from __future__ import annotations

from .models import SessionConfig, get_session_config
from .manager import SessionCleanupManager, SessionManager
from .scheduler import (
    SessionScheduler,
    get_scheduler,
    initialize_scheduler,
    start_scheduler,
    stop_scheduler,
)
from .assistant import SessionAwareAssistantEngine

__all__ = [
    "SessionConfig",
    "get_session_config",
    "SessionCleanupManager",
    "SessionManager",
    "SessionScheduler",
    "get_scheduler",
    "initialize_scheduler",
    "start_scheduler",
    "stop_scheduler",
    "SessionAwareAssistantEngine",
]
