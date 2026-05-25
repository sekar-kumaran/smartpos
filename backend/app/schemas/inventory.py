"""
SmartPOS AI – Inventory Schemas (Phase 1A)
Pydantic v2 request/response models.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.models import GSTTaxSlab, POStatus, StockMovementType


# ─── Category ─────────────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    store_id: int
    name:     str  = Field(..., min_length=1, max_length=120)
    parent_id: Optional[int] = None
    sort_order: int = 0


class CategoryOut(BaseModel):
    id:         int
    store_id:   int
    name:       str
    parent_id:  Optional[int]
    sort_order: int
    model_config = {"from_attributes": True}


# ─── Product ──────────────────────────────────────────────────────────────────

class ProductCreate(BaseModel):
    store_id:      int
    category_id:   Optional[int] = None
    name:          str     = Field(..., min_length=1, max_length=250)
    description:   Optional[str] = None
    brand:         Optional[str] = None
    sku:           Optional[str] = None
    default_barcode: Optional[str] = None
    hsn_code:      Optional[str] = Field(None, max_length=10)

    cost_price:    Decimal = Field(..., gt=0)
    selling_price: Decimal = Field(..., gt=0)
    mrp:           Optional[Decimal] = None
    gst_rate:      GSTTaxSlab = GSTTaxSlab.SLAB_18
    tax_rate:      Optional[Decimal] = None
    cess_rate:     Decimal = Field(default=0, ge=0, le=100)
    price_includes_tax: bool = False

    unit:           str  = Field("pcs", max_length=20)
    min_stock_qty:  int  = Field(5, ge=0)
    reorder_qty:    int  = Field(10, ge=0)
    track_inventory: bool = True
    allow_negative_stock: bool = False
    has_variants:   bool = False
    opening_stock:  int  = Field(0, ge=0)
    stock_qty:      Optional[int] = Field(None, ge=0)

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
    name:          Optional[str]        = None
    category_id:   Optional[int]        = None
    cost_price:    Optional[Decimal]    = None
    selling_price: Optional[Decimal]    = None
    mrp:           Optional[Decimal]    = None
    gst_rate:      Optional[GSTTaxSlab] = None
    cess_rate:     Optional[Decimal]    = None
    min_stock_qty: Optional[int]        = None
    reorder_qty:   Optional[int]        = None
    hsn_code:      Optional[str]        = None
    is_active:     Optional[bool]       = None


class VariantOut(BaseModel):
    id:            int
    variant_name:  str
    barcode:       Optional[str]
    sku:           Optional[str]
    cost_price:    Optional[Decimal]
    selling_price: Optional[Decimal]
    mrp:           Optional[Decimal]
    attributes:    Optional[Dict[str, Any]]
    stock_qty:     float
    is_active:     bool
    model_config = {"from_attributes": True}


class ProductOut(BaseModel):
    id:              int
    store_id:        int
    category_id:     Optional[int]
    name:            str
    brand:           Optional[str]
    sku:             Optional[str]
    default_barcode: Optional[str]
    hsn_code:        Optional[str]
    cost_price:      Decimal
    selling_price:   Decimal
    mrp:             Optional[Decimal]
    gst_rate:        GSTTaxSlab
    tax_rate:        Optional[float] = None
    cess_rate:       Decimal
    price_includes_tax: bool
    unit:            str
    min_stock_qty:   int
    reorder_qty:     int
    has_variants:    bool
    is_active:       bool
    total_stock:     Optional[float] = None   # computed
    stock_qty:       Optional[float] = None   # default variant compatibility
    margin_pct:      Optional[float]   = None   # computed
    variants:        List[VariantOut]  = []
    created_at:      datetime
    model_config = {"from_attributes": True}


# ─── Variant ──────────────────────────────────────────────────────────────────

class VariantCreate(BaseModel):
    product_id:    int
    store_id:      int
    variant_name:  str  = Field(..., min_length=1, max_length=200)
    attributes:    Optional[Dict[str, Any]] = None
    cost_price:    Optional[Decimal] = None
    selling_price: Optional[Decimal] = None
    mrp:           Optional[Decimal] = None
    barcode:       Optional[str] = None
    sku:           Optional[str] = None


# ─── Stock Batch ──────────────────────────────────────────────────────────────

class BatchReceive(BaseModel):
    variant_id:      int
    store_id:        int
    batch_number:    str     = Field(..., min_length=1, max_length=100)
    quantity:        Decimal = Field(..., gt=0)
    purchase_price:  Decimal = Field(..., gt=0)
    expiry_date:     Optional[datetime] = None
    manufacture_date: Optional[datetime] = None
    mrp:             Optional[Decimal] = None
    supplier_id:     Optional[int] = None


class BatchOut(BaseModel):
    id:              int
    variant_id:      int
    batch_number:    str
    quantity:        float
    qty_remaining:   float
    purchase_price:  float
    mrp:             Optional[float]
    expiry_date:     Optional[datetime]
    manufacture_date: Optional[datetime]
    received_at:     datetime
    is_active:       bool
    model_config = {"from_attributes": True}


# ─── Stock Adjustment ─────────────────────────────────────────────────────────

class StockAdjustment(BaseModel):
    variant_id: Optional[int] = None
    product_id: Optional[int] = None
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
    reference_type: Optional[str]
    reference_id:   Optional[int]
    reason:         Optional[str]
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
    items:         List[POItemCreate] = Field(..., min_length=1)
    expected_date: Optional[datetime] = None
    notes:         Optional[str] = None


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
    expected_date: Optional[datetime]
    received_date: Optional[datetime]
    notes:         Optional[str]
    items:         List[POItemOut] = []
    created_at:    datetime
    model_config = {"from_attributes": True}


# ─── Supplier ─────────────────────────────────────────────────────────────────

class SupplierCreate(BaseModel):
    store_id:       int
    name:           str  = Field(..., min_length=2, max_length=200)
    contact_person: Optional[str] = None
    phone:          Optional[str] = None
    email:          Optional[str] = None
    address:        Optional[str] = None
    gstin:          Optional[str] = None
    credit_days:    int = 30


class SupplierOut(SupplierCreate):
    id:         int
    is_active:  bool
    created_at: datetime
    model_config = {"from_attributes": True}
