"""
SmartPOS AI – Billing Schemas (Phase 1A)
Full GST-compliant invoice request/response models.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.models import PaymentMethod, SaleStatus, SupplyType


# ─── Sale Item ────────────────────────────────────────────────────────────────

class SaleItemCreate(BaseModel):
    variant_id:  Optional[int] = None
    product_id:  Optional[int] = None
    qty:         Decimal = Field(..., gt=0)
    unit_price:  Optional[Decimal] = Field(None, gt=0)   # override product price
    discount:    Decimal = Field(default=Decimal("0"), ge=0)
    hsn_code:    Optional[str] = None                    # override product HSN

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
    hsn_code:      Optional[str]
    model_config = {"from_attributes": True}


class SaleItemOut(BaseModel):
    id:            int
    product_id:    int
    variant_id:    int
    product_name:  str
    variant_name:  str
    hsn_code:      Optional[str]
    qty:           Decimal
    unit:          str
    unit_price:    Decimal
    cost_price:    Decimal
    mrp:           Optional[Decimal]
    discount:      Decimal
    taxable_value: Decimal
    line_total:    Decimal
    gst_component: Optional[GSTComponentOut] = None
    model_config = {"from_attributes": True}


# ─── Payment Split ────────────────────────────────────────────────────────────

class PaymentSplit(BaseModel):
    method:    PaymentMethod
    amount:    Decimal = Field(..., gt=0)
    reference: Optional[str] = None   # UPI txn ID, card last4, etc.


class SalePaymentOut(BaseModel):
    id:             int
    method:         PaymentMethod
    amount:         Decimal
    reference:      Optional[str]
    gateway_status: Optional[str]
    created_at:     datetime
    model_config = {"from_attributes": True}


# ─── Create Sale ──────────────────────────────────────────────────────────────

class CreateSaleRequest(BaseModel):
    store_id:         int
    customer_id:      Optional[int]        = None
    items:            List[SaleItemCreate] = Field(..., min_length=1)
    payment_method:   PaymentMethod        = PaymentMethod.CASH
    overall_discount: Decimal              = Field(default=Decimal("0"), ge=0)
    amount_paid:      Optional[Decimal]    = Field(None, ge=0)
    payment_splits:   Optional[List[PaymentSplit]] = None
    notes:            Optional[str]        = None
    local_id:         Optional[str]        = None   # Device UUID for offline dedup

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
    customer_id:     Optional[int]
    invoice_number:  str
    invoice_date:    datetime
    supply_type:     SupplyType
    is_b2b:          bool
    customer_gstin:  Optional[str]

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
    notes:           Optional[str]
    is_synced:       bool
    invoice_pdf_url: Optional[str]

    items:    List[SaleItemOut]    = []
    payments: List[SalePaymentOut] = []

    created_at: datetime
    model_config = {"from_attributes": True}


# ─── GST Validation ───────────────────────────────────────────────────────────

class GSTINValidateRequest(BaseModel):
    gstin: str = Field(..., min_length=15, max_length=15)


class GSTINValidateResponse(BaseModel):
    gstin:      str
    is_valid:   bool
    state_code: Optional[str]
    state_name: Optional[str]
    error:      Optional[str]


# ─── Tax Preview ──────────────────────────────────────────────────────────────

class TaxPreviewRequest(BaseModel):
    """
    Compute tax for a cart without creating a sale.
    Used by the frontend to show live tax breakdown as items are added.
    """
    store_id:        int
    customer_id:     Optional[int]     = None
    items:           List[SaleItemCreate]
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
    items:          List[TaxPreviewItemOut]
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
    sales:      List[CreateSaleRequest] = []


class OfflineSyncResponse(BaseModel):
    device_id:     str
    synced:        int
    skipped:       int   # duplicate local_id
    failed:        int
    invoices:      List[str]          # Successfully created invoice numbers
    errors:        List[dict]         # {local_id, error}
