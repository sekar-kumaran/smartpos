"""
SmartPOS AI – Billing Service (Phase 1A)

Key upgrades over skeleton:
  - Full GST computation (CGST/SGST/IGST) per line item
  - Variant-aware billing (sells specific variants, not just products)
  - FIFO batch deduction
  - GSTTaxComponent record created per SaleItem
  - Split payment support via SalePayment table
  - Audit log on every sale
  - Round-off calculation
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.models import (
    Credit,
    CreditStatus,
    Customer,
    GSTTaxComponent,
    PaymentMethod,
    Product,
    ProductPriceTier,
    ProductVariant,
    Sale,
    SaleItem,
    SalePayment,
    SaleStatus,
    Store,
    SupplyType,
)
from app.services.gst.calculator import GSTBreakdown, make_calculator
from app.services.inventory.service import InventoryService

logger = logging.getLogger("smartpos.billing")

_inventory = InventoryService()
TWO = Decimal("0.01")


class BillingService:

    # ─── Invoice Number ───────────────────────────────────────────────────────

    async def _next_invoice_number(
        self, db: AsyncSession, store_id: int
    ) -> str:
        today = datetime.now(UTC).strftime("%Y%m%d")
        result = await db.execute(
            select(func.count(Sale.id)).where(
                Sale.store_id == store_id,
                func.date(Sale.created_at) == datetime.now(UTC).date(),
            )
        )
        count = (result.scalar() or 0) + 1
        return f"INV-{store_id}-{today}-{count:05d}"

    # ─── Create Sale ──────────────────────────────────────────────────────────

    async def create_sale(
        self,
        db: AsyncSession,
        store_id: int,
        cashier_id: int,
        items: list[dict],
        payment_method: PaymentMethod,
        customer_id: int | None = None,
        overall_discount: Decimal = Decimal("0"),
        amount_paid: Decimal | None = None,
        notes: str | None = None,
        local_id: str | None = None,
        payment_splits: list[dict] | None = None,
    ) -> Sale:
        """
        Create a complete GST-compliant sale.

        items: list of {
            variant_id, qty, unit_price (optional override),
            discount (line discount), hsn_code (optional override)
        }
        """
        # ── Dedup check (offline sync) ──────────────────────────────────────
        if local_id:
            dup = await db.execute(select(Sale).where(Sale.local_id == local_id))
            if dup.scalar_one_or_none():
                raise HTTPException(409, f"Sale with local_id '{local_id}' already recorded")

        # ── Fetch store for GST config ───────────────────────────────────────
        store_result = await db.execute(select(Store).where(Store.id == store_id))
        store: Store = store_result.scalar_one_or_none()
        if not store:
            store = Store(id=store_id, name=f"Store {store_id}", state_code="29")
            db.add(store)
            await db.flush()

        # ── Fetch customer (if any) for supply type + price tier ─────────────
        customer = None
        customer_state = None
        customer_gstin = None
        price_category_id: int | None = None
        # tier_prices: product_id -> Decimal (pre-fetched to avoid N+1)
        tier_prices: dict[int, Decimal] = {}

        if customer_id:
            cust_result = await db.execute(
                select(Customer).where(Customer.id == customer_id)
            )
            customer = cust_result.scalar_one_or_none()
            if customer:
                customer_state    = customer.state_code
                customer_gstin    = customer.gstin
                price_category_id = customer.price_category_id

        # Pre-load all tier prices for this category in one query
        if price_category_id:
            tier_result = await db.execute(
                select(ProductPriceTier).where(
                    ProductPriceTier.price_category_id == price_category_id
                )
            )
            tier_prices = {t.product_id: t.price for t in tier_result.scalars().all()}

        # Determine supply type
        is_inter = (
            customer_state is not None and
            customer_state != store.state_code
        )
        supply_type = SupplyType.INTER_STATE if is_inter else SupplyType.INTRA_STATE

        # Create GST calculator
        is_composition = store.gst_regime.value == "composite"
        gst_calc = make_calculator(
            store_state=store.state_code,
            customer_state=customer_state,
            customer_gstin=customer_gstin,
            is_composition=is_composition,
        )

        # ── Build sale items ─────────────────────────────────────────────────
        sale_items:   list[SaleItem]       = []
        gst_components: list[GSTBreakdown] = []
        subtotal = Decimal("0")

        for item_data in items:
            variant_id = item_data.get("variant_id")
            if variant_id is None and item_data.get("product_id") is not None:
                default_variant = await db.scalar(
                    select(ProductVariant.id)
                    .where(ProductVariant.product_id == item_data["product_id"], ProductVariant.is_active.is_(True))
                    .order_by(ProductVariant.id)
                    .limit(1)
                )
                variant_id = default_variant
            if variant_id is None:
                raise HTTPException(400, "variant_id or product_id is required")
            qty        = Decimal(str(item_data["qty"]))
            line_disc  = Decimal(str(item_data.get("discount", "0")))

            # Fetch variant + product
            v_result = await db.execute(
                select(ProductVariant)
                .where(ProductVariant.id == variant_id)
                .options(selectinload(ProductVariant.product))
                .with_for_update()
            )
            variant: ProductVariant = v_result.scalar_one_or_none()
            if not variant:
                raise HTTPException(404, f"Variant {variant_id} not found")

            product: Product = variant.product
            if not product.is_active:
                raise HTTPException(400, f"Product '{product.name}' is not active")

            # Effective prices (variant overrides product if set)
            eff_cost  = variant.cost_price or product.cost_price
            eff_price = item_data.get("unit_price")
            if eff_price is None:
                # Apply customer tier price if available; else use standard price
                if product.id in tier_prices:
                    eff_price = tier_prices[product.id]
                    logger.debug(
                        "Tier price applied: product=%d price=%s (category_id=%s)",
                        product.id, eff_price, price_category_id,
                    )
                else:
                    eff_price = variant.selling_price or product.selling_price
            eff_price = Decimal(str(eff_price))

            # GST rate
            gst_rate_val = Decimal(product.gst_rate.value)
            cess_rate    = product.cess_rate
            hsn_code     = item_data.get("hsn_code") or product.hsn_code

            # Compute GST breakdown for this line
            breakdown = gst_calc.compute_line_item(
                base_price=eff_price,
                qty=qty,
                gst_rate=gst_rate_val,
                discount=line_disc,
                cess_rate=cess_rate,
                price_inclusive=product.price_includes_tax,
                hsn_code=hsn_code,
            )

            subtotal += breakdown.taxable_value

            # Deduct stock (FIFO)
            batch_id = await _inventory.deduct_stock_fifo(
                db=db,
                variant_id=variant_id,
                qty_to_deduct=qty,
                store_id=store_id,
                reference_type="sale",
            )

            si = SaleItem(
                product_id=product.id,
                variant_id=variant_id,
                batch_id=batch_id,
                product_name=product.name,
                variant_name=variant.variant_name,
                hsn_code=hsn_code,
                qty=qty,
                unit=product.unit,
                unit_price=eff_price,
                cost_price=eff_cost,
                mrp=variant.mrp or product.mrp,
                discount=line_disc,
                taxable_value=breakdown.taxable_value,
                line_total=breakdown.line_total,
            )
            sale_items.append(si)
            gst_components.append(breakdown)

        # ── Invoice totals ───────────────────────────────────────────────────
        inv_summary = gst_calc.compute_invoice(gst_components, overall_discount)

        total_amount  = inv_summary.grand_total
        actual_paid   = amount_paid if amount_paid is not None else total_amount
        amount_due    = max(Decimal("0"), (total_amount - actual_paid).quantize(TWO, rounding=ROUND_HALF_UP))

        invoice_number = await self._next_invoice_number(db, store_id)

        # ── Create Sale record ───────────────────────────────────────────────
        sale = Sale(
            store_id=store_id,
            cashier_id=cashier_id,
            customer_id=customer_id,
            price_category_id=price_category_id,
            invoice_number=invoice_number,
            supply_type=supply_type,
            is_b2b=bool(customer_gstin),
            customer_gstin=customer_gstin,
            subtotal=inv_summary.taxable_amount,
            discount=overall_discount,
            taxable_amount=inv_summary.taxable_amount,
            cgst_amount=inv_summary.cgst_total,
            sgst_amount=inv_summary.sgst_total,
            igst_amount=inv_summary.igst_total,
            cess_amount=inv_summary.cess_total,
            total_tax=inv_summary.total_tax,
            round_off=inv_summary.round_off,
            total_amount=total_amount,
            payment_method=payment_method,
            amount_paid=actual_paid,
            amount_due=amount_due,
            notes=notes,
            local_id=local_id,
            is_synced=True,
        )
        db.add(sale)
        await db.flush()  # get sale.id

        # ── Attach items and GST components ─────────────────────────────────
        for si, bd in zip(sale_items, gst_components, strict=False):
            si.sale_id = sale.id
            db.add(si)
            await db.flush()  # get si.id

            gst_comp = GSTTaxComponent(
                sale_item_id=si.id,
                supply_type=bd.supply_type,
                hsn_code=bd.hsn_code,
                taxable_value=bd.taxable_value,
                cgst_rate=bd.cgst_rate,
                cgst_amount=bd.cgst_amount,
                sgst_rate=bd.sgst_rate,
                sgst_amount=bd.sgst_amount,
                igst_rate=bd.igst_rate,
                igst_amount=bd.igst_amount,
                cess_rate=bd.cess_rate,
                cess_amount=bd.cess_amount,
                total_tax=bd.total_tax,
            )
            db.add(gst_comp)

        # ── Payment split records ────────────────────────────────────────────
        if payment_splits:
            for split in payment_splits:
                db.add(SalePayment(
                    sale_id=sale.id,
                    method=PaymentMethod(split["method"]),
                    amount=Decimal(str(split["amount"])),
                    reference=split.get("reference"),
                ))
        else:
            db.add(SalePayment(
                sale_id=sale.id,
                method=payment_method,
                amount=actual_paid,
            ))

        # ── Auto-create credit entry when payment method is credit ───────────
        if payment_method == PaymentMethod.CREDIT and amount_due > 0 and customer_id:
            credit = Credit(
                store_id=store_id,
                customer_id=customer_id,
                sale_id=sale.id,
                amount=amount_due,
                balance=amount_due,
                status=CreditStatus.OPEN,
            )
            db.add(credit)

            if customer:
                customer.total_credit_given += amount_due

        # ── Update customer purchase stats ───────────────────────────────────
        if customer:
            customer.total_purchases  += 1
            customer.total_spent      += total_amount
            customer.last_purchase_at  = datetime.now(UTC)

        await db.flush()
        logger.info(
            "Sale created: %s | store=%d | total=%.2f | gst=%.2f",
            invoice_number, store_id, float(total_amount), float(inv_summary.total_tax)
        )
        return sale

    # ─── Void Sale ────────────────────────────────────────────────────────────

    async def void_sale(
        self, db: AsyncSession, sale_id: int, voided_by_id: int
    ) -> Sale:
        result = await db.execute(
            select(Sale)
            .where(Sale.id == sale_id)
            .options(selectinload(Sale.items))
        )
        sale = result.scalar_one_or_none()
        if not sale:
            raise HTTPException(404, "Sale not found")
        if sale.status != SaleStatus.COMPLETED:
            raise HTTPException(400, f"Cannot void a sale with status '{sale.status}'")

        sale.status = SaleStatus.VOID

        # Restore stock for each item
        for item in sale.items:
            v_result = await db.execute(
                select(ProductVariant)
                .where(ProductVariant.id == item.variant_id)
                .with_for_update()
            )
            variant = v_result.scalar_one_or_none()
            if variant:
                variant.stock_qty += item.qty

        logger.info("Sale voided: %s by user %d", sale.invoice_number, voided_by_id)
        return sale

    # ─── Get / List Sales ─────────────────────────────────────────────────────

    async def get_sale(self, db: AsyncSession, sale_id: int) -> Sale:
        result = await db.execute(
            select(Sale)
            .where(Sale.id == sale_id)
            .options(
                selectinload(Sale.items).selectinload(SaleItem.gst_component),
                selectinload(Sale.payments),
            )
        )
        sale = result.scalar_one_or_none()
        if not sale:
            raise HTTPException(404, "Sale not found")
        return sale

    async def list_sales(
        self,
        db: AsyncSession,
        store_id: int,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        customer_id: int | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[Sale], int]:
        q = select(Sale).where(Sale.store_id == store_id)
        if start_date:
            q = q.where(Sale.created_at >= start_date)
        if end_date:
            q = q.where(Sale.created_at <= end_date)
        if customer_id:
            q = q.where(Sale.customer_id == customer_id)

        count_r = await db.execute(select(func.count()).select_from(q.subquery()))
        total   = count_r.scalar() or 0

        result = await db.execute(
            q.options(
                selectinload(Sale.items).selectinload(SaleItem.gst_component),
                selectinload(Sale.payments),
            )
             .order_by(Sale.created_at.desc())
             .offset((page - 1) * page_size)
             .limit(page_size)
        )
        return result.scalars().all(), total
