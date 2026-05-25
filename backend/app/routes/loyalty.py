"""SmartPOS AI – Loyalty Routes
GET /loyalty/config        — store loyalty programme configuration
GET /loyalty/customers     — customer leaderboard with tier + redeemable value
POST /loyalty/award        — manually award bonus points
"""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.models import Customer

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class LoyaltyConfig(BaseModel):
    enabled:               bool  = True
    points_per_rupee:      float = 0.1
    rupees_per_point:      float = 0.1
    min_redemption_points: int   = 100
    max_redemption_pct:    int   = 20


class CustomerLoyaltyOut(BaseModel):
    customer_id:      int
    customer_name:    str
    phone:            str | None
    total_points:     int
    redeemed_points:  int
    available_points: int
    tier:             str
    total_spent:      float
    last_txn_date:    str | None


class CustomerLoyaltyPage(BaseModel):
    total: int
    items: list[CustomerLoyaltyOut]


# ─── Tier logic ───────────────────────────────────────────────────────────────

def _tier(total_spent: Decimal) -> str:
    s = float(total_spent)
    if s >= 50_000:
        return "platinum"
    if s >= 25_000:
        return "gold"
    if s >= 10_000:
        return "silver"
    return "bronze"


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/config", response_model=LoyaltyConfig)
async def get_loyalty_config(
    store_id: int = Query(...),
    _: int = Depends(get_current_user_id),
):
    """Return the store's loyalty programme settings (currently global defaults)."""
    return LoyaltyConfig()


@router.get("/customers", response_model=CustomerLoyaltyPage)
async def loyalty_customers(
    store_id:  int = Query(...),
    page_size: int = Query(100, ge=1, le=500),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Return customers sorted by available loyalty points, highest first."""
    result = await db.execute(
        select(Customer)
        .where(
            Customer.store_id == store_id,
            Customer.is_active.is_(True),
        )
        .order_by(Customer.loyalty_points.desc())
        .limit(page_size)
    )
    customers = list(result.scalars().all())
    items: list[CustomerLoyaltyOut] = []
    for c in customers:
        pts = c.loyalty_points
        last_date: str | None = None
        if c.last_purchase_at:
            last_date = c.last_purchase_at.strftime("%Y-%m-%d")

        items.append(CustomerLoyaltyOut(
            customer_id      = c.id,
            customer_name    = c.name,
            phone            = c.phone,
            total_points     = pts,
            redeemed_points  = 0,
            available_points = pts,
            tier             = _tier(c.total_spent or Decimal(0)),
            total_spent      = float(c.total_spent or 0),
            last_txn_date    = last_date,
        ))

    return CustomerLoyaltyPage(total=len(items), items=items)
