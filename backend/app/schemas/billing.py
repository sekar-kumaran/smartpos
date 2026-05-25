"""
SmartPOS AI – Billing Schemas (Phase 1A)
Full GST-compliant invoice request/response models.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.models import PaymentMethod, SaleStatus, SupplyType

# ─── Sale Item ────────────────────────────────────────────────────────────────

class SaleItemCreate(BaseModel):
    variant_id:  int | None = None
    product_id:  int | None = None
    qty:         Decimal = Field(..., gt=0)
    unit_price:  Decimal | None = Field(None, gt=0)   # override product price
    discount:    Decimal = Field(default=Decimal("0"), ge=0)
    hsn_code:    str | None = None                    # override product HSN

    @model_validator(mode="after")
    def require_product_or_variant(self):
        if self.variant_id is None and self.product_id is None:
            raise ValueError("variant_id or product_id is required")
        return self


class GSTComponentOut(BaseModel):
    taxable_value: Decimal
    gst_rate:      Decimal
    cgst_rate:     Decimal
    cgst_amount:   Decimal
    sgst_rate:     Decimal
    sgst_amount:   Decimal
    igst_rate:     Decimal
    igst_amount:   Decimal
    cess_rate:     Decimal
    cess_amount:   Decimal
    total_tax:     Decimal
    supply_type:   str
    hsn_code:      str | None
    model_config = {"from_attributes": True}


class SaleItemOut(BaseModel):
    id:            int
    product_id:    int
    variant_id:    int
    product_name:  str
    variant_name:  str
    hsn_code:      str | None
    qty:           Decimal
    unit:          str
    unit_price:    Decimal
    cost_price:    Decimal
    mrp:           Decimal | None
    discount:      Decimal
    taxable_value: Decimal
    line_total:    Decimal
    gst_component: GSTComponentOut | None = None
    model_config = {"from_attributes": True}


# ─── Payment Split ────────────────────────────────────────────────────────────

class PaymentSplit(BaseModel):
    method:    PaymentMethod
    amount:    Decimal = Field(..., gt=0)
    reference: str | None = None   # UPI txn ID, card last4, etc.


class SalePaymentOut(BaseModel):
    id:             int
    method:         PaymentMethod
    amount:         Decimal
    reference:      str | None
    gateway_status: str | None
    created_at:     datetime
    model_config = {"from_attributes": True}


# ─── Create Sale ──────────────────────────────────────────────────────────────

class CreateSaleRequest(BaseModel):
    store_id:         int
    customer_id:      int | None        = None
    items:            list[SaleItemCreate] = Field(..., min_length=1)
    payment_method:   PaymentMethod        = PaymentMethod.CASH
    overall_discount: Decimal              = Field(default=Decimal("0"), ge=0)
    amount_paid:      Decimal | None    = Field(None, ge=0)
    payment_splits:   list[PaymentSplit] | None = None
    notes:            str | None        = None
    local_id:         str | None        = None   # Device UUID for offline dedup

    @field_validator("payment_splits")
    @classmethod
    def validate_splits(cls, v, info):
        if v and info.data.get("payment_method") != PaymentMethod.SPLIT:
            raise ValueError(
                "payment_splits can only be provided when payment_method='split'"
            )
        return v


class SaleOut(BaseModel):
    id:              int
    store_id:        int
    cashier_id:      int
    customer_id:     int | None
    invoice_number:  str
    invoice_date:    datetime
    supply_type:     SupplyType
    is_b2b:          bool
    customer_gstin:  str | None

    # Amounts
    subtotal:        Decimal
    discount:        Decimal
    taxable_amount:  Decimal
    cgst_amount:     Decimal
    sgst_amount:     Decimal
    igst_amount:     Decimal
    cess_amount:     Decimal
    total_tax:       Decimal
    round_off:       Decimal
    total_amount:    Decimal

    payment_method:  PaymentMethod
    amount_paid:     Decimal
    amount_due:      Decimal
    status:          SaleStatus
    notes:           str | None
    is_synced:       bool
    invoice_pdf_url: str | None

    items:    list[SaleItemOut]    = []
    payments: list[SalePaymentOut] = []

    created_at: datetime
    model_config = {"from_attributes": True}


# ─── GST Validation ───────────────────────────────────────────────────────────

class GSTINValidateRequest(BaseModel):
    gstin: str = Field(..., min_length=15, max_length=15)


class GSTINValidateResponse(BaseModel):
    gstin:      str
    is_valid:   bool
    state_code: str | None
    state_name: str | None
    error:      str | None


# ─── Tax Preview ──────────────────────────────────────────────────────────────

class TaxPreviewRequest(BaseModel):
    """
    Compute tax for a cart without creating a sale.
    Used by the frontend to show live tax breakdown as items are added.
    """
    store_id:        int
    customer_id:     int | None     = None
    items:           list[SaleItemCreate]
    overall_discount: Decimal          = Decimal("0")


class TaxPreviewItemOut(BaseModel):
    variant_id:    int
    product_name:  str
    qty:           Decimal
    unit_price:    Decimal
    taxable_value: Decimal
    gst_breakdown: dict
    line_total:    Decimal


class TaxPreviewResponse(BaseModel):
    supply_type:    str
    items:          list[TaxPreviewItemOut]
    subtotal:       Decimal
    total_discount: Decimal
    taxable_amount: Decimal
    cgst_total:     Decimal
    sgst_total:     Decimal
    igst_total:     Decimal
    cess_total:     Decimal
    total_tax:      Decimal
    round_off:      Decimal
    grand_total:    Decimal
    rate_wise_breakdown: dict


# ─── Offline Sync ─────────────────────────────────────────────────────────────

class OfflineSyncPayload(BaseModel):
    device_id:  str
    store_id:   int
    synced_at:  datetime
    sales:      list[CreateSaleRequest] = []


class OfflineSyncResponse(BaseModel):
    device_id:     str
    synced:        int
    skipped:       int   # duplicate local_id
    failed:        int
    invoices:      list[str]          # Successfully created invoice numbers
    errors:        list[dict]         # {local_id, error}
