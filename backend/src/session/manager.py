"""Session GC and statistics against the openai-agents SQLiteSession DB.

The SDK persists sessions in two tables:
- ``agent_sessions(session_id PK, created_at, updated_at)``
- ``agent_messages(id, session_id FK ON DELETE CASCADE, message_data, created_at)``

`updated_at` on ``agent_sessions`` is bumped by the SDK on every ``add_items``
call, so it is a reliable idle indicator. Deleting a row in ``agent_sessions``
cascades to its messages.
"""

from __future__ import annotations

import logging
import sqlite3
from pathlib import Path
from typing import Dict, Optional

from .models import SessionConfig, get_session_config

logger = logging.getLogger(__name__)

SESSIONS_TABLE = "agent_sessions"
MESSAGES_TABLE = "agent_messages"


class SessionCleanupManager:
    """Statistics and GC against the SDK's SQLiteSession database."""

    def __init__(self, config: Optional[SessionConfig] = None):
        self.config = config or get_session_config()
        self.db_path = Path(self.config.database_path) if self.config.database_path else None

    def _get_connection(self) -> Optional[sqlite3.Connection]:
        if not self.db_path or not self.db_path.exists():
            return None
        return sqlite3.connect(str(self.db_path))

    def get_session_stats(self) -> Dict[str, int]:
        """Return total/active/cached counts.

        - ``active_sessions``: ``updated_at`` within the last hour.
        - ``cached_sessions``: rest of the rows (dormant but still on disk).
        """
        conn = self._get_connection()
        if not conn:
            return {"total_sessions": 0, "active_sessions": 0, "cached_sessions": 0}
        try:
            row = conn.execute(
                f"""
                SELECT
                  COUNT(*),
                  COALESCE(SUM(updated_at >= datetime('now', '-1 hours')), 0)
                FROM {SESSIONS_TABLE}
                """
            ).fetchone()
            total = int(row[0] or 0)
            active = int(row[1] or 0)
            return {
                "total_sessions": total,
                "active_sessions": active,
                "cached_sessions": total - active,
            }
        finally:
            conn.close()

    def cleanup_old_sessions(self) -> Dict[str, int]:
        """Retire sessions by two cutoffs and return per-axis counts.

        Order matters: the age sweep runs first, so the idle count reports only
        rows that survived the age sweep — no double counting.
        """
        conn = self._get_connection()
        if not conn:
            return {"expired": 0, "idle": 0, "before": 0, "after": 0,
                    "error": "Database not found"}
        try:
            conn.execute("PRAGMA foreign_keys = ON")  # honor CASCADE on messages
            before = int(conn.execute(
                f"SELECT COUNT(*) FROM {SESSIONS_TABLE}"
            ).fetchone()[0] or 0)

            cur = conn.execute(
                f"DELETE FROM {SESSIONS_TABLE} "
                f"WHERE created_at < datetime('now', ?)",
                (f"-{self.config.max_session_age_hours} hours",),
            )
            expired = cur.rowcount

            cur = conn.execute(
                f"DELETE FROM {SESSIONS_TABLE} "
                f"WHERE updated_at < datetime('now', ?)",
                (f"-{self.config.max_idle_hours} hours",),
            )
            idle = cur.rowcount

            conn.commit()
            after = before - expired - idle
            if expired or idle:
                logger.info(
                    "Session cleanup removed %d expired (>%dh) + %d idle (>%dh); %d remain",
                    expired, self.config.max_session_age_hours,
                    idle, self.config.max_idle_hours, after,
                )
            return {"expired": expired, "idle": idle, "before": before, "after": after}
        finally:
            conn.close()
