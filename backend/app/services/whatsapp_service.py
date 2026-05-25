"""Community Edition notification service.

The public repository does not ship outbound WhatsApp integrations, provider
URLs, message templates, or delivery credentials. The service keeps receipt and
reminder workflows runnable while returning demo-safe "not sent" results.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Optional

log = logging.getLogger("smartpos.notifications")


class WhatsAppService:
    """Demo-safe notification adapter."""

    def __init__(self) -> None:
        self._enabled = False

    def _normalize_phone(self, phone: str) -> str:
        digits = "".join(c for c in phone if c.isdigit())
        if digits.startswith("91") and len(digits) == 12:
            return digits
        if len(digits) == 10:
            return f"91{digits}"
        return digits

    async def send_receipt(
        self,
        phone: str,
        customer_name: str,
        invoice_number: str,
        total_amount: Decimal,
        payment_method: str,
        store_name: str,
    ) -> bool:
        """Skip external delivery in the public build."""
        masked = self._normalize_phone(phone)[-4:].rjust(10, "*")
        log.info("Community notification skipped for receipt %s to %s", invoice_number, masked)
        return False

    async def send_credit_reminder(
        self,
        phone: str,
        customer_name: str,
        balance: Decimal,
        due_date: Optional[str],
        store_name: str,
    ) -> bool:
        """Skip external delivery in the public build."""
        masked = self._normalize_phone(phone)[-4:].rjust(10, "*")
        log.info("Community notification skipped for customer %s to %s", customer_name, masked)
        return False

    def is_configured(self) -> bool:
        return self._enabled


_whatsapp = WhatsAppService()


def get_whatsapp() -> WhatsAppService:
    return _whatsapp
