"""SmartPOS AI – Price Category Routes
Customer tier pricing: Hotel, Wholesale, Distributor, etc.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user_id
from app.models.models import Customer, PriceCategory, Product, ProductPriceTier
from app.schemas.schemas import (
    PriceCategoryCreate, PriceCategoryOut, PriceCategoryUpdate,
    ProductPriceTierCreate, ProductPriceTierOut,
)

router = APIRouter()


# ─── Categories CRUD ─────────────────────────────────────────────────────────

@router.get("", response_model=list[PriceCategoryOut])
async def list_price_categories(
    store_id: int = Query(...),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PriceCategory)
        .where(PriceCategory.store_id == store_id, PriceCategory.is_active == True)
        .order_by(PriceCategory.is_default.desc(), PriceCategory.name)
    )
    return result.scalars().all()


@router.post("", response_model=PriceCategoryOut, status_code=201)
async def create_price_category(
    payload: PriceCategoryCreate,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    # If this is set as default, clear existing default
    if payload.is_default:
        existing = await db.execute(
            select(PriceCategory).where(
                PriceCategory.store_id == payload.store_id,
                PriceCategory.is_default == True,
            )
        )
        for cat in existing.scalars().all():
            cat.is_default = False

    cat = PriceCategory(**payload.model_dump())
    db.add(cat)
    await db.flush()
    await db.refresh(cat)
    return cat


@router.patch("/{category_id}", response_model=PriceCategoryOut)
async def update_price_category(
    category_id: int,
    payload: PriceCategoryUpdate,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    cat = await db.get(PriceCategory, category_id)
    if not cat:
        raise HTTPException(404, "Price category not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(cat, k, v)
    await db.flush()
    await db.refresh(cat)
    return cat


@router.delete("/{category_id}", status_code=204)
async def delete_price_category(
    category_id: int,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    cat = await db.get(PriceCategory, category_id)
    if not cat:
        raise HTTPException(404, "Price category not found")
    if cat.is_default:
        raise HTTPException(400, "Cannot delete the default price category")
    cat.is_active = False
    await db.flush()


# ─── Product Tier Prices ─────────────────────────────────────────────────────

@router.get("/{category_id}/products", response_model=list[ProductPriceTierOut])
async def list_tier_prices(
    category_id: int,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProductPriceTier, Product.name)
        .join(Product, Product.id == ProductPriceTier.product_id)
        .where(ProductPriceTier.price_category_id == category_id)
        .order_by(Product.name)
    )
    rows = result.all()
    out = []
    for tier, product_name in rows:
        item = ProductPriceTierOut.model_validate(tier)
        item.product_name = product_name
        out.append(item)
    return out


@router.post("/{category_id}/products", response_model=ProductPriceTierOut, status_code=201)
async def set_tier_price(
    category_id: int,
    payload: ProductPriceTierCreate,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    # Upsert: if exists, update price; else create
    result = await db.execute(
        select(ProductPriceTier).where(
            ProductPriceTier.price_category_id == category_id,
            ProductPriceTier.product_id == payload.product_id,
        )
    )
    tier = result.scalar_one_or_none()
    if tier:
        tier.price = payload.price
    else:
        tier = ProductPriceTier(
            store_id=payload.store_id,
            price_category_id=category_id,
            product_id=payload.product_id,
            price=payload.price,
        )
        db.add(tier)
    await db.flush()
    await db.refresh(tier)

    product = await db.get(Product, tier.product_id)
    out = ProductPriceTierOut.model_validate(tier)
    out.product_name = product.name if product else None
    return out


@router.delete("/{category_id}/products/{product_id}", status_code=204)
async def remove_tier_price(
    category_id: int,
    product_id: int,
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProductPriceTier).where(
            ProductPriceTier.price_category_id == category_id,
            ProductPriceTier.product_id == product_id,
        )
    )
    tier = result.scalar_one_or_none()
    if tier:
        await db.delete(tier)
        await db.flush()


# ─── Assign Category to Customer ─────────────────────────────────────────────

@router.patch("/assign-customer/{customer_id}", response_model=dict)
async def assign_customer_category(
    customer_id: int,
    category_id: int = Query(..., description="Use 0 to clear the category"),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    customer = await db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")
    customer.price_category_id = category_id if category_id != 0 else None
    await db.flush()
    return {"customer_id": customer_id, "price_category_id": customer.price_category_id}


# ─── Resolve effective price for a product + customer ────────────────────────

@router.get("/effective-price", response_model=dict)
async def get_effective_price(
    product_id:  int = Query(...),
    customer_id: int = Query(...),
    _: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Returns the price that would be used when this customer buys this product."""
    customer = await db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(404, "Customer not found")

    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")

    effective_price = product.selling_price
    category_name = "Standard"

    if customer.price_category_id:
        result = await db.execute(
            select(ProductPriceTier).where(
                ProductPriceTier.price_category_id == customer.price_category_id,
                ProductPriceTier.product_id == product_id,
            )
        )
        tier = result.scalar_one_or_none()
        if tier:
            effective_price = tier.price
            cat = await db.get(PriceCategory, customer.price_category_id)
            category_name = cat.name if cat else "Custom"

    return {
        "product_id":      product_id,
        "customer_id":     customer_id,
        "standard_price":  float(product.selling_price),
        "effective_price": float(effective_price),
        "category_name":   category_name,
        "has_tier_price":  effective_price != product.selling_price,
    }
