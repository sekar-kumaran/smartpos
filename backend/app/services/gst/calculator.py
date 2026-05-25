"""
SmartPOS AI – GST Calculation Engine (Phase 1A)

India GST Rules implemented:
  1. Intra-state supply  → CGST (50%) + SGST (50%) of total GST rate
  2. Inter-state supply  → IGST (100%) of total GST rate
  3. Export supply       → Zero-rated (0% GST)
  4. Composition scheme  → Fixed % on turnover, no input credit
  5. Price-inclusive tax → Back-calculate taxable value from MRP
  6. Cess                → Additional levy on top of GST (tobacco, luxury, etc.)
  7. Reverse charge      → Buyer pays GST (not yet implemented – Phase 4)

GST slabs: 0%, 5%, 12%, 18%, 28%
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal

from app.core.config import settings


# ─── Constants ────────────────────────────────────────────────────────────────

GST_SLABS = {
    "0":  Decimal("0"),
    "5":  Decimal("5"),
    "12": Decimal("12"),
    "18": Decimal("18"),
    "28": Decimal("28"),
}

# State codes per GST law (ISO 3166-2:IN numeric codes used in GSTIN)
STATE_CODES = {
    "01": "Jammu & Kashmir",   "02": "Himachal Pradesh",
    "03": "Punjab",            "04": "Chandigarh",
    "05": "Uttarakhand",       "06": "Haryana",
    "07": "Delhi",             "08": "Rajasthan",
    "09": "Uttar Pradesh",     "10": "Bihar",
    "11": "Sikkim",            "12": "Arunachal Pradesh",
    "13": "Nagaland",          "14": "Manipur",
    "15": "Mizoram",           "16": "Tripura",
    "17": "Meghalaya",         "18": "Assam",
    "19": "West Bengal",       "20": "Jharkhand",
    "21": "Odisha",            "22": "Chhattisgarh",
    "23": "Madhya Pradesh",    "24": "Gujarat",
    "26": "Dadra & Nagar Haveli and Daman & Diu",
    "27": "Maharashtra",       "28": "Andhra Pradesh",
    "29": "Karnataka",         "30": "Goa",
    "31": "Lakshadweep",       "32": "Kerala",
    "33": "Tamil Nadu",        "34": "Puducherry",
    "35": "Andaman & Nicobar", "36": "Telangana",
    "37": "Andhra Pradesh (New)",
    "38": "Ladakh",
}

TWO_PLACES = Decimal("0.01")
FOUR_PLACES = Decimal("0.0001")


# ─── Data Classes ─────────────────────────────────────────────────────────────

@dataclass
class GSTBreakdown:
    """
    Complete GST breakdown for a single line item.
    All values in INR, rounded to 2 decimal places.
    """
    taxable_value: Decimal
    gst_rate:      Decimal    # total GST %

    # Intra-state (CGST + SGST)
    cgst_rate:   Decimal = Decimal("0")
    cgst_amount: Decimal = Decimal("0")
    sgst_rate:   Decimal = Decimal("0")
    sgst_amount: Decimal = Decimal("0")

    # Inter-state (IGST)
    igst_rate:   Decimal = Decimal("0")
    igst_amount: Decimal = Decimal("0")

    # Cess (tobacco, aerated drinks, luxury cars)
    cess_rate:   Decimal = Decimal("0")
    cess_amount: Decimal = Decimal("0")

    supply_type: str = "intra"
    hsn_code:    str | None = None

    @property
    def total_tax(self) -> Decimal:
        return (
            self.cgst_amount + self.sgst_amount +
            self.igst_amount + self.cess_amount
        ).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

    @property
    def line_total(self) -> Decimal:
        return (self.taxable_value + self.total_tax).quantize(
            TWO_PLACES, rounding=ROUND_HALF_UP
        )

    def to_dict(self) -> dict:
        return {
            "taxable_value": float(self.taxable_value),
            "gst_rate":      float(self.gst_rate),
            "cgst_rate":     float(self.cgst_rate),
            "cgst_amount":   float(self.cgst_amount),
            "sgst_rate":     float(self.sgst_rate),
            "sgst_amount":   float(self.sgst_amount),
            "igst_rate":     float(self.igst_rate),
            "igst_amount":   float(self.igst_amount),
            "cess_rate":     float(self.cess_rate),
            "cess_amount":   float(self.cess_amount),
            "total_tax":     float(self.total_tax),
            "line_total":    float(self.line_total),
            "supply_type":   self.supply_type,
            "hsn_code":      self.hsn_code,
        }


@dataclass
class InvoiceGSTSummary:
    """
    Aggregated GST summary for a complete invoice.
    Used for GST return filing (GSTR-1, GSTR-3B).
    """
    subtotal:       Decimal = Decimal("0")
    total_discount: Decimal = Decimal("0")
    taxable_amount: Decimal = Decimal("0")
    cgst_total:     Decimal = Decimal("0")
    sgst_total:     Decimal = Decimal("0")
    igst_total:     Decimal = Decimal("0")
    cess_total:     Decimal = Decimal("0")
    total_tax:      Decimal = Decimal("0")
    round_off:      Decimal = Decimal("0")
    grand_total:    Decimal = Decimal("0")

    # GST-rate-wise breakdown (for GSTR-1)
    rate_wise: dict = field(default_factory=dict)
    # e.g. {"18": {"taxable": 1000, "cgst": 90, "sgst": 90}}


# ─── GSTIN Validator ──────────────────────────────────────────────────────────

def validate_gstin(gstin: str) -> tuple[bool, str]:
    """
    Validates a GSTIN (GST Identification Number).

    Format: 2-digit state code + 10-char PAN + 1-char entity code + Z + checksum
    Example: 29ABCDE1234F1Z5

    Returns: (is_valid, error_message)
    """
    if not gstin:
        return False, "GSTIN cannot be empty"

    gstin = gstin.strip().upper()

    if len(gstin) != 15:
        return False, f"GSTIN must be 15 characters, got {len(gstin)}"

    pattern = re.compile(settings.GSTIN_REGEX)
    if not pattern.match(gstin):
        return False, "GSTIN format is invalid"

    state_code = gstin[:2]
    if state_code not in STATE_CODES:
        return False, f"Invalid state code: {state_code}"

    # Checksum validation (MOD 36 algorithm)
    if not _verify_gstin_checksum(gstin):
        return False, "GSTIN checksum is invalid"

    return True, ""


def _verify_gstin_checksum(gstin: str) -> bool:
    """GST checksum using MOD 36 algorithm as per GSTN specification."""
    chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    factor = 2
    total = 0

    for char in reversed(gstin[:-1]):
        val = chars.index(char) * factor
        factor = 1 if factor == 2 else 2
        val = (val // 36) + (val % 36)
        total += val

    check_char = chars[(36 - (total % 36)) % 36]
    return check_char == gstin[-1]


def extract_state_from_gstin(gstin: str) -> str | None:
    """Extract the 2-digit state code from a GSTIN."""
    if gstin and len(gstin) >= 2:
        return gstin[:2]
    return None


# ─── Core GST Calculator ──────────────────────────────────────────────────────

class GSTCalculator:
    """
    Stateless GST calculation engine.

    Usage:
        calc = GSTCalculator(
            seller_state="29",
            buyer_state="29",
            is_export=False,
        )
        breakdown = calc.compute_line_item(
            base_price=Decimal("100"),
            qty=Decimal("2"),
            gst_rate=Decimal("18"),
            discount=Decimal("10"),
            cess_rate=Decimal("0"),
            price_inclusive=False,
            hsn_code="6109",
        )
    """

    def __init__(
        self,
        seller_state: str,
        buyer_state:  str | None = None,
        is_export:    bool = False,
        is_composition: bool = False,
    ):
        self.seller_state   = seller_state
        self.buyer_state    = buyer_state or seller_state
        self.is_export      = is_export
        self.is_composition = is_composition
        self.supply_type    = self._determine_supply_type()

    def _determine_supply_type(self) -> str:
        """
        Determine supply type for correct GST component selection.
        GST law: same state → intra (CGST+SGST), different state → inter (IGST)
        """
        if self.is_export:
            return "export"
        if self.seller_state == self.buyer_state:
            return "intra"
        return "inter"

    def compute_line_item(
        self,
        base_price:      Decimal,
        qty:             Decimal,
        gst_rate:        Decimal,
        discount:        Decimal = Decimal("0"),
        cess_rate:       Decimal = Decimal("0"),
        price_inclusive: bool    = False,
        hsn_code:        str | None = None,
    ) -> GSTBreakdown:
        """
        Compute complete GST breakdown for a single line item.

        Args:
            base_price:      Unit price (MRP if price_inclusive, net price if not)
            qty:             Quantity
            gst_rate:        Total GST percentage (e.g. 18 for 18%)
            discount:        Line-level discount amount (applied before GST)
            cess_rate:       Cess percentage (0 for most goods)
            price_inclusive: If True, base_price includes GST (back-calculate taxable)
            hsn_code:        HSN code for the product
        """
        gst_rate  = Decimal(str(gst_rate))
        cess_rate = Decimal(str(cess_rate))

        # Step 1: Gross value before tax
        gross_value = (base_price * qty - discount).quantize(
            TWO_PLACES, rounding=ROUND_HALF_UP
        )

        if gross_value < Decimal("0"):
            gross_value = Decimal("0")

        # Step 2: Compute taxable value
        if price_inclusive and gst_rate > 0:
            # Back-calculate: taxable = gross / (1 + gst_rate/100)
            divisor = 1 + gst_rate / 100
            taxable_value = (gross_value / divisor).quantize(
                TWO_PLACES, rounding=ROUND_HALF_UP
            )
        else:
            taxable_value = gross_value

        # Step 3: Compute GST components
        breakdown = GSTBreakdown(
            taxable_value=taxable_value,
            gst_rate=gst_rate,
            cess_rate=cess_rate,
            supply_type=self.supply_type,
            hsn_code=hsn_code,
        )

        if self.is_export or gst_rate == Decimal("0"):
            # Zero-rated or exempt — no tax
            return breakdown

        if self.is_composition:
            # Composition dealers cannot charge GST on invoices
            return breakdown

        total_gst_amount = (taxable_value * gst_rate / 100).quantize(
            TWO_PLACES, rounding=ROUND_HALF_UP
        )
        cess_amount = (taxable_value * cess_rate / 100).quantize(
            TWO_PLACES, rounding=ROUND_HALF_UP
        )

        if self.supply_type == "intra":
            # Split equally between CGST and SGST
            half_rate   = gst_rate / 2
            half_amount = (total_gst_amount / 2).quantize(
                TWO_PLACES, rounding=ROUND_HALF_UP
            )
            cgst_amount = half_amount
            sgst_amount = half_amount

            breakdown.cgst_rate   = half_rate
            breakdown.cgst_amount = cgst_amount
            breakdown.sgst_rate   = half_rate
            breakdown.sgst_amount = sgst_amount

        elif self.supply_type == "inter":
            breakdown.igst_rate   = gst_rate
            breakdown.igst_amount = total_gst_amount

        breakdown.cess_amount = cess_amount
        return breakdown

    def compute_invoice(
        self, line_breakdowns: list[GSTBreakdown], overall_discount: Decimal = Decimal("0")
    ) -> InvoiceGSTSummary:
        """
        Aggregate line-level GST breakdowns into an invoice summary.
        Also computes rate-wise breakdown needed for GSTR-1.
        """
        summary = InvoiceGSTSummary()

        for bd in line_breakdowns:
            summary.taxable_amount += bd.taxable_value
            summary.cgst_total     += bd.cgst_amount
            summary.sgst_total     += bd.sgst_amount
            summary.igst_total     += bd.igst_amount
            summary.cess_total     += bd.cess_amount

            # Rate-wise aggregation
            rate_key = str(bd.gst_rate)
            if rate_key not in summary.rate_wise:
                summary.rate_wise[rate_key] = {
                    "taxable": Decimal("0"),
                    "cgst":    Decimal("0"),
                    "sgst":    Decimal("0"),
                    "igst":    Decimal("0"),
                }
            summary.rate_wise[rate_key]["taxable"] += bd.taxable_value
            summary.rate_wise[rate_key]["cgst"]    += bd.cgst_amount
            summary.rate_wise[rate_key]["sgst"]    += bd.sgst_amount
            summary.rate_wise[rate_key]["igst"]    += bd.igst_amount

        summary.total_discount = overall_discount
        summary.total_tax = (
            summary.cgst_total + summary.sgst_total +
            summary.igst_total + summary.cess_total
        ).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)

        raw_total = summary.taxable_amount + summary.total_tax - overall_discount
        # Round off to nearest rupee
        summary.grand_total = raw_total.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        summary.round_off   = (summary.grand_total - raw_total).quantize(
            TWO_PLACES, rounding=ROUND_HALF_UP
        )

        return summary


# ─── Convenience function ─────────────────────────────────────────────────────

def make_calculator(
    store_state: str,
    customer_state: str | None = None,
    customer_gstin: str | None = None,
    is_export: bool = False,
    is_composition: bool = False,
) -> GSTCalculator:
    """
    Factory that auto-detects supply type from store and customer state.
    If customer has a GSTIN, extract their state from it.
    """
    buyer_state = customer_state

    if customer_gstin:
        extracted = extract_state_from_gstin(customer_gstin)
        if extracted:
            buyer_state = extracted

    return GSTCalculator(
        seller_state=store_state,
        buyer_state=buyer_state,
        is_export=is_export,
        is_composition=is_composition,
    )
