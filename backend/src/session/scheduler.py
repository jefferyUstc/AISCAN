"""Background scheduler for periodic session cleanup."""

from __future__ import annotations

import asyncio
import logging
import sqlite3
import time
from typing import Dict, Optional

from .manager import SessionCleanupManager
from .models import get_session_config

logger = logging.getLogger(__name__)


class SessionScheduler:
    """Periodically runs cleanup_old_sessions on the SDK's session DB.

    The cleanup itself is synchronous SQLite I/O; we hop it to a worker thread
    with ``asyncio.to_thread`` so the event loop isn't blocked.
    """

    def __init__(self, cleanup_manager: SessionCleanupManager):
        self.cleanup_manager = cleanup_manager
        self.config = get_session_config()
        self.cleanup_task: Optional[asyncio.Task] = None
        self.is_running = False

    async def start(self) -> None:
        if self.is_running:
            logger.warning("SessionScheduler already running")
            return
        self.is_running = True
        self.cleanup_task = asyncio.create_task(self._cleanup_loop())
        logger.info(
            "Session cleanup scheduler started "
            "(every %d min; age %dh, idle %dh)",
            self.config.cleanup_interval_minutes,
            self.config.max_session_age_hours,
            self.config.max_idle_hours,
        )

    async def stop(self) -> None:
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
        interval = self.config.cleanup_interval_minutes * 60
        while self.is_running:
            try:
                await asyncio.sleep(interval)
                if not self.is_running:
                    break

                start = time.monotonic()
                result = await asyncio.to_thread(self.cleanup_manager.cleanup_old_sessions)
                duration = time.monotonic() - start

                removed = result.get("expired", 0) + result.get("idle", 0)
                if removed:
                    logger.info(
                        "Cleanup pass: %d expired + %d idle removed in %.2fs",
                        result["expired"], result["idle"], duration,
                    )
                else:
                    logger.debug("Cleanup pass: nothing to remove (%.2fs)", duration)

            except asyncio.CancelledError:
                logger.info("Session cleanup loop cancelled")
                break
            except (sqlite3.Error, OSError) as exc:
                # Recoverable: DB busy/locked, disk full, etc. Other exceptions
                # propagate and kill the loop so bugs aren't silently retried.
                logger.warning(
                    "Recoverable cleanup error (%s: %s); backing off 60s",
                    type(exc).__name__, exc,
                )
                await asyncio.sleep(60)

    async def force_cleanup(self) -> Dict[str, int]:
        start = time.monotonic()
        result = await asyncio.to_thread(self.cleanup_manager.cleanup_old_sessions)
        result["cleanup_duration_seconds"] = round(time.monotonic() - start, 3)
        return result


_scheduler: Optional[SessionScheduler] = None


def get_scheduler() -> Optional[SessionScheduler]:
    return _scheduler


def initialize_scheduler(cleanup_manager: SessionCleanupManager) -> SessionScheduler:
    global _scheduler
    if _scheduler is not None:
        logger.warning("SessionScheduler already initialized")
        return _scheduler
    _scheduler = SessionScheduler(cleanup_manager)
    return _scheduler


async def start_scheduler() -> None:
    if _scheduler:
        await _scheduler.start()


async def stop_scheduler() -> None:
    if _scheduler:
        await _scheduler.stop()
