"""
SmartPOS AI – Inventory Celery Tasks (Phase 1A)

Handles expiry date monitoring, reorder point detection,
and low-stock alert generation — all as background jobs.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from celery import shared_task
from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ─── Expiry Alerts ────────────────────────────────────────────────────────────

@shared_task(
    bind=True,
    name="app.tasks.inventory_tasks.check_expiry_alerts",
    max_retries=3,
    default_retry_delay=600,
)
def check_expiry_alerts(self):
    """
    Scans all active batches and raises alerts for:
      - Products expiring within 7 days  → CRITICAL
      - Products expiring within 30 days → HIGH
      - Products already expired         → CRITICAL + disable batch

    Runs daily at 8:00 AM IST.
    """
    async def _inner():
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        from app.core.database import AsyncSessionFactory
        from app.models.models import (
            AlertSeverity,
            AlertType,
            BusinessAlert,
            ProductVariant,
            StockBatch,
        )

        now        = datetime.now(timezone.utc)
        in_7_days  = now + timedelta(days=7)
        in_30_days = now + timedelta(days=30)

        alerts_created = 0

        async with AsyncSessionFactory() as db:
            # Get all active batches with expiry dates
            result = await db.execute(
                select(StockBatch)
                .where(
                    StockBatch.expiry_date.isnot(None),
                    StockBatch.is_active.is_(True),
                    StockBatch.qty_remaining > 0,
                )
                .options(selectinload(StockBatch.variant).selectinload(ProductVariant.product))
            )
            batches = result.scalars().all()

            for batch in batches:
                expiry   = batch.expiry_date
                variant  = batch.variant
                product  = variant.product if variant else None
                if not product:
                    continue

                if expiry < now:
                    # Already expired → mark inactive, raise critical alert
                    batch.is_active = False
                    alert = BusinessAlert(
                        store_id=product.store_id,
                        alert_type=AlertType.EXPIRY_ALERT,
                        severity=AlertSeverity.CRITICAL,
                        title=f"EXPIRED: {product.name} — Batch {batch.batch_number}",
                        description=(
                            f"Batch {batch.batch_number} of '{product.name}' expired on "
                            f"{expiry.strftime('%d %b %Y')}. "
                            f"Remaining qty: {batch.qty_remaining} {product.unit}. "
                            "This stock has been automatically deactivated."
                        ),
                        meta={
                            "product_id":  product.id,
                            "variant_id":  variant.id,
                            "batch_id":    batch.id,
                            "expiry_date": expiry.isoformat(),
                            "qty":         float(batch.qty_remaining),
                        },
                    )
                    db.add(alert)
                    alerts_created += 1

                elif expiry <= in_7_days:
                    alert = BusinessAlert(
                        store_id=product.store_id,
                        alert_type=AlertType.EXPIRY_ALERT,
                        severity=AlertSeverity.CRITICAL,
                        title=f"Expiring in {(expiry - now).days} days: {product.name}",
                        description=(
                            f"Batch {batch.batch_number} of '{product.name}' expires on "
                            f"{expiry.strftime('%d %b %Y')} "
                            f"({(expiry - now).days} days). "
                            f"Remaining: {batch.qty_remaining} {product.unit}. "
                            "Consider running a discount to clear this stock."
                        ),
                        meta={
                            "product_id": product.id,
                            "batch_id":   batch.id,
                            "days_left":  (expiry - now).days,
                        },
                    )
                    db.add(alert)
                    alerts_created += 1

                elif expiry <= in_30_days:
                    alert = BusinessAlert(
                        store_id=product.store_id,
                        alert_type=AlertType.EXPIRY_ALERT,
                        severity=AlertSeverity.HIGH,
                        title=f"Expiry approaching ({(expiry - now).days}d): {product.name}",
                        description=(
                            f"Batch {batch.batch_number} of '{product.name}' will expire "
                            f"in {(expiry - now).days} days "
                            f"({expiry.strftime('%d %b %Y')}). "
                            f"Stock: {batch.qty_remaining} {product.unit}."
                        ),
                        meta={
                            "product_id": product.id,
                            "batch_id":   batch.id,
                            "days_left":  (expiry - now).days,
                        },
                    )
                    db.add(alert)
                    alerts_created += 1

            await db.commit()

        logger.info(
            "Expiry check complete: %d batches scanned, %d alerts created",
            len(batches), alerts_created,
        )
        return {"batches_scanned": len(batches), "alerts_created": alerts_created}

    try:
        return _run(_inner())
    except Exception as exc:
        logger.error("check_expiry_alerts failed: %s", exc)
        raise self.retry(exc=exc) from exc


# ─── Reorder Point Check ──────────────────────────────────────────────────────

@shared_task(
    bind=True,
    name="app.tasks.inventory_tasks.check_reorder",
    max_retries=3,
    default_retry_delay=300,
)
def check_reorder(self):
    """
    Identifies variants whose stock has fallen at or below
    the reorder point and creates REORDER alerts.
    Runs every 6 hours.
    """
    async def _inner():
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        from app.core.database import AsyncSessionFactory
        from app.models.models import (
            AlertSeverity,
            AlertType,
            BusinessAlert,
            Product,
            ProductVariant,
        )

        alerts_created = 0

        async with AsyncSessionFactory() as db:
            result = await db.execute(
                select(ProductVariant)
                .join(Product, Product.id == ProductVariant.product_id)
                .where(
                    Product.is_active.is_(True),
                    ProductVariant.is_active.is_(True),
                    Product.track_inventory.is_(True),
                )
                .options(selectinload(ProductVariant.product))
            )
            variants = result.scalars().all()

            for variant in variants:
                product = variant.product
                if variant.stock_qty <= product.min_stock_qty:
                    severity = (
                        AlertSeverity.CRITICAL
                        if variant.stock_qty == 0
                        else AlertSeverity.HIGH
                    )
                    title = (
                        f"Out of Stock: {product.name}"
                        if variant.stock_qty == 0
                        else f"Reorder Now: {product.name} (stock: {variant.stock_qty})"
                    )
                    alert = BusinessAlert(
                        store_id=product.store_id,
                        alert_type=(
                            AlertType.OUT_OF_STOCK
                            if variant.stock_qty == 0
                            else AlertType.REORDER
                        ),
                        severity=severity,
                        title=title,
                        description=(
                            f"'{product.name}' "
                            + (f"variant: {variant.variant_name}" if variant.variant_name != "Default" else "")
                            + f" has {variant.stock_qty} {product.unit} remaining "
                            f"(reorder point: {product.min_stock_qty}). "
                            f"Suggested reorder qty: {product.reorder_qty} {product.unit}."
                        ),
                        meta={
                            "product_id":    product.id,
                            "variant_id":    variant.id,
                            "stock_qty":     float(variant.stock_qty),
                            "reorder_point": product.min_stock_qty,
                            "reorder_qty":   product.reorder_qty,
                        },
                    )
                    db.add(alert)
                    alerts_created += 1

            await db.commit()

        logger.info("Reorder check: %d alerts created", alerts_created)
        return {"alerts_created": alerts_created}

    try:
        return _run(_inner())
    except Exception as exc:
        raise self.retry(exc=exc) from exc
