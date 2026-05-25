"""Celery sync maintenance tasks."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import delete

from app.core.database import AsyncSessionFactory
from app.models.models import SyncLog
from app.tasks.celery_app import celery_app


@celery_app.task(name="app.tasks.sync_tasks.cleanup_old_sync_logs")
def cleanup_old_sync_logs(days: int = 30) -> dict:
    """Remove old offline sync logs from the database."""

    import asyncio

    async def _run() -> dict:
        cutoff = datetime.now(datetime.UTC) - timedelta(days=days)
        async with AsyncSessionFactory() as db:
            result = await db.execute(delete(SyncLog).where(SyncLog.created_at < cutoff))
            await db.commit()
            return {"deleted": result.rowcount or 0, "cutoff": cutoff.isoformat()}

    return asyncio.run(_run())
