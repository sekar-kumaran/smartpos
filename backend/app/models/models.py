"""
SmartPOS AI – ORM Models (Phase 1A)

Schema principles:
  1. Every tenant-scoped table has store_id as FK + RLS discriminator
  2. All PKs are integer (not UUID) — faster joins in PostgreSQL
  3. Soft deletes via is_active / deleted_at — never hard DELETE
  4. Audit trail: created_at, updated_at, created_by_id on all core tables
  5. Product variants are first-class entities with their own stock
  6. Batches/lots track expiry and FIFO ordering
  7. GST fields are explicit columns — not stuffed into JSON blobs
"""

from __future__ import annotations

import enum
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# ─── Helpers ──────────────────────────────────────────────────────────────────

def utcnow() -> datetime:
    return datetime.now(UTC)


# ─── Enums ────────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"   # SmartPOS platform admin
    OWNER       = "owner"         # Store owner
    MANAGER     = "manager"       # Store manager
    CASHIER     = "cashier"       # Billing operator
    ACCOUNTANT  = "accountant"    # View-only financial access


class StoreType(str, enum.Enum):
    RETAIL     = "retail"
    WHOLESALE  = "wholesale"
    RESTAURANT = "restaurant"
    PHARMACY   = "pharmacy"
    GROCERY    = "grocery"


class GSTRegimeType(str, enum.Enum):
    REGULAR   = "regular"    # Standard GST registration
    COMPOSITE = "composite"  # Composition scheme (turnover < 1.5Cr)
    EXEMPT    = "exempt"     # Exempt from GST


class SupplyType(str, enum.Enum):
    INTRA_STATE = "intra"   # CGST + SGST
    INTER_STATE = "inter"   # IGST
    EXPORT      = "export"  # Zero-rated


class GSTTaxSlab(str, enum.Enum):
    EXEMPT   = "0"
    SLAB_5   = "5"
    SLAB_12  = "12"
    SLAB_18  = "18"
    SLAB_28  = "28"


class PaymentMethod(str, enum.Enum):
    CASH      = "cash"
    UPI       = "upi"
    CARD      = "card"
    NETBANKING= "netbanking"
    CREDIT    = "credit"    # Credit / deferred payment
    SPLIT     = "split"     # Multiple methods on same bill


class SaleStatus(str, enum.Enum):
    DRAFT     = "draft"      # Parked/held bill
    COMPLETED = "completed"
    REFUNDED  = "refunded"
    VOID      = "void"


class CreditStatus(str, enum.Enum):
    OPEN    = "open"
    PARTIAL = "partial"
    PAID    = "paid"
    OVERDUE = "overdue"
    WAIVED  = "waived"


class AlertSeverity(str, enum.Enum):
    LOW      = "low"
    MEDIUM   = "medium"
    HIGH     = "high"
    CRITICAL = "critical"


class AlertType(str, enum.Enum):
    PROFIT_DROP    = "profit_drop"
    LOW_STOCK      = "low_stock"
    OUT_OF_STOCK   = "out_of_stock"
    OVERDUE_CREDIT = "overdue_credit"
    ANOMALY        = "anomaly"
    FRAUD_SUSPECT  = "fraud_suspect"
    EXPIRY_ALERT   = "expiry_alert"
    PRICE_CHANGE   = "price_change"
    REORDER        = "reorder"


class POStatus(str, enum.Enum):
    DRAFT     = "draft"
    SENT      = "sent"
    PARTIAL   = "partial_received"
    RECEIVED  = "received"
    CANCELLED = "cancelled"


class StockMovementType(str, enum.Enum):
    SALE            = "sale"
    PURCHASE        = "purchase"
    ADJUSTMENT      = "adjustment"
    TRANSFER_IN     = "transfer_in"
    TRANSFER_OUT    = "transfer_out"
    RETURN_IN       = "return_in"
    WASTAGE         = "wastage"
    OPENING_STOCK   = "opening_stock"


class ShiftStatus(str, enum.Enum):
    OPEN   = "open"
    CLOSED = "closed"


class VariantType(str, enum.Enum):
    SIZE   = "size"
    COLOUR = "colour"
    WEIGHT = "weight"
    PACK   = "pack_size"
    OTHER  = "other"


# ═══════════════════════════════════════════════════════════════════════════════
# PLATFORM TABLES (no store_id → super-admin scope)
# ═══════════════════════════════════════════════════════════════════════════════

class Store(Base):
    """A tenant. Every other record links back here via store_id."""
    __tablename__ = "stores"

    id:          Mapped[int]       = mapped_column(Integer, primary_key=True)
    name:        Mapped[str]       = mapped_column(String(200), nullable=False)
    legal_name:  Mapped[str | None] = mapped_column(String(200))
    store_type:  Mapped[StoreType] = mapped_column(Enum(StoreType), default=StoreType.RETAIL)
    address:     Mapped[str | None] = mapped_column(Text)
    city:        Mapped[str | None] = mapped_column(String(100))
    state_code:  Mapped[str]       = mapped_column(String(3), default="29")
    pincode:     Mapped[str | None] = mapped_column(String(10))
    phone:       Mapped[str | None] = mapped_column(String(20))
    email:       Mapped[str | None] = mapped_column(String(255))
    currency:    Mapped[str]       = mapped_column(String(5), default="INR")

    # GST details
    gstin:           Mapped[str | None] = mapped_column(String(20))
    gst_regime:      Mapped[GSTRegimeType] = mapped_column(Enum(GSTRegimeType), default=GSTRegimeType.REGULAR)
    pan_number:      Mapped[str | None] = mapped_column(String(15))
    fssai_number:    Mapped[str | None] = mapped_column(String(20))
    drug_license_no: Mapped[str | None] = mapped_column(String(30))

    # Branding
    logo_url:    Mapped[str | None] = mapped_column(String(500))
    receipt_header: Mapped[str | None] = mapped_column(Text)
    receipt_footer: Mapped[str | None] = mapped_column(Text)

    # SaaS
    plan:        Mapped[str]  = mapped_column(String(30), default="free")
    is_active:   Mapped[bool] = mapped_column(Boolean, default=True)
    trial_ends:  Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Relationships
    users:     Mapped[list[User]]     = relationship(back_populates="store")
    products:  Mapped[list[Product]]  = relationship(back_populates="store")
    customers: Mapped[list[Customer]] = relationship(back_populates="store")
    sales:     Mapped[list[Sale]]     = relationship(back_populates="store")
    branches:  Mapped[list[Branch]]   = relationship(back_populates="store")


class Branch(Base):
    """A physical location/outlet of a store."""
    __tablename__ = "branches"

    id:        Mapped[int]  = mapped_column(Integer, primary_key=True)
    store_id:  Mapped[int]  = mapped_column(ForeignKey("stores.id"), nullable=False)
    name:      Mapped[str]  = mapped_column(String(150), nullable=False)
    address:   Mapped[str | None] = mapped_column(Text)
    phone:     Mapped[str | None] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_main:   Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    store: Mapped[Store] = relationship(back_populates="branches")


# ═══════════════════════════════════════════════════════════════════════════════
# AUTH & USERS
# ═══════════════════════════════════════════════════════════════════════════════

class User(Base):
    __tablename__ = "users"

    id:            Mapped[int]      = mapped_column(Integer, primary_key=True)
    store_id:      Mapped[int | None] = mapped_column(ForeignKey("stores.id"))
    name:          Mapped[str]      = mapped_column(String(150), nullable=False)
    email:         Mapped[str]      = mapped_column(String(255), unique=True, nullable=False)
    phone:         Mapped[str | None] = mapped_column(String(20))
    password_hash: Mapped[str]      = mapped_column(String(255), nullable=False)
    role:          Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.CASHIER)
    is_active:     Mapped[bool]     = mapped_column(Boolean, default=True)
    is_verified:   Mapped[bool]     = mapped_column(Boolean, default=False)
    avatar_url:    Mapped[str | None] = mapped_column(String(500))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # OTP / 2FA
    otp_hash:    Mapped[str | None]      = mapped_column(String(255))
    otp_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    store: Mapped[Store | None] = relationship(back_populates="users")
    sales: Mapped[list[Sale]]      = relationship(back_populates="cashier")

    __table_args__ = (
        Index("ix_users_store_id", "store_id"),
        Index("ix_users_email",    "email"),
    )


# ═══════════════════════════════════════════════════════════════════════════════
# GST MASTER DATA
# ═══════════════════════════════════════════════════════════════════════════════

class HSNCode(Base):
    """
    HSN (Harmonized System of Nomenclature) code master.
    Determines the correct GST rate for a product.
    Pre-seeded from government data; ~20,000 entries.
    """
    __tablename__ = "hsn_codes"

    id:          Mapped[int]         = mapped_column(Integer, primary_key=True)
    hsn_code:    Mapped[str]         = mapped_column(String(10), unique=True, nullable=False)
    description: Mapped[str]         = mapped_column(Text, nullable=False)
    gst_rate:    Mapped[GSTTaxSlab]  = mapped_column(Enum(GSTTaxSlab), nullable=False)
    cess_rate:   Mapped[Decimal]     = mapped_column(Numeric(5, 2), default=0)
    is_service:  Mapped[bool]        = mapped_column(Boolean, default=False)

    __table_args__ = (
        Index("ix_hsn_code", "hsn_code"),
    )


class GSTTaxComponent(Base):
    """
    Pre-computed GST breakdown for a transaction line.
    Created alongside every SaleItem — immutable audit record.
    """
    __tablename__ = "gst_tax_components"

    id:           Mapped[int]        = mapped_column(Integer, primary_key=True)
    sale_item_id: Mapped[int]        = mapped_column(ForeignKey("sale_items.id"), nullable=False)
    supply_type:  Mapped[SupplyType] = mapped_column(Enum(SupplyType), nullable=False)
    hsn_code:     Mapped[str | None] = mapped_column(String(10))
    taxable_value:Mapped[Decimal]    = mapped_column(Numeric(14, 2), nullable=False)

    # CGST + SGST (intra-state) OR IGST (inter-state) — one set will be zero
    cgst_rate:    Mapped[Decimal]    = mapped_column(Numeric(5, 2), default=0)
    cgst_amount:  Mapped[Decimal]    = mapped_column(Numeric(12, 2), default=0)
    sgst_rate:    Mapped[Decimal]    = mapped_column(Numeric(5, 2), default=0)
    sgst_amount:  Mapped[Decimal]    = mapped_column(Numeric(12, 2), default=0)
    igst_rate:    Mapped[Decimal]    = mapped_column(Numeric(5, 2), default=0)
    igst_amount:  Mapped[Decimal]    = mapped_column(Numeric(12, 2), default=0)
    cess_rate:    Mapped[Decimal]    = mapped_column(Numeric(5, 2), default=0)
    cess_amount:  Mapped[Decimal]    = mapped_column(Numeric(12, 2), default=0)
    total_tax:    Mapped[Decimal]    = mapped_column(Numeric(12, 2), nullable=False)

    sale_item: Mapped[SaleItem] = relationship(back_populates="gst_component")

    @property
    def gst_rate(self) -> Decimal:
        return (self.cgst_rate + self.sgst_rate + self.igst_rate)

    __table_args__ = (
        Index("ix_gst_sale_item", "sale_item_id"),
    )


# ═══════════════════════════════════════════════════════════════════════════════
# INVENTORY — PRODUCTS, VARIANTS, BATCHES
# ═══════════════════════════════════════════════════════════════════════════════

class Category(Base):
    __tablename__ = "categories"

    id:       Mapped[int]  = mapped_column(Integer, primary_key=True)
    store_id: Mapped[int]  = mapped_column(ForeignKey("stores.id"), nullable=False)
    name:     Mapped[str]  = mapped_column(String(120), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    products:  Mapped[list[Product]]  = relationship(back_populates="category")
    children:  Mapped[list[Category]] = relationship()
    __table_args__ = (UniqueConstraint("store_id", "name"),)


class Product(Base):
    """
    Master product record — describes WHAT the product is.
    Actual stock lives in ProductVariant (even single-variant products
    get one variant, simplifying all downstream logic).
    """
    __tablename__ = "products"

    id:          Mapped[int]  = mapped_column(Integer, primary_key=True)
    store_id:    Mapped[int]  = mapped_column(ForeignKey("stores.id"), nullable=False)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    name:        Mapped[str]  = mapped_column(String(250), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    brand:       Mapped[str | None] = mapped_column(String(120))
    image_url:   Mapped[str | None] = mapped_column(String(500))

    # Barcodes / lookup
    sku:          Mapped[str | None] = mapped_column(String(100))
    default_barcode: Mapped[str | None] = mapped_column(String(100))
    hsn_code:    Mapped[str | None] = mapped_column(String(10))  # FK to hsn_codes.hsn_code

    # Pricing (defaults; variants can override)
    cost_price:    Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    selling_price: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    mrp:           Mapped[Decimal | None] = mapped_column(Numeric(14, 4))

    # GST
    gst_rate:    Mapped[GSTTaxSlab] = mapped_column(Enum(GSTTaxSlab), default=GSTTaxSlab.SLAB_18)
    cess_rate:   Mapped[Decimal]    = mapped_column(Numeric(5, 2), default=0)
    price_includes_tax: Mapped[bool] = mapped_column(Boolean, default=False)

    # Stock settings
    unit:          Mapped[str]  = mapped_column(String(20), default="pcs")
    min_stock_qty: Mapped[int]  = mapped_column(Integer, default=5)
    reorder_qty:   Mapped[int]  = mapped_column(Integer, default=10)
    track_inventory: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_negative_stock: Mapped[bool] = mapped_column(Boolean, default=False)

    # Variant config
    has_variants:  Mapped[bool] = mapped_column(Boolean, default=False)

    is_active:    Mapped[bool]     = mapped_column(Boolean, default=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    store:    Mapped[Store]              = relationship(back_populates="products")
    category: Mapped[Category | None] = relationship(back_populates="products")
    variants: Mapped[list[ProductVariant]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )
    suppliers: Mapped[list[ProductSupplier]] = relationship(back_populates="product")

    __table_args__ = (
        Index("ix_products_store_id",  "store_id"),
        Index("ix_products_sku",       "store_id", "sku"),
        Index("ix_products_barcode",   "default_barcode"),
    )


class ProductVariant(Base):
    """
    A specific purchasable SKU under a product.
    Single-variant products have exactly one row here with variant_name = 'Default'.
    Multi-variant products (e.g. Red/L, Blue/M) each have their own row.
    Stock is tracked at variant level.
    """
    __tablename__ = "product_variants"

    id:          Mapped[int]     = mapped_column(Integer, primary_key=True)
    product_id:  Mapped[int]     = mapped_column(ForeignKey("products.id"), nullable=False)
    store_id:    Mapped[int]     = mapped_column(ForeignKey("stores.id"), nullable=False)
    variant_name: Mapped[str]    = mapped_column(String(200), nullable=False, default="Default")
    barcode:     Mapped[str | None] = mapped_column(String(100))
    sku:         Mapped[str | None] = mapped_column(String(100))

    # Variant-specific pricing (overrides product defaults if set)
    cost_price:    Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    selling_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    mrp:           Mapped[Decimal | None] = mapped_column(Numeric(14, 4))

    # Variant attributes (stored as key-value)
    attributes: Mapped[dict | None] = mapped_column(JSON)
    # e.g. {"size": "L", "colour": "Red", "weight": "500g"}

    # Current stock (sum of all active batches; maintained by triggers/service)
    stock_qty:    Mapped[Decimal]  = mapped_column(Numeric(12, 3), default=0)
    is_active:    Mapped[bool]     = mapped_column(Boolean, default=True)
    image_url:    Mapped[str | None] = mapped_column(String(500))

    sort_order:   Mapped[int]      = mapped_column(Integer, default=0)
    created_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    product: Mapped[Product]          = relationship(back_populates="variants")
    batches: Mapped[list[StockBatch]] = relationship(
        back_populates="variant", cascade="all, delete-orphan",
        order_by="StockBatch.expiry_date"
    )
    sale_items: Mapped[list[SaleItem]] = relationship(back_populates="variant")

    __table_args__ = (
        Index("ix_variant_product",  "product_id"),
        Index("ix_variant_barcode",  "barcode"),
        Index("ix_variant_store",    "store_id"),
    )


class StockBatch(Base):
    """
    A batch/lot of stock for a variant.
    Supports FIFO expiry management, supplier traceability, and pharma batch numbers.
    """
    __tablename__ = "stock_batches"

    id:          Mapped[int]     = mapped_column(Integer, primary_key=True)
    variant_id:  Mapped[int]     = mapped_column(ForeignKey("product_variants.id"), nullable=False)
    store_id:    Mapped[int]     = mapped_column(ForeignKey("stores.id"), nullable=False)
    batch_number: Mapped[str]    = mapped_column(String(100), nullable=False)

    # Stock
    quantity:     Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    qty_remaining:Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)

    # Costing
    purchase_price: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    mrp:            Mapped[Decimal | None] = mapped_column(Numeric(14, 4))

    # Dates
    manufacture_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expiry_date:      Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_at:      Mapped[datetime]           = mapped_column(DateTime(timezone=True), default=utcnow)

    # Purchase Order link
    po_item_id:  Mapped[int | None] = mapped_column(ForeignKey("purchase_order_items.id"))
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"))

    is_active:   Mapped[bool] = mapped_column(Boolean, default=True)

    variant:  Mapped[ProductVariant]           = relationship(back_populates="batches")
    po_item:  Mapped[PurchaseOrderItem | None] = relationship()
    supplier: Mapped[Supplier | None]       = relationship()

    __table_args__ = (
        Index("ix_batch_variant",  "variant_id"),
        Index("ix_batch_expiry",   "expiry_date"),
        Index("ix_batch_store",    "store_id"),
    )


class StockMovement(Base):
    """
    Immutable ledger of all stock changes. Source of truth for inventory.
    Every change to stock_qty must create a row here.
    """
    __tablename__ = "stock_movements"

    id:           Mapped[int]               = mapped_column(Integer, primary_key=True)
    store_id:     Mapped[int]               = mapped_column(ForeignKey("stores.id"), nullable=False)
    variant_id:   Mapped[int]               = mapped_column(ForeignKey("product_variants.id"), nullable=False)
    batch_id:     Mapped[int | None]     = mapped_column(ForeignKey("stock_batches.id"))
    movement_type:Mapped[StockMovementType] = mapped_column(Enum(StockMovementType), nullable=False)

    qty_before:   Mapped[Decimal]  = mapped_column(Numeric(12, 3), nullable=False)
    qty_delta:    Mapped[Decimal]  = mapped_column(Numeric(12, 3), nullable=False)
    qty_after:    Mapped[Decimal]  = mapped_column(Numeric(12, 3), nullable=False)

    # Reference to source document
    reference_type: Mapped[str | None] = mapped_column(String(50))  # "sale", "purchase_order", "adjustment"
    reference_id:   Mapped[int | None] = mapped_column(Integer)

    unit_cost:  Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    reason:     Mapped[str | None]     = mapped_column(Text)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime]         = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_movement_variant",   "variant_id"),
        Index("ix_movement_store",     "store_id"),
        Index("ix_movement_created",   "created_at"),
    )


# ═══════════════════════════════════════════════════════════════════════════════
# SUPPLIERS & PURCHASE ORDERS
# ═══════════════════════════════════════════════════════════════════════════════

class Supplier(Base):
    __tablename__ = "suppliers"

    id:        Mapped[int]  = mapped_column(Integer, primary_key=True)
    store_id:  Mapped[int]  = mapped_column(ForeignKey("stores.id"), nullable=False)
    name:      Mapped[str]  = mapped_column(String(200), nullable=False)
    contact_person: Mapped[str | None] = mapped_column(String(150))
    phone:     Mapped[str | None] = mapped_column(String(20))
    email:     Mapped[str | None] = mapped_column(String(255))
    address:   Mapped[str | None] = mapped_column(Text)
    gstin:     Mapped[str | None] = mapped_column(String(20))
    credit_days: Mapped[int] = mapped_column(Integer, default=30)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ProductSupplier(Base):
    """Maps products to suppliers with supplier-specific pricing."""
    __tablename__ = "product_suppliers"

    id:          Mapped[int]     = mapped_column(Integer, primary_key=True)
    product_id:  Mapped[int]     = mapped_column(ForeignKey("products.id"), nullable=False)
    supplier_id: Mapped[int]     = mapped_column(ForeignKey("suppliers.id"), nullable=False)
    supplier_sku: Mapped[str | None] = mapped_column(String(100))
    last_price:   Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    lead_days:    Mapped[int]    = mapped_column(Integer, default=7)
    is_preferred: Mapped[bool]   = mapped_column(Boolean, default=False)

    product:  Mapped[Product]  = relationship(back_populates="suppliers")
    supplier: Mapped[Supplier] = relationship()
    __table_args__ = (UniqueConstraint("product_id", "supplier_id"),)


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id:          Mapped[int]      = mapped_column(Integer, primary_key=True)
    store_id:    Mapped[int]      = mapped_column(ForeignKey("stores.id"), nullable=False)
    supplier_id: Mapped[int]      = mapped_column(ForeignKey("suppliers.id"), nullable=False)
    po_number:   Mapped[str]      = mapped_column(String(60), nullable=False, unique=True)
    status:      Mapped[POStatus] = mapped_column(Enum(POStatus), default=POStatus.DRAFT)

    subtotal:    Mapped[Decimal]  = mapped_column(Numeric(14, 2), default=0)
    tax_amount:  Mapped[Decimal]  = mapped_column(Numeric(14, 2), default=0)
    total_amount:Mapped[Decimal]  = mapped_column(Numeric(14, 2), default=0)

    expected_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes:         Mapped[str | None]      = mapped_column(Text)

    created_by_id: Mapped[int]  = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at:    Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at:    Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    supplier: Mapped[Supplier]               = relationship()
    items:    Mapped[list[PurchaseOrderItem]] = relationship(
        back_populates="po", cascade="all, delete-orphan"
    )
    __table_args__ = (Index("ix_po_store", "store_id"),)


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    id:           Mapped[int]     = mapped_column(Integer, primary_key=True)
    po_id:        Mapped[int]     = mapped_column(ForeignKey("purchase_orders.id"), nullable=False)
    variant_id:   Mapped[int]     = mapped_column(ForeignKey("product_variants.id"), nullable=False)
    qty_ordered:  Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    qty_received: Mapped[Decimal] = mapped_column(Numeric(12, 3), default=0)
    unit_price:   Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    gst_rate:     Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    line_total:   Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    po:      Mapped[PurchaseOrder]  = relationship(back_populates="items")
    variant: Mapped[ProductVariant] = relationship()


# ═══════════════════════════════════════════════════════════════════════════════
# CUSTOMERS
# ═══════════════════════════════════════════════════════════════════════════════

class Customer(Base):
    __tablename__ = "customers"

    id:        Mapped[int]  = mapped_column(Integer, primary_key=True)
    store_id:  Mapped[int]  = mapped_column(ForeignKey("stores.id"), nullable=False)
    name:      Mapped[str]  = mapped_column(String(200), nullable=False)
    phone:     Mapped[str | None] = mapped_column(String(20))
    email:     Mapped[str | None] = mapped_column(String(255))
    address:   Mapped[str | None] = mapped_column(Text)
    gstin:     Mapped[str | None] = mapped_column(String(20))
    state_code: Mapped[str | None] = mapped_column(String(3))  # for IGST calc

    # Price tier — e.g. "Hotel", "Wholesale" (overrides default product prices)
    price_category_id: Mapped[int | None] = mapped_column(ForeignKey("price_categories.id"), nullable=True)

    # Analytics cache (updated by background task)
    total_purchases:    Mapped[int]     = mapped_column(Integer, default=0)
    total_spent:        Mapped[Decimal] = mapped_column(Numeric(16, 2), default=0)
    total_credit_given: Mapped[Decimal] = mapped_column(Numeric(16, 2), default=0)
    total_credit_repaid:Mapped[Decimal] = mapped_column(Numeric(16, 2), default=0)
    last_purchase_at:   Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    loyalty_points:     Mapped[int]     = mapped_column(Integer, default=0)

    is_active:  Mapped[bool]     = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    @property
    def outstanding_balance(self) -> Decimal:
        return self.total_credit_given - self.total_credit_repaid

    store:          Mapped[Store]                    = relationship(back_populates="customers")
    credits:        Mapped[list[Credit]]             = relationship(back_populates="customer")
    sales:          Mapped[list[Sale]]               = relationship(back_populates="customer")
    price_category: Mapped[PriceCategory | None] = relationship(foreign_keys=[price_category_id])

    __table_args__ = (
        Index("ix_customer_store", "store_id"),
        Index("ix_customer_phone", "store_id", "phone"),
    )


# ═══════════════════════════════════════════════════════════════════════════════
# SALES / BILLING
# ═══════════════════════════════════════════════════════════════════════════════

class Sale(Base):
    __tablename__ = "sales"

    id:             Mapped[int]          = mapped_column(Integer, primary_key=True)
    store_id:       Mapped[int]          = mapped_column(ForeignKey("stores.id"), nullable=False)
    branch_id:      Mapped[int | None]= mapped_column(ForeignKey("branches.id"))
    cashier_id:     Mapped[int]          = mapped_column(ForeignKey("users.id"), nullable=False)
    customer_id:    Mapped[int | None]= mapped_column(ForeignKey("customers.id"))
    invoice_number: Mapped[str]          = mapped_column(String(60), unique=True, nullable=False)
    invoice_date:   Mapped[datetime]     = mapped_column(DateTime(timezone=True), default=utcnow)

    # GST invoice type
    supply_type:   Mapped[SupplyType]    = mapped_column(Enum(SupplyType), default=SupplyType.INTRA_STATE)
    is_b2b:        Mapped[bool]          = mapped_column(Boolean, default=False)
    customer_gstin: Mapped[str | None] = mapped_column(String(20))

    # Amounts
    subtotal:      Mapped[Decimal]       = mapped_column(Numeric(14, 2), nullable=False)
    discount:      Mapped[Decimal]       = mapped_column(Numeric(14, 2), default=0)
    taxable_amount:Mapped[Decimal]       = mapped_column(Numeric(14, 2), nullable=False)
    cgst_amount:   Mapped[Decimal]       = mapped_column(Numeric(12, 2), default=0)
    sgst_amount:   Mapped[Decimal]       = mapped_column(Numeric(12, 2), default=0)
    igst_amount:   Mapped[Decimal]       = mapped_column(Numeric(12, 2), default=0)
    cess_amount:   Mapped[Decimal]       = mapped_column(Numeric(12, 2), default=0)
    total_tax:     Mapped[Decimal]       = mapped_column(Numeric(12, 2), default=0)
    round_off:     Mapped[Decimal]       = mapped_column(Numeric(6, 2), default=0)
    total_amount:  Mapped[Decimal]       = mapped_column(Numeric(14, 2), nullable=False)

    # Payment
    payment_method: Mapped[PaymentMethod]= mapped_column(Enum(PaymentMethod))
    amount_paid:    Mapped[Decimal]      = mapped_column(Numeric(14, 2), default=0)
    amount_due:     Mapped[Decimal]      = mapped_column(Numeric(14, 2), default=0)
    payment_ref:    Mapped[str | None]= mapped_column(String(100))  # UPI txn id, etc.

    status:     Mapped[SaleStatus]       = mapped_column(Enum(SaleStatus), default=SaleStatus.COMPLETED)
    notes:      Mapped[str | None]    = mapped_column(Text)

    # Shift tracking
    shift_id:      Mapped[int | None] = mapped_column(ForeignKey("shift_sessions.id"), nullable=True)
    price_category_id: Mapped[int | None] = mapped_column(ForeignKey("price_categories.id"), nullable=True)

    # Offline sync
    is_synced:  Mapped[bool]             = mapped_column(Boolean, default=True)
    local_id:   Mapped[str | None]    = mapped_column(String(60), unique=True)

    # PDF
    invoice_pdf_url: Mapped[str | None] = mapped_column(String(500))

    created_at: Mapped[datetime]         = mapped_column(DateTime(timezone=True), default=utcnow)

    store:    Mapped[Store]                 = relationship(back_populates="sales")
    cashier:  Mapped[User]                  = relationship(back_populates="sales")
    customer: Mapped[Customer | None]    = relationship(back_populates="sales")
    items:    Mapped[list[SaleItem]]         = relationship(
        back_populates="sale", cascade="all, delete-orphan"
    )
    payments: Mapped[list[SalePayment]]     = relationship(
        back_populates="sale", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_sale_store_date", "store_id", "created_at"),
        Index("ix_sale_customer",   "customer_id"),
        Index("ix_sale_local_id",   "local_id"),
    )


class SaleItem(Base):
    __tablename__ = "sale_items"

    id:          Mapped[int]     = mapped_column(Integer, primary_key=True)
    sale_id:     Mapped[int]     = mapped_column(ForeignKey("sales.id"), nullable=False)
    product_id:  Mapped[int]     = mapped_column(ForeignKey("products.id"), nullable=False)
    variant_id:  Mapped[int]     = mapped_column(ForeignKey("product_variants.id"), nullable=False)
    batch_id:    Mapped[int | None] = mapped_column(ForeignKey("stock_batches.id"))

    # Snapshot at time of sale (immutable after creation)
    product_name:  Mapped[str]     = mapped_column(String(250), nullable=False)
    hsn_code:      Mapped[str | None] = mapped_column(String(10))
    variant_name:  Mapped[str]     = mapped_column(String(200), default="Default")
    qty:           Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    unit:          Mapped[str]     = mapped_column(String(20), default="pcs")
    unit_price:    Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    cost_price:    Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)  # for profit calc
    mrp:           Mapped[Decimal | None] = mapped_column(Numeric(14, 4))
    discount:      Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    taxable_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    line_total:    Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    # GST breakdown (one-to-one)
    gst_component: Mapped[GSTTaxComponent | None] = relationship(
        back_populates="sale_item", cascade="all, delete-orphan"
    )

    sale:    Mapped[Sale]           = relationship(back_populates="items")
    variant: Mapped[ProductVariant] = relationship(back_populates="sale_items")

    __table_args__ = (Index("ix_sale_item_sale", "sale_id"),)


class SalePayment(Base):
    """Supports split payments — one sale can have multiple payment rows."""
    __tablename__ = "sale_payments"

    id:             Mapped[int]          = mapped_column(Integer, primary_key=True)
    sale_id:        Mapped[int]          = mapped_column(ForeignKey("sales.id"), nullable=False)
    method:         Mapped[PaymentMethod]= mapped_column(Enum(PaymentMethod), nullable=False)
    amount:         Mapped[Decimal]      = mapped_column(Numeric(14, 2), nullable=False)
    reference:      Mapped[str | None]= mapped_column(String(100))
    gateway_status: Mapped[str | None]= mapped_column(String(50))
    created_at:     Mapped[datetime]     = mapped_column(DateTime(timezone=True), default=utcnow)

    sale: Mapped[Sale] = relationship(back_populates="payments")


# ═══════════════════════════════════════════════════════════════════════════════
# CREDIT / UDHAR
# ═══════════════════════════════════════════════════════════════════════════════

class Credit(Base):
    __tablename__ = "credits"

    id:           Mapped[int]          = mapped_column(Integer, primary_key=True)
    store_id:     Mapped[int]          = mapped_column(ForeignKey("stores.id"), nullable=False)
    customer_id:  Mapped[int]          = mapped_column(ForeignKey("customers.id"), nullable=False)
    sale_id:      Mapped[int | None]= mapped_column(ForeignKey("sales.id"))
    amount:       Mapped[Decimal]      = mapped_column(Numeric(14, 2), nullable=False)
    amount_repaid:Mapped[Decimal]      = mapped_column(Numeric(14, 2), default=0)
    balance:      Mapped[Decimal]      = mapped_column(Numeric(14, 2), nullable=False)
    due_date:     Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status:       Mapped[CreditStatus] = mapped_column(Enum(CreditStatus), default=CreditStatus.OPEN)
    notes:        Mapped[str | None]= mapped_column(Text)
    created_at:   Mapped[datetime]     = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at:   Mapped[datetime]     = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    customer:   Mapped[Customer]              = relationship(back_populates="credits")
    repayments: Mapped[list[CreditRepayment]] = relationship(
        back_populates="credit", cascade="all, delete-orphan"
    )
    __table_args__ = (Index("ix_credit_store_customer", "store_id", "customer_id"),)


class CreditRepayment(Base):
    __tablename__ = "credit_repayments"

    id:         Mapped[int]          = mapped_column(Integer, primary_key=True)
    credit_id:  Mapped[int]          = mapped_column(ForeignKey("credits.id"), nullable=False)
    amount:     Mapped[Decimal]      = mapped_column(Numeric(14, 2), nullable=False)
    method:     Mapped[PaymentMethod]= mapped_column(Enum(PaymentMethod))
    reference:  Mapped[str | None]= mapped_column(String(100))
    notes:      Mapped[str | None]= mapped_column(Text)
    created_at: Mapped[datetime]     = mapped_column(DateTime(timezone=True), default=utcnow)

    credit: Mapped[Credit] = relationship(back_populates="repayments")


# ═══════════════════════════════════════════════════════════════════════════════
# ALERTS & AUDIT
# ═══════════════════════════════════════════════════════════════════════════════

class BusinessAlert(Base):
    __tablename__ = "business_alerts"

    id:          Mapped[int]           = mapped_column(Integer, primary_key=True)
    store_id:    Mapped[int]           = mapped_column(ForeignKey("stores.id"), nullable=False)
    alert_type:  Mapped[AlertType]     = mapped_column(Enum(AlertType), nullable=False)
    severity:    Mapped[AlertSeverity] = mapped_column(Enum(AlertSeverity), default=AlertSeverity.MEDIUM)
    title:       Mapped[str]           = mapped_column(String(250), nullable=False)
    description: Mapped[str]           = mapped_column(Text, nullable=False)
    meta:        Mapped[dict | None]= mapped_column(JSON)
    is_read:     Mapped[bool]          = mapped_column(Boolean, default=False)
    is_resolved: Mapped[bool]          = mapped_column(Boolean, default=False)
    created_at:  Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_alert_store_unresolved", "store_id", "is_resolved"),
    )


class AuditLog(Base):
    """
    Immutable audit trail of all significant actions.
    Never deleted — archived to cold storage after 90 days.
    """
    __tablename__ = "audit_logs"

    id:          Mapped[int]  = mapped_column(Integer, primary_key=True)
    store_id:    Mapped[int]  = mapped_column(ForeignKey("stores.id"), nullable=False)
    user_id:     Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    action:      Mapped[str]  = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str]  = mapped_column(String(50), nullable=False)
    entity_id:   Mapped[int | None] = mapped_column(Integer)
    old_values:  Mapped[dict | None] = mapped_column(JSON)
    new_values:  Mapped[dict | None] = mapped_column(JSON)
    ip_address:  Mapped[str | None]  = mapped_column(String(45))
    user_agent:  Mapped[str | None]  = mapped_column(String(500))
    created_at:  Mapped[datetime]       = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_audit_store_date", "store_id", "created_at"),
        Index("ix_audit_entity",     "entity_type", "entity_id"),
    )


class SyncLog(Base):
    __tablename__ = "sync_logs"

    id:           Mapped[int]  = mapped_column(Integer, primary_key=True)
    store_id:     Mapped[int]  = mapped_column(ForeignKey("stores.id"), nullable=False)
    device_id:    Mapped[str]  = mapped_column(String(100), nullable=False)
    records_sent: Mapped[int]  = mapped_column(Integer, default=0)
    records_recv: Mapped[int]  = mapped_column(Integer, default=0)
    conflicts:    Mapped[int]  = mapped_column(Integer, default=0)
    status:       Mapped[str]  = mapped_column(String(20), default="success")
    error_msg:    Mapped[str | None] = mapped_column(Text)
    synced_at:    Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=utcnow)


# ═══════════════════════════════════════════════════════════════════════════════
# PRICE CATEGORIES (Customer Tier Pricing)
# ═══════════════════════════════════════════════════════════════════════════════

class PriceCategory(Base):
    """
    Named pricing tier assigned to customers.
    E.g. "Retail" (default), "Hotel", "Wholesale", "Distributor".
    When a customer has a price_category_id, billing uses the tier price
    for each product instead of the standard selling_price.
    """
    __tablename__ = "price_categories"

    id:          Mapped[int]  = mapped_column(Integer, primary_key=True)
    store_id:    Mapped[int]  = mapped_column(ForeignKey("stores.id"), nullable=False)
    name:        Mapped[str]  = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(300))
    color:       Mapped[str]  = mapped_column(String(10), default="#6366f1")  # hex for UI badge
    is_default:  Mapped[bool] = mapped_column(Boolean, default=False)         # the standard retail tier
    is_active:   Mapped[bool] = mapped_column(Boolean, default=True)
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    price_tiers: Mapped[list[ProductPriceTier]] = relationship(
        back_populates="price_category", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("store_id", "name"),
        Index("ix_price_category_store", "store_id"),
    )


class ProductPriceTier(Base):
    """
    Overrides a product's standard selling_price for a specific PriceCategory.
    If a row exists here for (product_id, price_category_id), that price is used.
    If no row exists, falls back to product.selling_price.
    """
    __tablename__ = "product_price_tiers"

    id:                 Mapped[int]     = mapped_column(Integer, primary_key=True)
    store_id:           Mapped[int]     = mapped_column(ForeignKey("stores.id"), nullable=False)
    price_category_id:  Mapped[int]     = mapped_column(ForeignKey("price_categories.id"), nullable=False)
    product_id:         Mapped[int]     = mapped_column(ForeignKey("products.id"), nullable=False)
    price:              Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    created_at:         Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at:         Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    price_category: Mapped[PriceCategory] = relationship(back_populates="price_tiers")
    product:        Mapped[Product]        = relationship()

    __table_args__ = (
        UniqueConstraint("price_category_id", "product_id"),
        Index("ix_price_tier_category", "price_category_id"),
        Index("ix_price_tier_product",  "product_id"),
    )


# ═══════════════════════════════════════════════════════════════════════════════
# SHIFT MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

class ShiftSession(Base):
    """
    A cashier's shift — tracks opening/closing cash and links all sales within it.
    Enables end-of-day cash reconciliation reports.
    """
    __tablename__ = "shift_sessions"

    id:            Mapped[int]         = mapped_column(Integer, primary_key=True)
    store_id:      Mapped[int]         = mapped_column(ForeignKey("stores.id"), nullable=False)
    opened_by_id:  Mapped[int]         = mapped_column(ForeignKey("users.id"), nullable=False)
    closed_by_id:  Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    opened_at:     Mapped[datetime]    = mapped_column(DateTime(timezone=True), default=utcnow)
    closed_at:     Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    opening_cash:  Mapped[Decimal]     = mapped_column(Numeric(14, 2), default=0)
    closing_cash:  Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    # Expected = opening_cash + cash sales during shift
    expected_cash: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)

    total_sales:       Mapped[int]     = mapped_column(Integer, default=0)
    total_revenue:     Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    cash_sales:        Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    upi_sales:         Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    card_sales:        Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    credit_sales:      Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)

    notes:         Mapped[str | None] = mapped_column(Text)
    status:        Mapped[ShiftStatus]   = mapped_column(Enum(ShiftStatus), default=ShiftStatus.OPEN)

    opened_by: Mapped[User] = relationship(foreign_keys=[opened_by_id])
    closed_by: Mapped[User | None] = relationship(foreign_keys=[closed_by_id])

    __table_args__ = (
        Index("ix_shift_store_status", "store_id", "status"),
        Index("ix_shift_opened_at",    "store_id", "opened_at"),
    )
