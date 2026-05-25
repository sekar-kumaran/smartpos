"""
SmartPOS AI – Pydantic Schemas
Request/Response models for all API endpoints.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.models import (
    AlertSeverity, AlertType, CreditStatus, PaymentMethod,
    SaleStatus, ShiftStatus, UserRole,
)


# ─── Common ───────────────────────────────────────────────────────────────────

class PaginatedResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list


class MessageResponse(BaseModel):
    message: str


# ─── Auth ─────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name:     str         = Field(..., min_length=1, max_length=120)
    email:    EmailStr
    phone:    str | None = None
    password: str         = Field(..., min_length=8)
    role:     UserRole    = UserRole.CASHIER
    store_id: int | None = None


class LoginRequest(BaseModel):
    email:    EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token:  str
    refresh_token: str
    token_type:    str = "bearer"
    expires_in:    int         # seconds
    user_id:       int
    role:          str


class UserOut(BaseModel):
    id:         int
    name:       str
    email:      str
    phone:      str | None
    role:       UserRole
    is_active:  bool
    store_id:   int | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Store ────────────────────────────────────────────────────────────────────

class StoreCreate(BaseModel):
    name:     str = Field(..., min_length=2, max_length=150)
    address:  str | None = None
    phone:    str | None = None
    gstin:    str | None = None
    currency: str = "INR"


class StoreOut(StoreCreate):
    id:         int
    created_at: datetime
    model_config = {"from_attributes": True}


# ─── Category ─────────────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class CategoryOut(CategoryCreate):
    id: int
    model_config = {"from_attributes": True}


# ─── Product / Inventory ──────────────────────────────────────────────────────

class ProductCreate(BaseModel):
    store_id:      int
    category_id:   int | None = None
    name:          str      = Field(..., min_length=1, max_length=200)
    sku:           str | None = None
    barcode:       str | None = None
    unit:          str      = "pcs"
    cost_price:    Decimal  = Field(..., ge=0)
    selling_price: Decimal  = Field(..., ge=0)
    tax_rate:      Decimal  = Field(default=0, ge=0, le=100)
    stock_qty:     int      = Field(default=0, ge=0)
    min_stock_qty: int      = Field(default=5, ge=0)

    @field_validator("selling_price")
    @classmethod
    def selling_gte_cost(cls, v, info):
        cost = info.data.get("cost_price")
        if cost is not None and v < cost:
            raise ValueError("selling_price must be ≥ cost_price")
        return v


class ProductUpdate(BaseModel):
    name:          str | None     = None
    category_id:   int | None     = None
    cost_price:    Decimal | None = None
    selling_price: Decimal | None = None
    tax_rate:      Decimal | None = None
    min_stock_qty: int | None     = None
    is_active:     bool | None    = None


class StockAdjustment(BaseModel):
    product_id: int
    delta:      int   = Field(..., description="Positive = add stock, Negative = reduce")
    reason:     str   = Field(..., min_length=3)


class ProductOut(BaseModel):
    id:            int
    store_id:      int
    category_id:   int | None
    name:          str
    sku:           str | None
    barcode:       str | None
    unit:          str
    cost_price:    Decimal
    selling_price: Decimal
    tax_rate:      Decimal
    stock_qty:     int
    min_stock_qty: int
    is_active:     bool
    margin_pct:    float | None = None   # computed
    created_at:    datetime
    model_config = {"from_attributes": True}


# ─── Customer ─────────────────────────────────────────────────────────────────

class CustomerCreate(BaseModel):
    store_id:          int
    name:              str           = Field(..., min_length=2, max_length=150)
    phone:             str | None = None
    address:           str | None = None
    price_category_id: int | None = None


class CustomerUpdate(BaseModel):
    name:              str | None = None
    phone:             str | None = None
    address:           str | None = None
    price_category_id: int | None = None


class CustomerOut(BaseModel):
    id:                  int
    store_id:            int
    name:                str
    phone:               str | None
    address:             str | None
    price_category_id:   int | None
    price_category_name: str | None = None   # populated via join
    total_credit_given:  Decimal
    total_credit_repaid: Decimal
    outstanding_balance: Decimal        # computed
    created_at:          datetime
    model_config = {"from_attributes": True}


# ─── Price Categories ─────────────────────────────────────────────────────────

class PriceCategoryCreate(BaseModel):
    store_id:    int
    name:        str           = Field(..., min_length=1, max_length=100)
    description: str | None = None
    color:       str           = "#6366f1"
    is_default:  bool          = False


class PriceCategoryUpdate(BaseModel):
    name:        str | None  = None
    description: str | None  = None
    color:       str | None  = None
    is_active:   bool | None = None


class PriceCategoryOut(BaseModel):
    id:          int
    store_id:    int
    name:        str
    description: str | None
    color:       str
    is_default:  bool
    is_active:   bool
    created_at:  datetime
    model_config = {"from_attributes": True}


class ProductPriceTierCreate(BaseModel):
    store_id:          int
    price_category_id: int | None = None
    product_id:        int
    price:             Decimal = Field(..., ge=0)


class ProductPriceTierOut(BaseModel):
    id:                 int
    price_category_id:  int
    product_id:         int
    price:              Decimal
    product_name:       str | None = None   # populated via join
    created_at:         datetime
    model_config = {"from_attributes": True}


# ─── Shift Management ─────────────────────────────────────────────────────────

class ShiftOpenRequest(BaseModel):
    store_id:     int
    opening_cash: Decimal = Field(default=0, ge=0)
    notes:        str | None = None


class ShiftCloseRequest(BaseModel):
    closing_cash: Decimal = Field(..., ge=0)
    notes:        str | None = None


class ShiftOut(BaseModel):
    id:            int
    store_id:      int
    opened_by_id:  int
    closed_by_id:  int | None
    opened_at:     datetime
    closed_at:     datetime | None
    opening_cash:  Decimal
    closing_cash:  Decimal | None
    expected_cash: Decimal | None
    total_sales:   int
    total_revenue: Decimal
    cash_sales:    Decimal
    upi_sales:     Decimal
    card_sales:    Decimal
    credit_sales:  Decimal
    cash_variance: Decimal | None = None   # closing_cash - expected_cash
    notes:         str | None
    status:        ShiftStatus
    opened_by_name: str | None = None
    model_config = {"from_attributes": True}


# ─── Demand Forecast ──────────────────────────────────────────────────────────

class DemandForecastItem(BaseModel):
    product_id:         int
    product_name:       str
    current_stock:      Decimal
    avg_daily_sales:    float
    days_of_stock_left: float | None   # None = no sales data
    forecast_7d:        float             # predicted units needed next 7 days
    reorder_suggested:  bool
    reorder_qty:        int
    stockout_date:      str | None     # ISO date string or None


# ─── Billing ──────────────────────────────────────────────────────────────────

class SaleItemCreate(BaseModel):
    product_id: int
    qty:        Decimal = Field(..., gt=0)
    unit_price: Decimal | None = None   # override; else uses product price
    discount:   Decimal = Field(default=0, ge=0)


class SaleCreate(BaseModel):
    store_id:       int
    customer_id:    int | None          = None
    items:          list[SaleItemCreate]   = Field(..., min_length=1)
    payment_method: PaymentMethod          = PaymentMethod.CASH
    discount:       Decimal                = Field(default=0, ge=0)
    amount_paid:    Decimal | None      = None
    notes:          str | None          = None
    local_id:       str | None          = None   # device UUID for dedup


class SaleItemOut(BaseModel):
    id:          int
    product_id:  int
    qty:         Decimal
    unit_price:  Decimal
    cost_price:  Decimal
    tax_rate:    Decimal
    discount:    Decimal
    line_total:  Decimal
    model_config = {"from_attributes": True}


class SaleOut(BaseModel):
    id:             int
    store_id:       int
    cashier_id:     int
    customer_id:    int | None
    invoice_number: str
    subtotal:       Decimal
    tax_amount:     Decimal
    discount:       Decimal
    total_amount:   Decimal
    payment_method: PaymentMethod
    amount_paid:    Decimal
    amount_due:     Decimal
    status:         SaleStatus
    notes:          str | None
    is_synced:      bool
    items:          list[SaleItemOut] = []
    created_at:     datetime
    model_config = {"from_attributes": True}


# ─── Credit ───────────────────────────────────────────────────────────────────

class CreditCreate(BaseModel):
    store_id:    int
    customer_id: int
    sale_id:     int | None = None
    amount:      Decimal = Field(..., gt=0)
    due_date:    datetime | None = None
    notes:       str | None = None


class RepaymentCreate(BaseModel):
    credit_id: int
    amount:    Decimal = Field(..., gt=0)
    method:    PaymentMethod = PaymentMethod.CASH
    notes:     str | None = None


class CreditOut(BaseModel):
    id:            int
    store_id:      int
    customer_id:   int
    sale_id:       int | None
    amount:        Decimal
    amount_repaid: Decimal
    balance:       Decimal
    due_date:      datetime | None
    status:        CreditStatus
    notes:         str | None
    created_at:    datetime
    model_config = {"from_attributes": True}


# ─── Analytics ────────────────────────────────────────────────────────────────

class DateRangeFilter(BaseModel):
    store_id:   int
    start_date: datetime
    end_date:   datetime


class ProfitSummary(BaseModel):
    period:          str
    total_revenue:   Decimal
    total_cost:      Decimal
    gross_profit:    Decimal
    gross_margin_pct: float
    total_transactions: int
    avg_basket_value: Decimal


class InventoryHealth(BaseModel):
    total_products:     int
    low_stock_count:    int
    out_of_stock_count: int
    overstock_count:    int
    total_inventory_value: Decimal


class CreditExposure(BaseModel):
    total_outstanding: Decimal
    overdue_amount:    Decimal
    customer_count:    int
    overdue_count:     int


class DashboardSummary(BaseModel):
    profit:    ProfitSummary
    inventory: InventoryHealth
    credit:    CreditExposure
    alerts:    list[dict]


# ─── Alerts ───────────────────────────────────────────────────────────────────

class AlertOut(BaseModel):
    id:          int
    store_id:    int
    alert_type:  AlertType
    severity:    AlertSeverity
    title:       str
    description: str
    is_read:     bool
    is_resolved: bool
    created_at:  datetime
    model_config = {"from_attributes": True}


# ─── Sync ─────────────────────────────────────────────────────────────────────

class SyncPayload(BaseModel):
    device_id: str
    store_id:  int
    sales:     list[SaleCreate] = []
    timestamp: datetime
