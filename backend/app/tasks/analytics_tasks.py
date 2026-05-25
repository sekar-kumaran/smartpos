"""Community Edition analytics task placeholders.

Advanced intelligence orchestration is intentionally excluded from the public
repository. These tasks keep Celery bootable for the DevOps demo.
"""

from __future__ import annotations

from celery import shared_task


@shared_task(
    bind=True,
    name="app.tasks.analytics_tasks.run_anomaly_detection_all_stores",
    max_retries=0,
)
def run_anomaly_detection_all_stores(self) -> dict:
    """Public-safe no-op."""
    return {"disabled": True, "stores_processed": 0, "alerts_created": 0}


@shared_task(
    bind=True,
    name="app.tasks.analytics_tasks.send_daily_summary_all_stores",
    max_retries=0,
)
def send_daily_summary_all_stores(self) -> dict:
    """Public-safe no-op."""
    return {"disabled": True, "stores_enqueued": 0}


@shared_task(
    bind=True,
    name="app.tasks.analytics_tasks.generate_store_daily_summary",
    max_retries=0,
)
def generate_store_daily_summary(self, store_id: int) -> dict:
    """Public-safe no-op."""
    return {"disabled": True, "store_id": store_id}


@shared_task(
    bind=True,
    name="app.tasks.analytics_tasks.scan_overdue_credits",
    max_retries=0,
)
def scan_overdue_credits(self) -> dict:
    """Demo-safe placeholder for overdue credit scans."""
    return {"status": "skipped", "reason": "community_edition"}
