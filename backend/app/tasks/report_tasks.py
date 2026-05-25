"""Celery report task placeholders for Phase 1A."""

from __future__ import annotations

from app.tasks.celery_app import celery_app


@celery_app.task(name="app.tasks.report_tasks.generate_daily_report")
def generate_daily_report(store_id: int) -> dict:
    """Placeholder report task so workers can boot in Phase 1A."""

    return {"store_id": store_id, "status": "not_implemented"}
