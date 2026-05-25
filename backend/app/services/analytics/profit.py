"""SmartPOS AI – Profit Analytics Service (Phase 1A)"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Sale, SaleItem, SaleStatus


@dataclass
class ProfitSummaryResult:
    period:             str
    total_revenue:      Decimal
    total_cost:         Decimal
    gross_profit:       Decimal
    gross_margin_pct:   float
    total_transactions: int
    avg_basket_value:   Decimal


class ProfitService:

    async def get_summary(
        self,
        db: AsyncSession,
        store_id: int,
        start: datetime,
        end: datetime,
    ) -> ProfitSummaryResult:
        period_label = f"{start.date()} – {end.date()}"

        result = await db.execute(
            select(Sale).where(
                Sale.store_id  == store_id,
                Sale.status    == SaleStatus.COMPLETED,
                Sale.created_at.between(start, end),
            )
        )
        sales = result.scalars().all()

        if not sales:
            zero = Decimal("0")
            return ProfitSummaryResult(period_label, zero, zero, zero, 0.0, 0, zero)

        sale_ids = [s.id for s in sales]
        items_r  = await db.execute(
            select(SaleItem).where(SaleItem.sale_id.in_(sale_ids))
        )
        items = items_r.scalars().all()

        revenue = sum(s.total_amount for s in sales)
        cost    = sum(i.cost_price * i.qty for i in items)
        profit  = revenue - cost
        margin  = float(profit / revenue * 100) if revenue else 0.0

        return ProfitSummaryResult(
            period=period_label,
            total_revenue=Decimal(str(revenue)),
            total_cost=Decimal(str(cost)),
            gross_profit=Decimal(str(profit)),
            gross_margin_pct=round(margin, 2),
            total_transactions=len(sales),
            avg_basket_value=Decimal(str(revenue / len(sales))),
        )
