"""Session utilities for cleanup and statistics.

Note: Primary session management is handled by OpenAI Agents SDK's SQLiteSession.
This module provides utilities for session cleanup and statistics by directly
querying the SDK's SQLite database.
"""

from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Optional

from .models import SessionConfig, get_session_config

logger = logging.getLogger(__name__)


class SessionCleanupManager:
    """Utility class for session cleanup and statistics.
    
    Works with the SDK's SQLiteSession database to provide:
    - Session statistics
    - Cleanup of old sessions
    """
    
    def __init__(self, config: Optional[SessionConfig] = None):
        self.config = config or get_session_config()
        self.db_path = Path(self.config.database_path) if self.config.database_path else None
    
    def _get_connection(self) -> Optional[sqlite3.Connection]:
        """Get a connection to the SDK's session database."""
        if not self.db_path or not self.db_path.exists():
            return None
        return sqlite3.connect(str(self.db_path))
    
    def get_session_stats(self) -> Dict[str, int]:
        """Get statistics about current sessions."""
        conn = self._get_connection()
        if not conn:
            return {"total_sessions": 0, "error": "Database not found"}
        
        try:
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT COUNT(DISTINCT session_id) 
                FROM session_items
            """)
            result = cursor.fetchone()
            total_sessions = result[0] if result else 0
            
            return {
                "total_sessions": total_sessions,
            }
        except sqlite3.OperationalError as e:
            logger.debug(f"Could not query session stats: {e}")
            return {"total_sessions": 0}
        finally:
            conn.close()
    
    def cleanup_old_sessions(self) -> Dict[str, int]:
        """Clean up old session data from the SDK database.
        
        Note: This directly manipulates the SDK's database.
        Use with caution.
        """
        conn = self._get_connection()
        if not conn:
            return {"cleaned": 0, "error": "Database not found"}
        
        try:
            cursor = conn.cursor()
            
            # Calculate cutoff time
            max_age = timedelta(hours=self.config.max_session_age_hours)
            cutoff_time = datetime.utcnow() - max_age
            cutoff_str = cutoff_time.isoformat()
            
            cursor.execute("""
                SELECT COUNT(DISTINCT session_id) FROM session_items
            """)
            before_count = cursor.fetchone()[0]
            
            conn.commit()
            
            return {
                "total_sessions": before_count,
                "cleaned": 0,
                "note": "SDK sessions don't have timestamp tracking"
            }
        except sqlite3.OperationalError as e:
            logger.debug(f"Could not cleanup sessions: {e}")
            return {"cleaned": 0, "error": str(e)}
        finally:
            conn.close()


SessionManager = SessionCleanupManager
