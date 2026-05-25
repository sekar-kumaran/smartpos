"""
SmartPOS AI – Inventory Routes (Phase 1A)
Products · Variants · Batches · Suppliers · Purchase Orders · Stock Movements
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.models import (
    Category, POStatus, Product, ProductVariant,
    PurchaseOrder, PurchaseOrderItem, StockBatch, Supplier,
)
from app.schemas.inventory import (
    BatchOut, BatchReceive,
    CategoryCreate, CategoryOut,
    InventoryHealth,
    POCreate, POOut,
    ProductCreate, ProductOut, ProductUpdate,
    StockAdjustment, StockMovementOut,
    SupplierCreate, SupplierOut,
    VariantCreate, VariantOut,
)
from app.services.inventory.service import InventoryService

router   = APIRouter()
_service = InventoryService()


# ── Categories ────────────────────────────────────────────────────────────────

@router.post("/categories", response_model=CategoryOut, status_code=201)
async def create_category(
    payload: CategoryCreate,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    cat = Category(**payload.model_dump())
    db.add(cat)
    await db.flush()
    return cat


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(
    store_id: int = Query(...),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Category)
        .where(Category.store_id == store_id)
        .order_by(Category.sort_order, Category.name)
    )
    return result.scalars().all()


# ── Products ──────────────────────────────────────────────────────────────────

@router.post("/products", response_model=ProductOut, status_code=201)
async def create_product(
    payload: ProductCreate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Create product + default variant. Opening stock movement auto-created."""
    product = await _service.create_product(
        db, payload.model_dump(), created_by_id=user_id
    )
    result = await db.execute(
        select(Product)
        .where(Product.id == product.id)
        .options(selectinload(Product.variants))
    )
    product = result.scalar_one()
    return _enrich_product(product)


@router.get("/products", response_model=dict)
async def list_products(
    store_id:       int           = Query(...),
    search:         Optional[str] = Query(None),
    category_id:    Optional[int] = Query(None),
    low_stock_only: bool          = Query(False),
    page:           int           = Query(1, ge=1),
    page_size:      int           = Query(50, ge=1, le=200),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    products, total = await _service.list_products(
        db, store_id, search, category_id, low_stock_only, page, page_size
    )
    return {
        "total": total, "page": page, "page_size": page_size,
        "items": [_enrich_product(p) for p in products],
    }


@router.get("/products/{product_id}", response_model=ProductOut)
async def get_product(
    product_id: int,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    return _enrich_product(await _service.get_product(db, product_id))


@router.patch("/products/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: int,
    payload: ProductUpdate,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Product)
        .where(Product.id == product_id)
        .options(selectinload(Product.variants))
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "Product not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(product, field, value)
    return _enrich_product(product)


@router.delete("/products/{product_id}", status_code=204)
async def soft_delete_product(
    product_id: int,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(404, "Product not found")
    product.is_active = False
    await db.flush()


# ── Variants ──────────────────────────────────────────────────────────────────

@router.post("/variants", response_model=VariantOut, status_code=201)
async def add_variant(
    payload: VariantCreate,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Add a size/colour/weight variant to a product."""
    return await _service.add_variant(
        db=db,
        product_id=payload.product_id,
        store_id=payload.store_id,
        variant_name=payload.variant_name,
        attributes=payload.attributes or {},
        cost_price=payload.cost_price,
        selling_price=payload.selling_price,
        barcode=payload.barcode,
    )


@router.get("/variants/{variant_id}", response_model=VariantOut)
async def get_variant(
    variant_id: int,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProductVariant).where(ProductVariant.id == variant_id)
    )
    v = result.scalar_one_or_none()
    if not v:
        raise HTTPException(404, "Variant not found")
    return v


# ── Batches ───────────────────────────────────────────────────────────────────

@router.post("/batches", response_model=BatchOut, status_code=201)
async def receive_batch(
    payload: BatchReceive,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Receive a stock batch with expiry date and batch number.
    Enables FIFO deduction and expiry alerts automatically.
    """
    return await _service.receive_stock_batch(
        db=db,
        variant_id=payload.variant_id,
        store_id=payload.store_id,
        batch_number=payload.batch_number,
        quantity=payload.quantity,
        purchase_price=payload.purchase_price,
        expiry_date=payload.expiry_date,
        manufacture_date=payload.manufacture_date,
        mrp=payload.mrp,
        supplier_id=payload.supplier_id,
        created_by_id=user_id,
    )


@router.get("/batches", response_model=dict)
async def list_batches(
    variant_id:  int  = Query(...),
    active_only: bool = Query(True),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """List batches for a variant in FIFO order (earliest expiry first)."""
    q = select(StockBatch).where(StockBatch.variant_id == variant_id)
    if active_only:
        q = q.where(StockBatch.is_active == True, StockBatch.qty_remaining > 0)
    q = q.order_by(
        StockBatch.expiry_date.asc().nullslast(),
        StockBatch.received_at.asc(),
    )
    result  = await db.execute(q)
    batches = result.scalars().all()
    return {
        "variant_id":    variant_id,
        "total_batches": len(batches),
        "items": [BatchOut.model_validate(b) for b in batches],
    }


# ── Stock Management ─────────────────────────────────────────────────────────

@router.post("/stock/adjust", response_model=VariantOut)
async def adjust_stock(
    payload: StockAdjustment,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Manual stock adjustment. Creates an immutable movement record."""
    from decimal import Decimal
    variant_id = payload.variant_id
    if variant_id is None and payload.product_id is not None:
        result = await db.execute(
            select(ProductVariant.id)
            .where(ProductVariant.product_id == payload.product_id, ProductVariant.is_active == True)
            .order_by(ProductVariant.id)
            .limit(1)
        )
        variant_id = result.scalar_one_or_none()
    if variant_id is None:
        raise HTTPException(400, "variant_id or product_id is required")
    return await _service.manual_adjustment(
        db=db,
        variant_id=variant_id,
        store_id=payload.store_id,
        delta=Decimal(str(payload.delta)),
        reason=payload.reason,
        created_by_id=user_id,
    )


@router.get("/stock/movements", response_model=dict)
async def stock_movements(
    store_id:   int           = Query(...),
    variant_id: Optional[int] = Query(None),
    page:       int           = Query(1, ge=1),
    page_size:  int           = Query(50, ge=1, le=200),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Full stock movement ledger — every inventory change recorded here."""
    movements, total = await _service.get_stock_movements(
        db, store_id, variant_id, page, page_size
    )
    return {
        "total": total, "page": page, "page_size": page_size,
        "items": [StockMovementOut.model_validate(m) for m in movements],
    }


@router.get("/health", response_model=InventoryHealth)
async def inventory_health(
    store_id: int = Query(...),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Inventory health summary — stock counts and total value."""
    return await _service.get_health(db, store_id)


# ── Suppliers ─────────────────────────────────────────────────────────────────

@router.post("/suppliers", response_model=SupplierOut, status_code=201)
async def create_supplier(
    payload: SupplierCreate,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    supplier = Supplier(**payload.model_dump())
    db.add(supplier)
    await db.flush()
    return supplier


@router.get("/suppliers", response_model=dict)
async def list_suppliers(
    store_id:  int = Query(...),
    page:      int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    q = select(Supplier).where(
        Supplier.store_id == store_id, Supplier.is_active == True
    )
    count_r = await db.execute(select(func.count()).select_from(q.subquery()))
    total   = count_r.scalar() or 0
    result  = await db.execute(
        q.order_by(Supplier.name)
         .offset((page - 1) * page_size).limit(page_size)
    )
    return {
        "total": total, "page": page, "page_size": page_size,
        "items": [SupplierOut.model_validate(s) for s in result.scalars().all()],
    }


# ── Purchase Orders ───────────────────────────────────────────────────────────

@router.post("/purchase-orders", response_model=POOut, status_code=201)
async def create_purchase_order(
    payload: POCreate,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a purchase order. Stock updated when marked RECEIVED."""
    from datetime import datetime, timezone
    from decimal import Decimal

    today   = datetime.now(timezone.utc).strftime("%Y%m%d")
    cnt_res = await db.execute(
        select(func.count(PurchaseOrder.id))
        .where(PurchaseOrder.store_id == payload.store_id)
    )
    count     = (cnt_res.scalar() or 0) + 1
    po_number = f"PO-{payload.store_id}-{today}-{count:04d}"

    subtotal = tax_amount = Decimal("0")

    po = PurchaseOrder(
        store_id=payload.store_id,
        supplier_id=payload.supplier_id,
        po_number=po_number,
        expected_date=payload.expected_date,
        notes=payload.notes,
        created_by_id=user_id,
    )
    db.add(po)
    await db.flush()

    for item in payload.items:
        line   = item.qty_ordered * item.unit_price
        tax    = line * (item.gst_rate / 100)
        subtotal   += line
        tax_amount += tax
        db.add(PurchaseOrderItem(
            po_id=po.id, variant_id=item.variant_id,
            qty_ordered=item.qty_ordered, unit_price=item.unit_price,
            gst_rate=item.gst_rate, line_total=line + tax,
        ))

    po.subtotal     = subtotal
    po.tax_amount   = tax_amount
    po.total_amount = subtotal + tax_amount
    await db.flush()

    result = await db.execute(
        select(PurchaseOrder).where(PurchaseOrder.id == po.id)
        .options(selectinload(PurchaseOrder.items))
    )
    return result.scalar_one()


@router.post("/purchase-orders/{po_id}/receive", response_model=POOut)
async def receive_purchase_order(
    po_id:   int,
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """
    Receive a PO — creates stock batches and updates variant quantities.
    """
    from datetime import datetime, timezone

    result = await db.execute(
        select(PurchaseOrder)
        .where(PurchaseOrder.id == po_id)
        .options(selectinload(PurchaseOrder.items))
    )
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(404, "Purchase order not found")
    if po.status == POStatus.RECEIVED:
        raise HTTPException(400, "PO is already received")

    for item in po.items:
        qty = item.qty_ordered - item.qty_received
        if qty <= 0:
            continue
        await _service.receive_stock_batch(
            db=db,
            variant_id=item.variant_id,
            store_id=po.store_id,
            batch_number=f"{po.po_number}-L{item.id}",
            quantity=qty,
            purchase_price=item.unit_price,
            supplier_id=po.supplier_id,
            po_item_id=item.id,
            created_by_id=user_id,
        )
        item.qty_received = item.qty_ordered

    po.status        = POStatus.RECEIVED
    po.received_date = datetime.now(timezone.utc)
    return po


@router.get("/purchase-orders", response_model=dict)
async def list_purchase_orders(
    store_id:  int           = Query(...),
    status:    Optional[str] = Query(None),
    page:      int           = Query(1, ge=1),
    page_size: int           = Query(50, ge=1, le=200),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    q = select(PurchaseOrder).where(PurchaseOrder.store_id == store_id)
    if status:
        q = q.where(PurchaseOrder.status == status)
    count_r = await db.execute(select(func.count()).select_from(q.subquery()))
    total   = count_r.scalar() or 0
    result  = await db.execute(
        q.options(selectinload(PurchaseOrder.items))
         .order_by(PurchaseOrder.created_at.desc())
         .offset((page - 1) * page_size).limit(page_size)
    )
    return {
        "total": total, "page": page, "page_size": page_size,
        "items": [POOut.model_validate(po) for po in result.scalars().all()],
    }


# ─── Helper ────────────────────────────────────────────────────────────────────

def _enrich_product(product: Product) -> ProductOut:
    out = ProductOut.model_validate(product)
    if product.variants:
        total_stock = sum(v.stock_qty for v in product.variants if v.is_active)
        out.total_stock = float(total_stock)
        out.stock_qty = float(total_stock)
    out.tax_rate = float(product.gst_rate.value)
    sell = float(product.selling_price)
    cost = float(product.cost_price)
    out.margin_pct = round((sell - cost) / sell * 100, 2) if sell else 0.0
    return out
