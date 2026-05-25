"""
SmartPOS AI – Credit Service
Manages credit ledger, repayments, overdue detection, and risk exposure.
"""

from datetime import UTC, datetime
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import (
    AlertSeverity,
    AlertType,
    BusinessAlert,
    Credit,
    CreditRepayment,
    CreditStatus,
    Customer,
)
from app.schemas.schemas import CreditCreate, CreditExposure, RepaymentCreate


class CreditService:

    # ─── Create Credit ────────────────────────────────────────────────────────

    async def create_credit(self, db: AsyncSession, payload: CreditCreate) -> Credit:
        credit = Credit(
            store_id=payload.store_id,
            customer_id=payload.customer_id,
            sale_id=payload.sale_id,
            amount=payload.amount,
            balance=payload.amount,
            due_date=payload.due_date,
            notes=payload.notes,
        )
        db.add(credit)
        await db.flush()

        # Update customer totals
        await self._update_customer_given(db, payload.customer_id, payload.amount)
        return credit

    # ─── Record Repayment ─────────────────────────────────────────────────────

    async def record_repayment(
        self, db: AsyncSession, payload: RepaymentCreate
    ) -> CreditRepayment:
        result = await db.execute(
            select(Credit)
            .where(Credit.id == payload.credit_id)
            .options(selectinload(Credit.repayments))
        )
        credit: Credit | None = result.scalar_one_or_none()

        if not credit:
            raise HTTPException(status_code=404, detail="Credit record not found")
        if credit.status == CreditStatus.PAID:
            raise HTTPException(status_code=400, detail="Credit already fully paid")
        if payload.amount > credit.balance:
            raise HTTPException(
                status_code=400,
                detail=f"Repayment ({payload.amount}) exceeds outstanding balance ({credit.balance})",
            )

        repayment = CreditRepayment(
            credit_id=credit.id,
            amount=payload.amount,
            method=payload.method,
            notes=payload.notes,
        )
        db.add(repayment)

        credit.amount_repaid += payload.amount
        credit.balance       -= payload.amount

        # Update status
        if credit.balance == Decimal("0"):
            credit.status = CreditStatus.PAID
        elif credit.amount_repaid > Decimal("0"):
            credit.status = CreditStatus.PARTIAL

        await self._update_customer_repaid(db, credit.customer_id, payload.amount)
        await db.flush()
        return repayment

    # ─── List Credits ─────────────────────────────────────────────────────────

    async def list_credits(
        self,
        db: AsyncSession,
        store_id: int,
        customer_id: int | None = None,
        status: CreditStatus | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[Credit], int]:
        q = select(Credit).where(Credit.store_id == store_id)

        if customer_id:
            q = q.where(Credit.customer_id == customer_id)
        if status:
            q = q.where(Credit.status == status)

        count_r = await db.execute(select(func.count()).select_from(q.subquery()))
        total   = count_r.scalar()

        result = await db.execute(
            q.order_by(Credit.created_at.desc())
             .offset((page - 1) * page_size)
             .limit(page_size)
        )
        return result.scalars().all(), total

    # ─── Credit Exposure (Analytics) ─────────────────────────────────────────

    async def get_credit_exposure(
        self, db: AsyncSession, store_id: int
    ) -> CreditExposure:
        now = datetime.now(UTC)

        result = await db.execute(
            select(Credit).where(
                Credit.store_id == store_id,
                Credit.status.in_([CreditStatus.OPEN, CreditStatus.PARTIAL, CreditStatus.OVERDUE]),
            )
        )
        credits = result.scalars().all()

        total_outstanding = sum(c.balance for c in credits)
        overdue_credits   = [
            c for c in credits
            if c.due_date and c.due_date < now and c.status != CreditStatus.PAID
        ]
        overdue_amount    = sum(c.balance for c in overdue_credits)

        # Mark overdue
        for c in overdue_credits:
            if c.status != CreditStatus.OVERDUE:
                c.status = CreditStatus.OVERDUE

        # Raise alert if significant overdue
        if overdue_amount > Decimal("0"):
            await self._raise_overdue_alert(db, store_id, overdue_amount, len(overdue_credits))

        customer_ids = {c.customer_id for c in credits}
        overdue_ids  = {c.customer_id for c in overdue_credits}

        return CreditExposure(
            total_outstanding=Decimal(str(total_outstanding)),
            overdue_amount=Decimal(str(overdue_amount)),
            customer_count=len(customer_ids),
            overdue_count=len(overdue_ids),
        )

    # ─── Helpers ──────────────────────────────────────────────────────────────

    async def _update_customer_given(
        self, db: AsyncSession, customer_id: int, amount: Decimal
    ) -> None:
        result = await db.execute(select(Customer).where(Customer.id == customer_id))
        customer = result.scalar_one_or_none()
        if customer:
            customer.total_credit_given += amount

    async def _update_customer_repaid(
        self, db: AsyncSession, customer_id: int, amount: Decimal
    ) -> None:
        result = await db.execute(select(Customer).where(Customer.id == customer_id))
        customer = result.scalar_one_or_none()
        if customer:
            customer.total_credit_repaid += amount

    async def _raise_overdue_alert(
        self, db: AsyncSession, store_id: int, amount: Decimal, count: int
    ) -> None:
        alert = BusinessAlert(
            store_id=store_id,
            alert_type=AlertType.OVERDUE_CREDIT,
            severity=AlertSeverity.HIGH,
            title=f"Overdue Credit: ₹{amount:,.2f} from {count} customer(s)",
            description=(
                f"{count} customer(s) have overdue credit totalling ₹{amount:,.2f}. "
                "Immediate follow-up recommended."
            ),
        )
        db.add(alert)
