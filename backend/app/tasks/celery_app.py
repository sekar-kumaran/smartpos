"""Celery application for the Community Edition demo stack.

The public build keeps a simple worker setup for DevOps demonstration. Advanced
production routing, scaling, monitoring, and intelligence schedules are not
included.
"""

from __future__ import annotations

from celery import Celery
from celery.schedules import crontab
from kombu import Exchange, Queue

from app.core.config import settings

celery_app = Celery(
    "smartpos-community",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_URL,
    include=[
        "app.tasks.analytics_tasks",
        "app.tasks.notification_tasks",
        "app.tasks.sync_tasks",
        "app.tasks.report_tasks",
        "app.tasks.inventory_tasks",
    ],
)

default_exchange = Exchange("default", type="direct")

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Kolkata",
    enable_utc=True,
    result_expires=86400,
    task_acks_late=True,
    task_time_limit=300,
    task_soft_time_limit=240,
    worker_prefetch_multiplier=1,
    task_default_queue="default",
    task_default_exchange="default",
    task_default_routing_key="default",
)

celery_app.conf.task_queues = (
    Queue("default", default_exchange, routing_key="default"),
    Queue("reports", default_exchange, routing_key="reports"),
    Queue("sync", default_exchange, routing_key="sync"),
    Queue("notifications", default_exchange, routing_key="notifications"),
)

celery_app.conf.task_routes = {
    "app.tasks.report_tasks.*": {"queue": "reports"},
    "app.tasks.sync_tasks.*": {"queue": "sync"},
    "app.tasks.notification_tasks.*": {"queue": "notifications"},
}

celery_app.conf.beat_schedule = {
    "db-cleanup-nightly": {
        "task": "app.tasks.sync_tasks.cleanup_old_sync_logs",
        "schedule": crontab(hour=2, minute=0),
        "options": {"queue": "sync"},
    },
}
