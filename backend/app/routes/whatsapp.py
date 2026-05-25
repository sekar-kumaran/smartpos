"""SmartPOS AI – WhatsApp Routes
Send receipts, credit reminders, and check configuration status.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.models import Credit, CreditStatus, Customer, Sale, Store
from app.services.whatsapp_service import WhatsAppService, get_whatsapp

router = APIRouter()


class SendReceiptRequest(BaseModel):
    sale_id: int


class SendReminderRequest(BaseModel):
    credit_id: int


# ─── Status ───────────────────────────────────────────────────────────────────

@router.get("/status")
async def whatsapp_status(_: int = Depends(get_current_user_id)):
    """Check whether WhatsApp is configured (WHATSAPP_TOKEN env present)."""
    svc = get_whatsapp()
    return {"configured": svc.is_configured()}


# ─── Send Receipt ─────────────────────────────────────────────────────────────

@router.post("/send-receipt")
async def send_receipt(
    payload: SendReceiptRequest,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    svc: WhatsAppService = Depends(get_whatsapp),
):
    sale = await db.get(Sale, payload.sale_id)
    if not sale:
        raise HTTPException(404, "Sale not found")

    if not sale.customer_id:
        raise HTTPException(400, "Sale has no linked customer — cannot send receipt")

    customer = await db.get(Customer, sale.customer_id)
    if not customer or not customer.phone:
        raise HTTPException(400, "Customer has no phone number")

    store = await db.get(Store, sale.store_id)
    store_name = store.name if store else "SmartPOS Store"

    sent = await svc.send_receipt(
        phone=customer.phone,
        customer_name=customer.name,
        invoice_number=sale.invoice_number,
        total_amount=sale.total_amount,
        payment_method=sale.payment_method.value,
        store_name=store_name,
    )
    return {"sent": sent, "phone": customer.phone[-4:].rjust(10, "*")}


# ─── Send Credit Reminder ─────────────────────────────────────────────────────

@router.post("/send-reminder")
async def send_credit_reminder(
    payload: SendReminderRequest,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    svc: WhatsAppService = Depends(get_whatsapp),
):
    credit = await db.get(Credit, payload.credit_id)
    if not credit:
        raise HTTPException(404, "Credit not found")

    customer = await db.get(Customer, credit.customer_id)
    if not customer or not customer.phone:
        raise HTTPException(400, "Customer has no phone number")

    store = await db.get(Store, credit.store_id)
    store_name = store.name if store else "SmartPOS Store"

    due_str = credit.due_date.strftime("%d %b %Y") if credit.due_date else None

    sent = await svc.send_credit_reminder(
        phone=customer.phone,
        customer_name=customer.name,
        balance=credit.balance,
        due_date=due_str,
        store_name=store_name,
    )
    return {"sent": sent, "credit_id": credit.id}


# ─── Bulk Overdue Reminders ───────────────────────────────────────────────────

@router.post("/send-overdue-reminders")
async def send_overdue_reminders(
    store_id: int = Query(...),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
    svc: WhatsAppService = Depends(get_whatsapp),
):
    """Send WhatsApp reminders to all customers with overdue credits."""
    store = await db.get(Store, store_id)
    store_name = store.name if store else "SmartPOS Store"

    result = await db.execute(
        select(Credit, Customer).join(Customer, Customer.id == Credit.customer_id).where(
            Credit.store_id == store_id,
            Credit.status == CreditStatus.OVERDUE,
            Customer.phone.isnot(None),
        )
    )
    rows = result.all()

    sent_count = 0
    skipped    = 0
    for credit, customer in rows:
        due_str = credit.due_date.strftime("%d %b %Y") if credit.due_date else None
        ok = await svc.send_credit_reminder(
            phone=customer.phone,
            customer_name=customer.name,
            balance=credit.balance,
            due_date=due_str,
            store_name=store_name,
        )
        if ok:
            sent_count += 1
        else:
            skipped += 1

    return {
        "total_overdue": len(rows),
        "reminders_sent": sent_count,
        "skipped": skipped,
    }
