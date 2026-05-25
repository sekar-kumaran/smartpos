"""Community Edition notification task placeholders.

Outbound WhatsApp/SMS delivery is not included in the public build. The task
names remain available so Docker and Celery demos start without proprietary
provider logic or credentials.
"""

from __future__ import annotations

from celery import shared_task


@shared_task(name="app.tasks.notification_tasks.send_whatsapp_message")
def send_whatsapp_message(phone_number: str, message: str) -> dict:
    return {"status": "skipped", "reason": "community_edition"}


@shared_task(name="app.tasks.notification_tasks.send_whatsapp_to_store_owner")
def send_whatsapp_to_store_owner(store_id: int, message: str) -> dict:
    return {"status": "skipped", "reason": "community_edition", "store_id": store_id}


@shared_task(name="app.tasks.notification_tasks.send_sms")
def send_sms(phone_number: str, message: str) -> dict:
    return {"status": "skipped", "reason": "community_edition"}


@shared_task(name="app.tasks.notification_tasks.send_credit_reminder")
def send_credit_reminder(credit_id: int) -> dict:
    return {"status": "skipped", "reason": "community_edition", "credit_id": credit_id}
