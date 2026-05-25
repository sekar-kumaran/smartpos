"""SmartPOS AI – Shift Management Routes
Open / close shifts, real-time running totals, cash reconciliation report.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.models import (
    PaymentMethod,
    Sale,
    SaleStatus,
    ShiftSession,
    ShiftStatus,
    User,
)
from app.schemas.schemas import ShiftCloseRequest, ShiftOpenRequest, ShiftOut

router = APIRouter()


def _to_out(shift: ShiftSession, user_name: str | None = None) -> ShiftOut:
    out = ShiftOut.model_validate(shift)
    out.opened_by_name = user_name
    if shift.closing_cash is not None and shift.expected_cash is not None:
        out.cash_variance = shift.closing_cash - shift.expected_cash
    return out


async def _refresh_totals(db: AsyncSession, shift: ShiftSession) -> None:
    """Recompute running sales totals from the sales table."""
    result = await db.execute(
        select(
            func.count(Sale.id).label("cnt"),
            func.sum(Sale.total_amount).label("revenue"),
            func.sum(
                case((Sale.payment_method == PaymentMethod.CASH,  Sale.total_amount), else_=0)
            ).label("cash"),
            func.sum(
                case((Sale.payment_method == PaymentMethod.UPI,   Sale.total_amount), else_=0)
            ).label("upi"),
            func.sum(
                case((Sale.payment_method == PaymentMethod.CARD,  Sale.total_amount), else_=0)
            ).label("card"),
            func.sum(
                case((Sale.payment_method == PaymentMethod.CREDIT, Sale.total_amount), else_=0)
            ).label("credit"),
        ).where(
            Sale.shift_id == shift.id,
            Sale.status == SaleStatus.COMPLETED,
        )
    )
    row = result.one()
    shift.total_sales   = row.cnt or 0
    shift.total_revenue = row.revenue or Decimal("0")
    shift.cash_sales    = row.cash    or Decimal("0")
    shift.upi_sales     = row.upi     or Decimal("0")
    shift.card_sales    = row.card    or Decimal("0")
    shift.credit_sales  = row.credit  or Decimal("0")
    shift.expected_cash = shift.opening_cash + shift.cash_sales


# ─── Open Shift ───────────────────────────────────────────────────────────────

@router.post("/open", response_model=ShiftOut, status_code=201)
async def open_shift(
    payload: ShiftOpenRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    # Block if an open shift already exists for this store+user
    existing = await db.execute(
        select(ShiftSession).where(
            ShiftSession.store_id == payload.store_id,
            ShiftSession.opened_by_id == user_id,
            ShiftSession.status == ShiftStatus.OPEN,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "You already have an open shift. Close it before opening a new one.")

    shift = ShiftSession(
        store_id=payload.store_id,
        opened_by_id=user_id,
        opening_cash=payload.opening_cash,
        notes=payload.notes,
    )
    db.add(shift)
    await db.flush()
    await db.refresh(shift)

    user = await db.get(User, user_id)
    return _to_out(shift, user.name if user else None)


# ─── Current Open Shift ───────────────────────────────────────────────────────

@router.get("/current", response_model=ShiftOut | None)
async def current_shift(
    store_id: int = Query(...),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ShiftSession).where(
            ShiftSession.store_id == store_id,
            ShiftSession.opened_by_id == user_id,
            ShiftSession.status == ShiftStatus.OPEN,
        ).order_by(ShiftSession.opened_at.desc()).limit(1)
    )
    shift = result.scalar_one_or_none()
    if not shift:
        return None
    await _refresh_totals(db, shift)
    await db.flush()
    user = await db.get(User, user_id)
    return _to_out(shift, user.name if user else None)


# ─── Close Shift ──────────────────────────────────────────────────────────────

@router.post("/{shift_id}/close", response_model=ShiftOut)
async def close_shift(
    shift_id: int,
    payload: ShiftCloseRequest,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    shift = await db.get(ShiftSession, shift_id)
    if not shift:
        raise HTTPException(404, "Shift not found")
    if shift.status == ShiftStatus.CLOSED:
        raise HTTPException(400, "Shift is already closed")

    await _refresh_totals(db, shift)

    shift.closed_by_id  = user_id
    shift.closed_at     = datetime.now(timezone.utc)
    shift.closing_cash  = payload.closing_cash
    shift.status        = ShiftStatus.CLOSED
    if payload.notes:
        shift.notes = payload.notes

    await db.flush()
    await db.refresh(shift)

    user = await db.get(User, shift.opened_by_id)
    return _to_out(shift, user.name if user else None)


# ─── Shift History ────────────────────────────────────────────────────────────

@router.get("", response_model=dict)
async def list_shifts(
    store_id:  int = Query(...),
    page:      int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    base_q = select(ShiftSession).where(ShiftSession.store_id == store_id)
    total  = await db.scalar(select(func.count()).select_from(base_q.subquery()))

    result = await db.execute(
        base_q.order_by(ShiftSession.opened_at.desc())
              .offset((page - 1) * page_size)
              .limit(page_size)
    )
    shifts = result.scalars().all()

    items = []
    for s in shifts:
        user = await db.get(User, s.opened_by_id)
        items.append(_to_out(s, user.name if user else None))

    return {"total": total or 0, "page": page, "page_size": page_size, "items": items}


# ─── Single Shift Report ──────────────────────────────────────────────────────

@router.get("/{shift_id}", response_model=ShiftOut)
async def get_shift(
    shift_id: int,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    shift = await db.get(ShiftSession, shift_id)
    if not shift:
        raise HTTPException(404, "Shift not found")
    if shift.status == ShiftStatus.OPEN:
        await _refresh_totals(db, shift)
        await db.flush()
    user = await db.get(User, shift.opened_by_id)
    return _to_out(shift, user.name if user else None)
