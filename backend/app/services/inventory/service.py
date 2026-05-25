"""
SmartPOS AI – Inventory Service (Phase 1A)

Handles product variants, batch/lot tracking, FIFO stock deduction,
stock movements ledger, and purchase order receiving.
"""

from __future__ import annotations

import logging
from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import (
    AlertSeverity,
    AlertType,
    BusinessAlert,
    Product,
    ProductVariant,
    StockBatch,
    StockMovement,
    StockMovementType,
    Store,
)

logger = logging.getLogger("smartpos.inventory")

# Re-export InventoryHealth from schemas so callers can import from here
from app.schemas.inventory import InventoryHealth  # noqa: E402


class InventoryService:
    """
    Single entry point for all inventory operations.
    All stock mutations go through this service so the movement ledger
    stays consistent.
    """

    # ─── Products ─────────────────────────────────────────────────────────────

    async def create_product(
        self, db: AsyncSession, payload: dict, created_by_id: int
    ) -> Product:
        """
        Create a product. If has_variants=False, auto-creates one Default variant.
        """
        # Check SKU uniqueness
        if payload.get("sku"):
            exists = await db.execute(
                select(Product).where(
                    Product.store_id == payload["store_id"],
                    Product.sku == payload["sku"],
                )
            )
            if exists.scalar_one_or_none():
                raise HTTPException(400, f"SKU '{payload['sku']}' already exists in this store")

        store = await db.scalar(select(Store).where(Store.id == payload["store_id"]))
        if not store:
            db.add(Store(id=payload["store_id"], name=f"Store {payload['store_id']}", state_code="29"))
            await db.flush()

        opening_qty = Decimal(str(payload.pop("opening_stock", 0)))
        payload.pop("stock_qty", None)
        payload.pop("tax_rate", None)
        product = Product(**payload, created_by_id=created_by_id)
        db.add(product)
        await db.flush()  # get product.id

        # Always create at least one variant ("Default")
        default_variant = ProductVariant(
            product_id=product.id,
            store_id=product.store_id,
            variant_name="Default",
            stock_qty=opening_qty,
        )
        db.add(default_variant)
        await db.flush()

        # Record opening stock movement
        if opening_qty > 0:
            await self._record_movement(
                db=db,
                store_id=product.store_id,
                variant=default_variant,
                movement_type=StockMovementType.OPENING_STOCK,
                qty_delta=opening_qty,
                reference_type="product",
                reference_id=product.id,
                reason="Opening stock on product creation",
            )

        logger.info("Product created: %s (id=%d)", product.name, product.id)
        return product

    async def get_product(self, db: AsyncSession, product_id: int) -> Product:
        result = await db.execute(
            select(Product)
                .where(Product.id == product_id, Product.is_active.is_(True))
            .options(selectinload(Product.variants))
        )
        product = result.scalar_one_or_none()
        if not product:
            raise HTTPException(404, "Product not found")
        return product

    async def list_products(
        self,
        db: AsyncSession,
        store_id: int,
        search: str | None = None,
        category_id: int | None = None,
        low_stock_only: bool = False,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[Product], int]:
        q = (
            select(Product)
                .where(Product.store_id == store_id, Product.is_active.is_(True))
            .options(selectinload(Product.variants))
        )
        if search:
            p = f"%{search}%"
            q = q.where(
                Product.name.ilike(p)
                | Product.sku.ilike(p)
                | Product.default_barcode.ilike(p)
            )
        if category_id:
            q = q.where(Product.category_id == category_id)

        count_r = await db.execute(select(func.count()).select_from(q.subquery()))
        total   = count_r.scalar() or 0

        result = await db.execute(
            q.order_by(Product.name)
             .offset((page - 1) * page_size)
             .limit(page_size)
        )
        products = result.scalars().all()

        if low_stock_only:
            # Filter after fetch (variant stock is not a single column)
            products = [
                p for p in products
                if any(v.stock_qty <= p.min_stock_qty for v in p.variants)
            ]

        return products, total

    # ─── Variants ─────────────────────────────────────────────────────────────

    async def add_variant(
        self,
        db: AsyncSession,
        product_id: int,
        store_id: int,
        variant_name: str,
        attributes: dict,
        cost_price: Decimal | None = None,
        selling_price: Decimal | None = None,
        barcode: str | None = None,
    ) -> ProductVariant:
        product = await self.get_product(db, product_id)
        product.has_variants = True

        variant = ProductVariant(
            product_id=product_id,
            store_id=store_id,
            variant_name=variant_name,
            attributes=attributes,
            cost_price=cost_price,
            selling_price=selling_price,
            barcode=barcode,
            stock_qty=Decimal("0"),
        )
        db.add(variant)
        await db.flush()
        return variant

    # ─── Batches ──────────────────────────────────────────────────────────────

    async def receive_stock_batch(
        self,
        db: AsyncSession,
        variant_id: int,
        store_id: int,
        batch_number: str,
        quantity: Decimal,
        purchase_price: Decimal,
        expiry_date: datetime | None = None,
        manufacture_date: datetime | None = None,
        mrp: Decimal | None = None,
        supplier_id: int | None = None,
        po_item_id: int | None = None,
        created_by_id: int | None = None,
    ) -> StockBatch:
        """
        Receive a new batch of stock. Creates the batch record
        and updates the variant's total stock qty.
        """
        # Validate variant exists
        v_result = await db.execute(
            select(ProductVariant).where(ProductVariant.id == variant_id)
        )
        variant = v_result.scalar_one_or_none()
        if not variant:
            raise HTTPException(404, f"Variant {variant_id} not found")

        # Check duplicate batch number for this variant
        existing = await db.execute(
            select(StockBatch).where(
                StockBatch.variant_id == variant_id,
                StockBatch.batch_number == batch_number,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                409, f"Batch '{batch_number}' already exists for this variant"
            )

        batch = StockBatch(
            variant_id=variant_id,
            store_id=store_id,
            batch_number=batch_number,
            quantity=quantity,
            qty_remaining=quantity,
            purchase_price=purchase_price,
            mrp=mrp,
            expiry_date=expiry_date,
            manufacture_date=manufacture_date,
            supplier_id=supplier_id,
            po_item_id=po_item_id,
        )
        db.add(batch)
        await db.flush()

        # Update variant total stock
        variant.stock_qty += quantity

        # Record movement
        await self._record_movement(
            db=db,
            store_id=store_id,
            variant=variant,
            movement_type=StockMovementType.PURCHASE,
            qty_delta=quantity,
            batch_id=batch.id,
            reference_type="purchase_order" if po_item_id else "manual",
            reference_id=po_item_id,
            unit_cost=purchase_price,
            reason=f"Batch {batch_number} received",
            created_by_id=created_by_id,
        )

        logger.info(
            "Batch received: variant_id=%d batch=%s qty=%s",
            variant_id, batch_number, quantity
        )
        return batch

    async def deduct_stock_fifo(
        self,
        db: AsyncSession,
        variant_id: int,
        qty_to_deduct: Decimal,
        store_id: int,
        reference_type: str = "sale",
        reference_id: int | None = None,
    ) -> int | None:
        """
        Deduct stock using FIFO (First In, First Out) by expiry date.
        Returns the batch_id that was deducted from (for SaleItem.batch_id).
        If no batches exist, falls back to simple variant qty reduction.
        """
        # Get active batches ordered by expiry (FIFO — earliest expiry first)
        result = await db.execute(
            select(StockBatch)
            .where(
                StockBatch.variant_id == variant_id,
                StockBatch.is_active.is_(True),
                StockBatch.qty_remaining > 0,
            )
            .order_by(
                StockBatch.expiry_date.asc().nullslast(),
                StockBatch.received_at.asc(),
            )
            .with_for_update()  # Row-level lock to prevent race conditions
        )
        batches = result.scalars().all()

        # Get variant for stock validation
        v_result = await db.execute(
            select(ProductVariant)
            .where(ProductVariant.id == variant_id)
            .options(selectinload(ProductVariant.product))
            .with_for_update()
        )
        variant = v_result.scalar_one_or_none()
        if not variant:
            raise HTTPException(404, f"Variant {variant_id} not found")

        # Check available stock
        if variant.stock_qty < qty_to_deduct and not variant.product.allow_negative_stock:
            raise HTTPException(
                400,
                f"Insufficient stock: requested {qty_to_deduct}, "
                f"available {variant.stock_qty}",
            )

        first_batch_id: int | None = None
        remaining = qty_to_deduct

        if batches:
            # FIFO deduction across batches
            for batch in batches:
                if remaining <= 0:
                    break
                deduct_from_batch = min(remaining, batch.qty_remaining)
                batch.qty_remaining -= deduct_from_batch
                remaining -= deduct_from_batch

                if first_batch_id is None:
                    first_batch_id = batch.id

                if batch.qty_remaining == 0:
                    batch.is_active = False

        # Update variant total
        variant.stock_qty -= qty_to_deduct

        await self._record_movement(
            db=db,
            store_id=store_id,
            variant=variant,
            movement_type=StockMovementType.SALE,
            qty_delta=-qty_to_deduct,
            batch_id=first_batch_id,
            reference_type=reference_type,
            reference_id=reference_id,
        )

        return first_batch_id

    async def manual_adjustment(
        self,
        db: AsyncSession,
        variant_id: int,
        store_id: int,
        delta: Decimal,
        reason: str,
        created_by_id: int,
    ) -> ProductVariant:
        """
        Manual stock adjustment (add or remove).
        Creates a movement record with the reason.
        """
        result = await db.execute(
            select(ProductVariant)
            .where(ProductVariant.id == variant_id)
            .with_for_update()
        )
        variant = result.scalar_one_or_none()
        if not variant:
            raise HTTPException(404, "Variant not found")

        new_qty = variant.stock_qty + delta
        if new_qty < 0:
            raise HTTPException(
                400, f"Adjustment would result in negative stock ({new_qty})"
            )

        variant.stock_qty = new_qty

        movement_type = (
            StockMovementType.ADJUSTMENT
            if delta > 0
            else StockMovementType.WASTAGE
        )

        await self._record_movement(
            db=db,
            store_id=store_id,
            variant=variant,
            movement_type=movement_type,
            qty_delta=delta,
            reason=reason,
            created_by_id=created_by_id,
        )

        # Trigger low-stock alert if needed
        product_result = await db.execute(
            select(Product).where(Product.id == variant.product_id)
        )
        product = product_result.scalar_one_or_none()
        if product and variant.stock_qty <= product.min_stock_qty:
            await self._raise_stock_alert(db, product, variant)

        return variant

    # ─── Inventory Health ─────────────────────────────────────────────────────

    async def get_health(
        self, db: AsyncSession, store_id: int
    ) -> InventoryHealth:
        result = await db.execute(
            select(Product)
            .where(Product.store_id == store_id, Product.is_active.is_(True))
            .options(selectinload(Product.variants))
        )
        products = result.scalars().all()

        total_value = Decimal("0")
        low_stock   = 0
        out_of_stock = 0
        overstock   = 0

        for p in products:
            total_qty = sum(v.stock_qty for v in p.variants if v.is_active)
            total_value += p.cost_price * total_qty

            if total_qty == 0:
                out_of_stock += 1
            elif total_qty <= p.min_stock_qty:
                low_stock += 1
            elif total_qty > p.min_stock_qty * 10:
                overstock += 1

        return InventoryHealth(
            total_products=len(products),
            low_stock_count=low_stock,
            out_of_stock_count=out_of_stock,
            overstock_count=overstock,
            total_inventory_value=total_value,
        )

    async def get_stock_movements(
        self,
        db: AsyncSession,
        store_id: int,
        variant_id: int | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[StockMovement], int]:
        q = select(StockMovement).where(StockMovement.store_id == store_id)
        if variant_id:
            q = q.where(StockMovement.variant_id == variant_id)

        count_r = await db.execute(select(func.count()).select_from(q.subquery()))
        total   = count_r.scalar() or 0

        result = await db.execute(
            q.order_by(StockMovement.created_at.desc())
             .offset((page - 1) * page_size)
             .limit(page_size)
        )
        return result.scalars().all(), total

    # ─── Private Helpers ──────────────────────────────────────────────────────

    async def _record_movement(
        self,
        db: AsyncSession,
        store_id: int,
        variant: ProductVariant,
        movement_type: StockMovementType,
        qty_delta: Decimal,
        batch_id: int | None = None,
        reference_type: str | None = None,
        reference_id: int | None = None,
        unit_cost: Decimal | None = None,
        reason: str | None = None,
        created_by_id: int | None = None,
    ) -> StockMovement:
        """Create an immutable stock movement record."""
        qty_before = variant.stock_qty - qty_delta  # Compute before state
        movement = StockMovement(
            store_id=store_id,
            variant_id=variant.id,
            batch_id=batch_id,
            movement_type=movement_type,
            qty_before=qty_before,
            qty_delta=qty_delta,
            qty_after=variant.stock_qty,
            reference_type=reference_type,
            reference_id=reference_id,
            unit_cost=unit_cost,
            reason=reason,
            created_by_id=created_by_id,
        )
        db.add(movement)
        return movement

    async def _raise_stock_alert(
        self, db: AsyncSession, product: Product, variant: ProductVariant
    ) -> None:
        severity = (
            AlertSeverity.CRITICAL if variant.stock_qty == 0
            else AlertSeverity.HIGH
        )
        variant_label = (
            f" ({variant.variant_name})" if variant.variant_name != "Default" else ""
        )
        alert = BusinessAlert(
            store_id=product.store_id,
            alert_type=(
                AlertType.OUT_OF_STOCK if variant.stock_qty == 0
                else AlertType.LOW_STOCK
            ),
            severity=severity,
            title=f"{'Out of stock' if variant.stock_qty == 0 else 'Low stock'}: "
                  f"{product.name}{variant_label}",
            description=(
                f"'{product.name}'{variant_label} has {variant.stock_qty} "
                f"{product.unit} left (threshold: {product.min_stock_qty})."
            ),
            meta={"product_id": product.id, "variant_id": variant.id},
        )
        db.add(alert)
