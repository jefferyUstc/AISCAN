"""Session configuration models for AISCAN.

Note: Conversation storage is now handled by OpenAI Agents SDK's SQLiteSession.
This module only contains configuration classes.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel

from ..config.paths import Paths


class SessionConfig(BaseModel):
    """Resolved session-management config for the cleanup manager/scheduler.

    The three tuning knobs mirror ``SessionSettings`` and have no defaults on
    purpose: that keeps ``SessionSettings`` the single source of truth and
    forces construction through :func:`get_session_config`. ``database_path``
    is resolved from ``Paths`` and is not part of ``SessionSettings``.
    """
    max_session_age_hours: int
    max_idle_hours: int
    cleanup_interval_minutes: int
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
