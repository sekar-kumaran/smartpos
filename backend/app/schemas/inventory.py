"""
SmartPOS AI – Inventory Schemas (Phase 1A)
Pydantic v2 request/response models.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.models import GSTTaxSlab, POStatus, StockMovementType

# ─── Category ─────────────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    store_id: int
    name:     str  = Field(..., min_length=1, max_length=120)
    parent_id: int | None = None
    sort_order: int = 0


class CategoryOut(BaseModel):
    id:         int
    store_id:   int
    name:       str
    parent_id:  int | None
    sort_order: int
    model_config = {"from_attributes": True}


# ─── Product ──────────────────────────────────────────────────────────────────

class ProductCreate(BaseModel):
    store_id:      int
    category_id:   int | None = None
    name:          str     = Field(..., min_length=1, max_length=250)
    description:   str | None = None
    brand:         str | None = None
    sku:           str | None = None
    default_barcode: str | None = None
    hsn_code:      str | None = Field(None, max_length=10)

    cost_price:    Decimal = Field(..., gt=0)
    selling_price: Decimal = Field(..., gt=0)
    mrp:           Decimal | None = None
    gst_rate:      GSTTaxSlab = GSTTaxSlab.SLAB_18
    tax_rate:      Decimal | None = None
    cess_rate:     Decimal = Field(default=0, ge=0, le=100)
    price_includes_tax: bool = False

    unit:           str  = Field("pcs", max_length=20)
    min_stock_qty:  int  = Field(5, ge=0)
    reorder_qty:    int  = Field(10, ge=0)
    track_inventory: bool = True
    allow_negative_stock: bool = False
    has_variants:   bool = False
    opening_stock:  int  = Field(0, ge=0)
    stock_qty:      int | None = Field(None, ge=0)

    @model_validator(mode="before")
    @classmethod
    def accept_legacy_inventory_fields(cls, data):
        if isinstance(data, dict):
            data = data.copy()
            if "tax_rate" in data and "gst_rate" not in data:
                data["gst_rate"] = str(data["tax_rate"]).rstrip("0").rstrip(".")
            if "stock_qty" in data and "opening_stock" not in data:
                data["opening_stock"] = data["stock_qty"]
        return data

    @field_validator("selling_price")
    @classmethod
    def price_check(cls, v, info):
        cost = info.data.get("cost_price")
        if cost and v < cost:
            raise ValueError("selling_price must be ≥ cost_price")
        return v


class ProductUpdate(BaseModel):
    name:          str | None        = None
    category_id:   int | None        = None
    cost_price:    Decimal | None    = None
    selling_price: Decimal | None    = None
    mrp:           Decimal | None    = None
    gst_rate:      GSTTaxSlab | None = None
    cess_rate:     Decimal | None    = None
    min_stock_qty: int | None        = None
    reorder_qty:   int | None        = None
    hsn_code:      str | None        = None
    is_active:     bool | None       = None


class VariantOut(BaseModel):
    id:            int
    variant_name:  str
    barcode:       str | None
    sku:           str | None
    cost_price:    Decimal | None
    selling_price: Decimal | None
    mrp:           Decimal | None
    attributes:    dict[str, Any] | None
    stock_qty:     float
    is_active:     bool
    model_config = {"from_attributes": True}


class ProductOut(BaseModel):
    id:              int
    store_id:        int
    category_id:     int | None
    name:            str
    brand:           str | None
    sku:             str | None
    default_barcode: str | None
    hsn_code:        str | None
    cost_price:      Decimal
    selling_price:   Decimal
    mrp:             Decimal | None
    gst_rate:        GSTTaxSlab
    tax_rate:        float | None = None
    cess_rate:       Decimal
    price_includes_tax: bool
    unit:            str
    min_stock_qty:   int
    reorder_qty:     int
    has_variants:    bool
    is_active:       bool
    total_stock:     float | None = None   # computed
    stock_qty:       float | None = None   # default variant compatibility
    margin_pct:      float | None   = None   # computed
    variants:        list[VariantOut]  = []
    created_at:      datetime
    model_config = {"from_attributes": True}


# ─── Variant ──────────────────────────────────────────────────────────────────

class VariantCreate(BaseModel):
    product_id:    int
    store_id:      int
    variant_name:  str  = Field(..., min_length=1, max_length=200)
    attributes:    dict[str, Any] | None = None
    cost_price:    Decimal | None = None
    selling_price: Decimal | None = None
    mrp:           Decimal | None = None
    barcode:       str | None = None
    sku:           str | None = None


# ─── Stock Batch ──────────────────────────────────────────────────────────────

class BatchReceive(BaseModel):
    variant_id:      int
    store_id:        int
    batch_number:    str     = Field(..., min_length=1, max_length=100)
    quantity:        Decimal = Field(..., gt=0)
    purchase_price:  Decimal = Field(..., gt=0)
    expiry_date:     datetime | None = None
    manufacture_date: datetime | None = None
    mrp:             Decimal | None = None
    supplier_id:     int | None = None


class BatchOut(BaseModel):
    id:              int
    variant_id:      int
    batch_number:    str
    quantity:        float
    qty_remaining:   float
    purchase_price:  float
    mrp:             float | None
    expiry_date:     datetime | None
    manufacture_date: datetime | None
    received_at:     datetime
    is_active:       bool
    model_config = {"from_attributes": True}


# ─── Stock Adjustment ─────────────────────────────────────────────────────────

class StockAdjustment(BaseModel):
    variant_id: int | None = None
    product_id: int | None = None
    store_id:   int = 1
    delta:      Decimal = Field(..., description="Positive=add, Negative=remove")
    reason:     str     = Field(..., min_length=3)


class StockMovementOut(BaseModel):
    id:             int
    variant_id:     int
    movement_type:  StockMovementType
    qty_before:     Decimal
    qty_delta:      Decimal
    qty_after:      Decimal
    reference_type: str | None
    reference_id:   int | None
    reason:         str | None
    created_at:     datetime
    model_config = {"from_attributes": True}


# ─── Inventory Health ─────────────────────────────────────────────────────────

class InventoryHealth(BaseModel):
    total_products:         int
    low_stock_count:        int
    out_of_stock_count:     int
    overstock_count:        int
    total_inventory_value:  float


# ─── Purchase Order ───────────────────────────────────────────────────────────

class POItemCreate(BaseModel):
    variant_id:  int
    qty_ordered: Decimal = Field(..., gt=0)
    unit_price:  Decimal = Field(..., gt=0)
    gst_rate:    Decimal = Field(default=0, ge=0, le=28)


class POCreate(BaseModel):
    store_id:      int
    supplier_id:   int
    items:         list[POItemCreate] = Field(..., min_length=1)
    expected_date: datetime | None = None
    notes:         str | None = None


class POItemOut(BaseModel):
    id:           int
    variant_id:   int
    qty_ordered:  Decimal
    qty_received: Decimal
    unit_price:   Decimal
    gst_rate:     Decimal
    line_total:   Decimal
    model_config = {"from_attributes": True}


class POOut(BaseModel):
    id:            int
    store_id:      int
    supplier_id:   int
    po_number:     str
    status:        POStatus
    subtotal:      Decimal
    tax_amount:    Decimal
    total_amount:  Decimal
    expected_date: datetime | None
    received_date: datetime | None
    notes:         str | None
    items:         list[POItemOut] = []
    created_at:    datetime
    model_config = {"from_attributes": True}


# ─── Supplier ─────────────────────────────────────────────────────────────────

class SupplierCreate(BaseModel):
    store_id:       int
    name:           str  = Field(..., min_length=2, max_length=200)
    contact_person: str | None = None
    phone:          str | None = None
    email:          str | None = None
    address:        str | None = None
    gstin:          str | None = None
    credit_days:    int = 30


class SupplierOut(SupplierCreate):
    id:         int
    is_active:  bool
    created_at: datetime
    model_config = {"from_attributes": True}
