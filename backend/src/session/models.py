"""Session configuration models for AISCAN.

Note: Conversation storage is now handled by OpenAI Agents SDK's SQLiteSession.
This module only contains configuration classes.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel

from ..config.paths import Paths


class SessionConfig(BaseModel):
    """Configuration for session management.
    
    Note: Most session operations are now handled by the SDK.
    This config is kept for any custom cleanup/management needs.
    """
    max_session_age_hours: int = 168
    max_idle_hours: int = 24
    cleanup_interval_minutes: int = 60
    database_path: Optional[str] = None


def get_session_config() -> SessionConfig:
    """Get session config from centralized settings."""
    from ..config import get_settings
    settings = get_settings()
    return SessionConfig(
        max_session_age_hours=settings.session.max_session_age_hours,
        max_idle_hours=settings.session.max_idle_hours,
        cleanup_interval_minutes=settings.session.cleanup_interval_minutes,
        database_path=str(Paths.SESSION_DB),
    )
