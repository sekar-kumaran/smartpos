"""Community Edition analytics service.

This file keeps recruiter-friendly reporting endpoints while excluding
proprietary forecasting, anomaly scoring, and intelligence orchestration.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import BusinessAlert, Product, Sale, SaleItem, SaleStatus
from app.schemas.schemas import (
    DashboardSummary,
    DemandForecastItem,
    InventoryHealth,
    ProfitSummary,
)
from app.services.credit_service import CreditService
from app.services.inventory.service import InventoryService


class AnalyticsService:
    def __init__(self) -> None:
        self._credit_svc = CreditService()
        self._inventory_svc = InventoryService()

    async def get_profit_summary(
        self,
        db: AsyncSession,
        store_id: int,
        start_date: datetime,
        end_date: datetime,
    ) -> ProfitSummary:
        result = await db.execute(
            select(Sale).where(
                Sale.store_id == store_id,
                Sale.status == SaleStatus.COMPLETED,
                Sale.created_at >= start_date,
                Sale.created_at <= end_date,
            )
        )
        sales = result.scalars().all()

        if not sales:
            return ProfitSummary(
                period=f"{start_date.date()} - {end_date.date()}",
                total_revenue=Decimal("0"),
                total_cost=Decimal("0"),
                gross_profit=Decimal("0"),
                gross_margin_pct=0.0,
                total_transactions=0,
                avg_basket_value=Decimal("0"),
            )

        sale_ids = [s.id for s in sales]
        items_result = await db.execute(select(SaleItem).where(SaleItem.sale_id.in_(sale_ids)))
        items = items_result.scalars().all()

        total_revenue = sum(s.total_amount for s in sales)
        total_cost = sum(i.cost_price * i.qty for i in items)
        gross_profit = total_revenue - total_cost
        margin_pct = float(gross_profit / total_revenue * 100) if total_revenue else 0.0

        return ProfitSummary(
            period=f"{start_date.date()} - {end_date.date()}",
            total_revenue=Decimal(str(total_revenue)),
            total_cost=Decimal(str(total_cost)),
            gross_profit=Decimal(str(gross_profit)),
            gross_margin_pct=round(margin_pct, 2),
            total_transactions=len(sales),
            avg_basket_value=Decimal(str(total_revenue / len(sales))),
        )

    async def get_dashboard_summary(self, db: AsyncSession, store_id: int) -> DashboardSummary:
        now = datetime.now(datetime.UTC)
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        profit = await self.get_profit_summary(db, store_id, start, now)
        inventory = await self._inventory_svc.get_health(db, store_id)
        credit = await self._credit_svc.get_credit_exposure(db, store_id)
        alerts = await self._get_recent_alerts(db, store_id, limit=10)

        return DashboardSummary(
            profit=profit,
            inventory=InventoryHealth.model_validate(inventory.model_dump()),
            credit=credit,
            alerts=alerts,
        )

    async def get_revenue_trend(
        self, db: AsyncSession, store_id: int, days: int = 30
    ) -> list[dict[str, Any]]:
        start = datetime.now(datetime.UTC) - timedelta(days=days)
        result = await db.execute(
            select(
                func.date(Sale.created_at).label("day"),
                func.sum(Sale.total_amount).label("revenue"),
                func.count(Sale.id).label("transactions"),
            )
            .where(
                Sale.store_id == store_id,
                Sale.status == SaleStatus.COMPLETED,
                Sale.created_at >= start,
            )
            .group_by(func.date(Sale.created_at))
            .order_by(func.date(Sale.created_at))
        )
        return [
            {"date": str(r.day), "revenue": float(r.revenue), "transactions": r.transactions}
            for r in result.all()
        ]

    async def get_top_products(
        self,
        db: AsyncSession,
        store_id: int,
        start_date: datetime,
        end_date: datetime,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        result = await db.execute(
            select(
                SaleItem.product_id,
                Product.name,
                func.sum(SaleItem.qty).label("total_qty"),
                func.sum(SaleItem.line_total).label("total_revenue"),
                func.sum((SaleItem.unit_price - SaleItem.cost_price) * SaleItem.qty).label(
                    "total_profit"
                ),
            )
            .join(Sale, Sale.id == SaleItem.sale_id)
            .join(Product, Product.id == SaleItem.product_id)
            .where(
                Sale.store_id == store_id,
                Sale.status == SaleStatus.COMPLETED,
                Sale.created_at.between(start_date, end_date),
            )
            .group_by(SaleItem.product_id, Product.name)
            .order_by(func.sum(SaleItem.line_total).desc())
            .limit(limit)
        )
        return [
            {
                "product_id": r.product_id,
                "name": r.name,
                "total_qty": float(r.total_qty),
                "total_revenue": float(r.total_revenue),
                "total_profit": float(r.total_profit),
            }
            for r in result.all()
        ]

    async def get_hourly_heatmap(
        self, db: AsyncSession, store_id: int, days: int = 14
    ) -> list[dict[str, Any]]:
        start = datetime.now(datetime.UTC) - timedelta(days=days)
        result = await db.execute(
            select(
                func.extract("hour", Sale.created_at).label("hour"),
                func.count(Sale.id).label("count"),
                func.sum(Sale.total_amount).label("revenue"),
            )
            .where(
                Sale.store_id == store_id,
                Sale.status == SaleStatus.COMPLETED,
                Sale.created_at >= start,
            )
            .group_by(func.extract("hour", Sale.created_at))
            .order_by(func.extract("hour", Sale.created_at))
        )
        return [
            {
                "hour": int(r.hour),
                "label": f"{int(r.hour):02d}:00",
                "count": r.count,
                "avg_revenue": round(float(r.revenue) / days, 2),
            }
            for r in result.all()
        ]

    async def run_anomaly_detection(self, db: AsyncSession, store_id: int) -> list[BusinessAlert]:
        """Advanced anomaly detection is not included in Community Edition."""
        return []

    async def get_demand_forecast(
        self,
        db: AsyncSession,
        store_id: int,
        days_history: int = 30,
        forecast_days: int = 7,
    ) -> list[DemandForecastItem]:
        """Predictive demand forecasting is not included in Community Edition."""
        return []

    async def _get_recent_alerts(
        self, db: AsyncSession, store_id: int, limit: int = 10
    ) -> list[BusinessAlert]:
        result = await db.execute(
            select(BusinessAlert)
            .where(BusinessAlert.store_id == store_id, BusinessAlert.is_resolved == False)
            .order_by(BusinessAlert.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())
