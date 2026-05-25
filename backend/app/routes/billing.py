"""SmartPOS AI – Billing Routes (Phase 1A) — see services/billing/service.py"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.schemas.billing import (
    CreateSaleRequest,
    GSTINValidateRequest,
    GSTINValidateResponse,
    OfflineSyncPayload,
    OfflineSyncResponse,
    SaleOut,
    TaxPreviewRequest,
    TaxPreviewResponse,
)
from app.services.billing.service import BillingService
from app.services.gst.calculator import STATE_CODES, make_calculator, validate_gstin

router   = APIRouter()
_service = BillingService()

@router.post("/sales", response_model=SaleOut, status_code=201)
async def create_sale(payload: CreateSaleRequest, user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """Create GST-compliant sale with FIFO stock deduction."""
    sale = await _service.create_sale(
        db=db, store_id=payload.store_id, cashier_id=user_id,
        items=[i.model_dump() for i in payload.items],
        payment_method=payload.payment_method, customer_id=payload.customer_id,
        overall_discount=payload.overall_discount, amount_paid=payload.amount_paid,
        notes=payload.notes, local_id=payload.local_id,
        payment_splits=([s.model_dump() for s in payload.payment_splits] if payload.payment_splits else None),
    )
    return await _service.get_sale(db, sale.id)

@router.post("/tax-preview", response_model=TaxPreviewResponse)
async def tax_preview(payload: TaxPreviewRequest, _: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """Live GST computation without creating a sale — for cart UI."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from app.models.models import Customer, ProductVariant, Store
    store_r = await db.execute(select(Store).where(Store.id == payload.store_id))
    store   = store_r.scalar_one_or_none()
    if not store:
        raise HTTPException(404, "Store not found")
    customer_state = customer_gstin = None
    if payload.customer_id:
        cr = await db.execute(select(Customer).where(Customer.id == payload.customer_id))
        c  = cr.scalar_one_or_none()
        if c:
            customer_state, customer_gstin = c.state_code, c.gstin
    gst_calc   = make_calculator(store.state_code, customer_state, customer_gstin, is_composition=(store.gst_regime.value == "composite"))
    items_out  = []
    breakdowns = []
    for item in payload.items:
        vr = await db.execute(select(ProductVariant).where(ProductVariant.id == item.variant_id).options(selectinload(ProductVariant.product)))
        v  = vr.scalar_one_or_none()
        if not v:
            continue
        p         = v.product
        eff_price = Decimal(str(item.unit_price)) if item.unit_price else (v.selling_price or p.selling_price)
        bd        = gst_calc.compute_line_item(base_price=eff_price, qty=item.qty, gst_rate=Decimal(p.gst_rate.value), discount=item.discount, cess_rate=p.cess_rate, price_inclusive=p.price_includes_tax, hsn_code=item.hsn_code or p.hsn_code)
        breakdowns.append(bd)
        items_out.append({"variant_id": item.variant_id, "product_name": p.name, "qty": item.qty, "unit_price": eff_price, "taxable_value": bd.taxable_value, "gst_breakdown": bd.to_dict(), "line_total": bd.line_total})
    s = gst_calc.compute_invoice(breakdowns, payload.overall_discount)
    return TaxPreviewResponse(supply_type=gst_calc.supply_type, items=items_out, subtotal=s.taxable_amount + payload.overall_discount, total_discount=payload.overall_discount, taxable_amount=s.taxable_amount, cgst_total=s.cgst_total, sgst_total=s.sgst_total, igst_total=s.igst_total, cess_total=s.cess_total, total_tax=s.total_tax, round_off=s.round_off, grand_total=s.grand_total, rate_wise_breakdown={k: {sk: float(sv) for sk, sv in v.items()} for k, v in s.rate_wise.items()})

@router.post("/validate-gstin", response_model=GSTINValidateResponse)
async def validate_gstin_ep(payload: GSTINValidateRequest, _: int = Depends(get_current_user_id)):
    """Validate GSTIN format and checksum."""
    is_valid, error = validate_gstin(payload.gstin)
    sc = payload.gstin[:2] if is_valid else None
    return GSTINValidateResponse(gstin=payload.gstin.upper(), is_valid=is_valid, state_code=sc, state_name=STATE_CODES.get(sc) if sc else None, error=error if not is_valid else None)

@router.get("/sales", response_model=dict)
async def list_sales(store_id: int = Query(...), start_date: datetime | None = Query(None), end_date: datetime | None = Query(None), customer_id: int | None = Query(None), page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200), _: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    sales, total = await _service.list_sales(db, store_id, start_date, end_date, customer_id, page, page_size)
    return {"total": total, "page": page, "page_size": page_size, "items": [SaleOut.model_validate(s) for s in sales]}

@router.get("/sales/{sale_id}", response_model=SaleOut)
async def get_sale(sale_id: int, _: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    return await _service.get_sale(db, sale_id)

@router.patch("/sales/{sale_id}/void", response_model=SaleOut)
async def void_sale(sale_id: int, user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    sale = await _service.void_sale(db, sale_id, voided_by_id=user_id)
    return await _service.get_sale(db, sale.id)

@router.post("/sync", response_model=OfflineSyncResponse)
async def sync_offline(payload: OfflineSyncPayload, user_id: int = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """Batch sync offline sales from device. Idempotent via local_id dedup."""
    invoices, errors, skipped = [], [], 0
    for sd in payload.sales:
        try:
            sale = await _service.create_sale(db=db, store_id=payload.store_id, cashier_id=user_id, items=[i.model_dump() for i in sd.items], payment_method=sd.payment_method, customer_id=sd.customer_id, overall_discount=sd.overall_discount, amount_paid=sd.amount_paid, notes=sd.notes, local_id=sd.local_id)
            invoices.append(sale.invoice_number)
        except Exception as exc:
            if "409" in str(exc) or "already recorded" in str(exc).lower():
                skipped += 1
            else:
                errors.append({"local_id": sd.local_id, "error": str(exc)})
    from app.models.models import SyncLog
    db.add(SyncLog(store_id=payload.store_id, device_id=payload.device_id, records_sent=len(payload.sales), records_recv=len(invoices), conflicts=skipped, status="success" if not errors else "partial"))
    return OfflineSyncResponse(device_id=payload.device_id, synced=len(invoices), skipped=skipped, failed=len(errors), invoices=invoices, errors=errors)
