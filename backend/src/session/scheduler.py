"""Background scheduler for session cleanup tasks."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Optional

from .manager import SessionCleanupManager
from .models import get_session_config

logger = logging.getLogger(__name__)


class SessionScheduler:
    """Background scheduler for session cleanup and maintenance tasks.
    
    Works with SessionCleanupManager to periodically clean old sessions
    from the SDK's SQLite database.
    """
    
    def __init__(self, cleanup_manager: SessionCleanupManager):
        self.cleanup_manager = cleanup_manager
        self.config = get_session_config()
        self.cleanup_task: Optional[asyncio.Task] = None
        self.is_running = False
    
    async def start(self) -> None:
        """Start the background scheduler."""
        if self.is_running:
            logger.warning("SessionScheduler is already running")
            return
        
        self.is_running = True
        self.cleanup_task = asyncio.create_task(self._cleanup_loop())
        logger.info("Session cleanup scheduler started")
    
    async def stop(self) -> None:
        """Stop the background scheduler."""
        if not self.is_running:
            return
        
        self.is_running = False
        if self.cleanup_task:
            self.cleanup_task.cancel()
            try:
                await self.cleanup_task
            except asyncio.CancelledError:
                pass
        logger.info("Session cleanup scheduler stopped")
    
    async def _cleanup_loop(self) -> None:
        """Main cleanup loop that runs periodically."""
        cleanup_interval = self.config.cleanup_interval_minutes * 60
        
        while self.is_running:
            try:
                await asyncio.sleep(cleanup_interval)
                
                if not self.is_running:
                    break
                
                start_time = datetime.utcnow()
                result = self.cleanup_manager.cleanup_old_sessions()
                end_time = datetime.utcnow()
                
                duration = (end_time - start_time).total_seconds()
                
                cleaned = result.get("cleaned", 0)
                if cleaned > 0:
                    logger.info(
                        f"Session cleanup completed in {duration:.2f}s: "
                        f"{cleaned} sessions cleaned"
                    )
                else:
                    logger.debug(f"Session cleanup completed in {duration:.2f}s: no sessions to clean")
                
            except asyncio.CancelledError:
                logger.info("Session cleanup loop cancelled")
                break
            except Exception as exc:
                logger.exception("Error in session cleanup loop")
                await asyncio.sleep(60)
    
    async def force_cleanup(self) -> dict:
        """Force an immediate cleanup and return results."""
        logger.info("Forcing immediate session cleanup")
        start_time = datetime.utcnow()
        result = self.cleanup_manager.cleanup_old_sessions()
        end_time = datetime.utcnow()
        
        duration = (end_time - start_time).total_seconds()
        result["cleanup_duration_seconds"] = duration
        
        logger.info(
            f"Forced cleanup completed in {duration:.2f}s: "
            f"{result.get('cleaned', 0)} sessions cleaned"
        )
        
        return result


_scheduler: Optional[SessionScheduler] = None


def get_scheduler() -> Optional[SessionScheduler]:
    """Get the global scheduler instance."""
    return _scheduler


def initialize_scheduler(cleanup_manager: SessionCleanupManager) -> SessionScheduler:
    """Initialize the global scheduler."""
    global _scheduler
    if _scheduler is not None:
        logger.warning("SessionScheduler already initialized")
        return _scheduler
    
    _scheduler = SessionScheduler(cleanup_manager)
    return _scheduler


async def start_scheduler() -> None:
    """Start the global scheduler if it exists."""
    if _scheduler:
        await _scheduler.start()


async def stop_scheduler() -> None:
    """Stop the global scheduler if it exists."""
    if _scheduler:
        await _scheduler.stop()
