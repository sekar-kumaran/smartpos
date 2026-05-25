"""SmartPOS AI – Credit Routes (Phase 1A)"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.models import CreditStatus, Customer, PriceCategory
from app.schemas.schemas import (
    CreditCreate,
    CreditExposure,
    CreditOut,
    CustomerCreate,
    CustomerOut,
    RepaymentCreate,
)
from app.services.credit_service import CreditService

router   = APIRouter()
_service = CreditService()


@router.post("/", response_model=CreditOut, status_code=201)
async def create_credit(
    payload: CreditCreate,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a new credit entry for a customer."""
    credit = await _service.create_credit(db, payload)
    return CreditOut.model_validate(credit)


@router.post("/repay", response_model=dict, status_code=201)
async def record_repayment(
    payload: RepaymentCreate,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Record a repayment against an existing credit."""
    repayment = await _service.record_repayment(db, payload)
    return {
        "id": repayment.id,
        "credit_id": repayment.credit_id,
        "amount": float(repayment.amount),
        "method": repayment.method,
        "message": "Repayment recorded successfully",
    }


@router.get("/", response_model=dict)
async def list_credits(
    store_id:    int                    = Query(...),
    customer_id: int | None         = Query(None),
    status:      CreditStatus | None= Query(None),
    page:        int                    = Query(1, ge=1),
    page_size:   int                    = Query(50, ge=1, le=200),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List credits with optional filters."""
    credits, total = await _service.list_credits(
        db, store_id, customer_id, status, page, page_size
    )
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [CreditOut.model_validate(c) for c in credits],
    }


@router.get("/customers", response_model=dict)
async def list_customers(
    store_id:  int           = Query(...),
    search:    str | None = Query(None),
    page:      int           = Query(1, ge=1),
    page_size: int           = Query(20, ge=1, le=100),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List/search customers for a store (used by billing customer picker)."""
    q = (
        select(Customer, PriceCategory.name.label("cat_name"))
        .outerjoin(PriceCategory, PriceCategory.id == Customer.price_category_id)
        .where(Customer.store_id == store_id, Customer.is_active.is_(True))
    )
    if search:
        term = f"%{search}%"
        q = q.where(or_(Customer.name.ilike(term), Customer.phone.ilike(term)))

    count_r = await db.execute(select(func.count()).select_from(q.subquery()))
    total = count_r.scalar() or 0

    rows = await db.execute(
        q.order_by(Customer.name)
         .offset((page - 1) * page_size)
         .limit(page_size)
    )
    items = []
    for cust, cat_name in rows.all():
        out = CustomerOut.model_validate(cust)
        out.price_category_name = cat_name
        items.append(out)

    return {"total": total, "page": page, "page_size": page_size, "items": items}


@router.post("/customers", response_model=CustomerOut, status_code=201)
async def create_customer(
    payload: CustomerCreate,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a new customer."""
    cust = Customer(
        store_id=payload.store_id,
        name=payload.name,
        phone=payload.phone,
        address=payload.address,
        price_category_id=payload.price_category_id,
    )
    db.add(cust)
    await db.flush()
    await db.refresh(cust)
    out = CustomerOut.model_validate(cust)
    return out


@router.get("/exposure", response_model=CreditExposure)
async def credit_exposure(
    store_id: int = Query(...),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Get credit exposure summary for a store."""
    return await _service.get_credit_exposure(db, store_id)
