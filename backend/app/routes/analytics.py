"""SmartPOS AI – Analytics Routes (Phase 1A)"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.models import BusinessAlert, Sale
from app.schemas.schemas import AlertOut, DashboardSummary, DemandForecastItem, ProfitSummary
from app.services.analytics_service import AnalyticsService

router   = APIRouter()
_service = AnalyticsService()


@router.get("/dashboard", response_model=DashboardSummary)
async def dashboard(
    store_id: int = Query(...),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Full dashboard summary: profit, inventory, credit, alerts."""
    return await _service.get_dashboard_summary(db, store_id)


@router.get("/profit", response_model=ProfitSummary)
async def profit_summary(
    store_id:   int      = Query(...),
    start_date: datetime | None = Query(None),
    end_date:   datetime | None = Query(None),
    period: str | None = Query(None, pattern="^(today|week|month)$"),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Profit summary for a date range."""
    now = datetime.now(timezone.utc)
    if period:
        if period == "today":
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "week":
            start_date = now - timedelta(days=7)
        else:
            start_date = now - timedelta(days=30)
        end_date = now
        summary = await _service.get_profit_summary(db, store_id, start_date, end_date)
        summary.period = period
        return summary
    if start_date is None or end_date is None:
        raise HTTPException(status_code=422, detail="start_date/end_date or period is required")
    return await _service.get_profit_summary(db, store_id, start_date, end_date)


@router.get("/revenue-trend", response_model=list)
async def revenue_trend(
    store_id: int = Query(...),
    days:     int = Query(30, ge=7, le=90),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Daily revenue trend for the last N days."""
    return await _service.get_revenue_trend(db, store_id, days)


@router.get("/top-products", response_model=list)
async def top_products(
    store_id:   int      = Query(...),
    start_date: datetime | None = Query(None),
    end_date:   datetime | None = Query(None),
    limit:      int      = Query(10, ge=1, le=50),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Top products by revenue in a date range."""
    now = datetime.now(timezone.utc)
    sd  = start_date or (now - timedelta(days=30))
    ed  = end_date or now
    return await _service.get_top_products(db, store_id, sd, ed, limit)


@router.get("/hourly-heatmap", response_model=list)
async def hourly_heatmap(
    store_id: int = Query(...),
    days:     int = Query(14, ge=7, le=60),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Hourly transaction heatmap."""
    return await _service.get_hourly_heatmap(db, store_id, days)


@router.post("/anomaly-scan", response_model=list)
async def anomaly_scan(
    store_id: int = Query(...),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Run anomaly detection and return any new alerts."""
    if not settings.ENABLE_ADVANCED_ANALYTICS:
        return []
    alerts = await _service.run_anomaly_detection(db, store_id)
    return [
        {
            "id": a.id,
            "type": a.alert_type,
            "severity": a.severity,
            "title": a.title,
        }
        for a in alerts
    ]


@router.post("/run-anomaly-detection")
async def run_anomaly_detection(
    store_id: int = Query(...),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Frontend-friendly anomaly scan endpoint."""
    if not settings.ENABLE_ADVANCED_ANALYTICS:
        return {"alerts_created": 0, "items": []}
    alerts = await _service.run_anomaly_detection(db, store_id)
    return {"alerts_created": len(alerts), "items": [AlertOut.model_validate(a) for a in alerts]}


@router.get("/alerts")
async def list_alerts(
    store_id: int = Query(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    unread_only: bool = Query(False),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Paginated unresolved business alerts for the alerts screen."""
    filters = [
        BusinessAlert.store_id == store_id,
        BusinessAlert.is_resolved.is_(False),
    ]
    if unread_only:
        filters.append(BusinessAlert.is_read.is_(False))

    total = await db.scalar(select(func.count(BusinessAlert.id)).where(*filters))
    result = await db.execute(
        select(BusinessAlert)
        .where(*filters)
        .order_by(BusinessAlert.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = result.scalars().all()
    return {
        "total": total or 0,
        "page": page,
        "page_size": page_size,
        "items": [AlertOut.model_validate(item) for item in items],
    }


@router.patch("/alerts/{alert_id}/read", response_model=AlertOut)
async def mark_alert_read(
    alert_id: int,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    alert = await db.get(BusinessAlert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_read = True
    await db.flush()
    await db.refresh(alert)
    return AlertOut.model_validate(alert)


@router.get("/demand-forecast", response_model=list[DemandForecastItem])
async def demand_forecast(
    store_id:      int = Query(...),
    days_history:  int = Query(30, ge=7, le=90),
    forecast_days: int = Query(7,  ge=1, le=30),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Per-product demand forecast. Returns avg daily velocity, days of stock
    remaining, 7-day prediction, and reorder suggestions.
    """
    if not settings.ENABLE_ADVANCED_ANALYTICS:
        return []
    return await _service.get_demand_forecast(db, store_id, days_history, forecast_days)


class GSTR1Summary(BaseModel):
    period:        str
    total_taxable: float
    total_cgst:    float
    total_sgst:    float
    total_igst:    float
    total_cess:    float
    total_tax:     float
    total_invoice: float
    invoice_count: int
    b2b_count:     int
    b2c_count:     int


@router.get("/gstr1-summary", response_model=GSTR1Summary)
async def gstr1_summary(
    store_id: int    = Query(...),
    period:   str    = Query(..., pattern=r"^\d{4}-\d{2}$", description="YYYY-MM"),
    gstin:    str | None = Query(None),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate sales data for GSTR-1 filing — one row per month."""
    try:
        year, month = int(period[:4]), int(period[5:])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="period must be YYYY-MM") from exc

    start = datetime(year, month, 1, tzinfo=timezone.utc)
    # Last day: first day of next month minus 1 second
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, month + 1, 1, tzinfo=timezone.utc)

    result = await db.execute(
        select(
            func.coalesce(func.sum(Sale.taxable_amount), 0).label("total_taxable"),
            func.coalesce(func.sum(Sale.cgst_amount),    0).label("total_cgst"),
            func.coalesce(func.sum(Sale.sgst_amount),    0).label("total_sgst"),
            func.coalesce(func.sum(Sale.igst_amount),    0).label("total_igst"),
            func.coalesce(func.sum(Sale.cess_amount),    0).label("total_cess"),
            func.coalesce(func.sum(Sale.total_tax),      0).label("total_tax"),
            func.coalesce(func.sum(Sale.total_amount),   0).label("total_invoice"),
            func.count(Sale.id).label("invoice_count"),
            func.count(Sale.customer_id).label("b2b_count"),
        ).where(
            Sale.store_id   == store_id,
            Sale.status     == "completed",
            Sale.created_at >= start,
            Sale.created_at <  end,
        )
    )
    row = result.one()

    b2c_count = max(0, (row.invoice_count or 0) - (row.b2b_count or 0))

    return GSTR1Summary(
        period        = period,
        total_taxable = float(row.total_taxable or 0),
        total_cgst    = float(row.total_cgst    or 0),
        total_sgst    = float(row.total_sgst    or 0),
        total_igst    = float(row.total_igst    or 0),
        total_cess    = float(row.total_cess    or 0),
        total_tax     = float(row.total_tax     or 0),
        total_invoice = float(row.total_invoice or 0),
        invoice_count = int(row.invoice_count   or 0),
        b2b_count     = int(row.b2b_count       or 0),
        b2c_count     = b2c_count,
    )


@router.patch("/alerts/{alert_id}/resolve", response_model=AlertOut)
async def resolve_alert(
    alert_id: int,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    alert = await db.get(BusinessAlert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_read = True
    alert.is_resolved = True
    await db.flush()
    await db.refresh(alert)
    return AlertOut.model_validate(alert)
