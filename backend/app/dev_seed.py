from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from secrets import token_urlsafe

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
from app.models.models import (
    AlertSeverity,
    AlertType,
    BusinessAlert,
    Category,
    Credit,
    CreditStatus,
    Customer,
    GSTRegimeType,
    GSTTaxSlab,
    PaymentMethod,
    POStatus,
    PriceCategory,
    Product,
    ProductPriceTier,
    ProductVariant,
    PurchaseOrder,
    PurchaseOrderItem,
    Sale,
    SaleItem,
    SaleStatus,
    Store,
    StoreType,
    Supplier,
    SupplyType,
    User,
    UserRole,
)

DEMO_EMAIL = settings.DEMO_USER_EMAIL


def _demo_password_hash() -> str:
    # Community Edition: generate a random demo password hash at seed time.
    return hash_password(token_urlsafe(18))


async def seed_demo_data(db: AsyncSession) -> None:
    result = await db.execute(select(User).where(User.email == DEMO_EMAIL))
    existing_user = result.scalar_one_or_none()

    if existing_user:
        store_id = existing_user.store_id or 1
    else:
        store = Store(
            name="SmartPOS Demo Mart",
            legal_name="SmartPOS Demo Mart Private Limited",
            store_type=StoreType.GROCERY,
            address="42 Market Road",
            city="Bengaluru",
            state_code="29",
            pincode="560001",
            phone="9876543210",
            email=DEMO_EMAIL,
            gstin="29ABCDE1234F1Z5",
            gst_regime=GSTRegimeType.REGULAR,
            receipt_header="SmartPOS Demo Mart",
            receipt_footer="Thank you. Visit again.",
            plan="demo",
        )
        db.add(store)
        await db.flush()
        store_id = store.id

        user = User(
            store_id=store_id,
            name="Aarav Sharma",
            email=DEMO_EMAIL,
            phone="9876543210",
            password_hash=_demo_password_hash(),
            role=UserRole.OWNER,
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        await db.flush()

    product_count = await db.scalar(
        select(func.count(Product.id)).where(Product.store_id == store_id)
    )
    if product_count:
        return

    user_id = existing_user.id if existing_user else user.id
    now = datetime.now(UTC)

    staples = Category(store_id=store_id, name="Staples", sort_order=1)
    dairy = Category(store_id=store_id, name="Dairy", sort_order=2)
    snacks = Category(store_id=store_id, name="Snacks", sort_order=3)
    db.add_all([staples, dairy, snacks])
    await db.flush()

    products = [
        {
            "category_id": staples.id,
            "name": "Aashirvaad Atta 5kg",
            "brand": "Aashirvaad",
            "sku": "ATA-5KG",
            "barcode": "8901725123456",
            "hsn": "1101",
            "cost": Decimal("235"),
            "sell": Decimal("275"),
            "mrp": Decimal("295"),
            "gst": GSTTaxSlab.SLAB_5,
            "unit": "bag",
            "min": 8,
            "stock": Decimal("42"),
        },
        {
            "category_id": staples.id,
            "name": "Tata Salt 1kg",
            "brand": "Tata",
            "sku": "SAL-1KG",
            "barcode": "8904043901015",
            "hsn": "2501",
            "cost": Decimal("22"),
            "sell": Decimal("28"),
            "mrp": Decimal("30"),
            "gst": GSTTaxSlab.EXEMPT,
            "unit": "pcs",
            "min": 25,
            "stock": Decimal("18"),
        },
        {
            "category_id": dairy.id,
            "name": "Amul Taaza Milk 500ml",
            "brand": "Amul",
            "sku": "MLK-500",
            "barcode": "8901262012345",
            "hsn": "0401",
            "cost": Decimal("25"),
            "sell": Decimal("28"),
            "mrp": Decimal("28"),
            "gst": GSTTaxSlab.EXEMPT,
            "unit": "pkt",
            "min": 20,
            "stock": Decimal("0"),
        },
        {
            "category_id": snacks.id,
            "name": "Parle-G Family Pack",
            "brand": "Parle",
            "sku": "BIS-PG-FAM",
            "barcode": "8901719101010",
            "hsn": "1905",
            "cost": Decimal("78"),
            "sell": Decimal("95"),
            "mrp": Decimal("100"),
            "gst": GSTTaxSlab.SLAB_18,
            "unit": "pcs",
            "min": 10,
            "stock": Decimal("67"),
        },
    ]

    seeded_items: list[tuple[Product, ProductVariant]] = []
    for item in products:
        product = Product(
            store_id=store_id,
            category_id=item["category_id"],
            name=item["name"],
            brand=item["brand"],
            sku=item["sku"],
            default_barcode=item["barcode"],
            hsn_code=item["hsn"],
            cost_price=item["cost"],
            selling_price=item["sell"],
            mrp=item["mrp"],
            gst_rate=item["gst"],
            price_includes_tax=True,
            unit=item["unit"],
            min_stock_qty=item["min"],
            reorder_qty=item["min"] * 4,
            created_by_id=user_id,
        )
        db.add(product)
        await db.flush()
        variant = ProductVariant(
            product_id=product.id,
            store_id=store_id,
            variant_name="Default",
            sku=item["sku"],
            barcode=item["barcode"],
            stock_qty=item["stock"],
        )
        db.add(variant)
        seeded_items.append((product, variant))
    await db.flush()

    supplier = Supplier(
        store_id=store_id,
        name="Sri Lakshmi Distributors",
        contact_person="Kumar",
        phone="9876543210",
        gstin="29ABCDE1234F1Z5",
        credit_days=21,
    )
    db.add(supplier)
    await db.flush()

    customer = Customer(
        store_id=store_id,
        name="Meera Rao",
        phone="9988776655",
        address="MG Road",
        total_credit_given=Decimal("12500"),
        total_credit_repaid=Decimal("5000"),
    )
    db.add(customer)
    await db.flush()

    credit = Credit(
        store_id=store_id,
        customer_id=customer.id,
        amount=Decimal("12500"),
        amount_repaid=Decimal("5000"),
        balance=Decimal("7500"),
        due_date=now - timedelta(days=3),
        status=CreditStatus.OVERDUE,
        notes="Monthly grocery account",
    )
    db.add(credit)

    po = PurchaseOrder(
        store_id=store_id,
        supplier_id=supplier.id,
        po_number=f"PO-{store_id}-{now:%Y%m%d}-0001",
        status=POStatus.SENT,
        subtotal=Decimal("45000"),
        tax_amount=Decimal("2250"),
        total_amount=Decimal("47250"),
        expected_date=now + timedelta(days=2),
        notes="Staples replenishment",
        created_by_id=user_id,
    )
    db.add(po)
    await db.flush()
    db.add(
        PurchaseOrderItem(
            po_id=po.id,
            variant_id=seeded_items[0][1].id,
            qty_ordered=Decimal("150"),
            qty_received=Decimal("0"),
            unit_price=Decimal("300"),
            gst_rate=Decimal("5"),
            line_total=Decimal("47250"),
        )
    )

    for index, amount in enumerate([Decimal("1944"), Decimal("640"), Decimal("1280")], start=1):
        sale = Sale(
            store_id=store_id,
            cashier_id=user_id,
            customer_id=customer.id if index == 1 else None,
            invoice_number=f"INV-{store_id}-{now:%Y%m%d}-{index:04d}",
            invoice_date=now - timedelta(hours=index),
            supply_type=SupplyType.INTRA_STATE,
            subtotal=amount,
            discount=Decimal("0"),
            taxable_amount=amount,
            cgst_amount=Decimal("0"),
            sgst_amount=Decimal("0"),
            igst_amount=Decimal("0"),
            cess_amount=Decimal("0"),
            total_tax=Decimal("0"),
            round_off=Decimal("0"),
            total_amount=amount,
            payment_method=PaymentMethod.UPI if index == 1 else PaymentMethod.CASH,
            amount_paid=amount,
            amount_due=Decimal("0"),
            status=SaleStatus.COMPLETED,
            is_synced=True,
            created_at=now - timedelta(hours=index),
        )
        db.add(sale)
        await db.flush()
        product, variant = seeded_items[index % len(seeded_items)]
        db.add(
            SaleItem(
                sale_id=sale.id,
                product_id=product.id,
                variant_id=variant.id,
                product_name=product.name,
                variant_name=variant.variant_name,
                hsn_code=product.hsn_code,
                qty=Decimal("4"),
                unit=product.unit,
                unit_price=product.selling_price,
                cost_price=product.cost_price,
                discount=Decimal("0"),
                taxable_value=product.selling_price * Decimal("4"),
                line_total=product.selling_price * Decimal("4"),
            )
        )

    db.add_all(
        [
            BusinessAlert(
                store_id=store_id,
                alert_type=AlertType.OUT_OF_STOCK,
                severity=AlertSeverity.CRITICAL,
                title="Amul Taaza Milk is out of stock",
                description="Fast-moving dairy item reached zero stock today.",
            ),
            BusinessAlert(
                store_id=store_id,
                alert_type=AlertType.OVERDUE_CREDIT,
                severity=AlertSeverity.HIGH,
                title="6 credit accounts are overdue",
                description="Outstanding credit needs collection follow-up.",
            ),
        ]
    )

    # ── Price Categories (customer tier pricing) ──────────────────────────────
    retail_cat = PriceCategory(
        store_id=store_id,
        name="Retail",
        description="Standard retail price for walk-in customers",
        color="#4F46E5",
        is_default=True,
    )
    hotel_cat = PriceCategory(
        store_id=store_id,
        name="Hotel Price",
        description="Discounted bulk price for hotels and restaurants",
        color="#10B981",
        is_default=False,
    )
    wholesale_cat = PriceCategory(
        store_id=store_id,
        name="Wholesale",
        description="Wholesale rates for distributors",
        color="#F59E0B",
        is_default=False,
    )
    db.add_all([retail_cat, hotel_cat, wholesale_cat])
    await db.flush()

    # Hotel price tier: slightly below standard for first two seeded products
    if seeded_items:
        atta_product, _ = seeded_items[0]
        biscuit_product, _ = seeded_items[3] if len(seeded_items) > 3 else seeded_items[0]
        db.add_all([
            ProductPriceTier(
                store_id=store_id,
                price_category_id=hotel_cat.id,
                product_id=atta_product.id,
                price=Decimal("255"),   # ₹275 standard → ₹255 hotel
            ),
            ProductPriceTier(
                store_id=store_id,
                price_category_id=hotel_cat.id,
                product_id=biscuit_product.id,
                price=Decimal("82"),    # ₹95 standard → ₹82 hotel
            ),
            ProductPriceTier(
                store_id=store_id,
                price_category_id=wholesale_cat.id,
                product_id=atta_product.id,
                price=Decimal("245"),   # ₹275 standard → ₹245 wholesale
            ),
        ])

    # Assign demo customer to hotel category
    customer.price_category_id = hotel_cat.id
