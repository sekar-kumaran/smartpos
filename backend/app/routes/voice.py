"""
SmartPOS AI – Voice Billing Route (Community Edition)
POST /api/v1/voice/transcribe

Pipeline:
    1. Accept audio blob (webm/wav/mp3)
    2. Use a local demo transcript (no external AI calls)
    3. Parse transcript → structured bill items via regex
    4. Match product names against store inventory
    5. Return: transcript + matched items + confidence
"""

from __future__ import annotations

import logging
import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.models import Product

log = logging.getLogger("smartpos.voice")

router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class VoiceBillItem(BaseModel):
    product_name: str
    quantity:     float
    matched_id:   int | None   = None
    unit_price:   float | None = None
    confidence:   float           = 0.0


class VoiceTranscribeResponse(BaseModel):
    transcript:  str
    items:       list[VoiceBillItem]
    confidence:  float
    raw_parse:   str | None = None
    error:       str | None = None


# ─── Route ────────────────────────────────────────────────────────────────────

@router.post(
    "/transcribe",
    response_model=VoiceTranscribeResponse,
    summary="Transcribe voice audio and extract bill items",
)
async def transcribe_voice(
    audio:    UploadFile = File(..., description="Audio file (webm / wav / mp3)"),
    store_id: int        = Form(1),
    db:       AsyncSession = Depends(get_db),
) -> VoiceTranscribeResponse:
    """
    1. Transcribe audio → text (local demo transcript)
    2. Extract items from text (regex parser)
    3. Match items against inventory
    """
    if not settings.ENABLE_VOICE:
        raise HTTPException(status_code=503, detail="Voice billing is disabled in this build")
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    # ── Step 1: Transcription ───────────────────────────────────────────────
    transcript = await _transcribe(audio_bytes, audio.content_type or "audio/webm")

    if not transcript.strip():
        return VoiceTranscribeResponse(
            transcript="",
            items=[],
            confidence=0.0,
            error="Could not detect speech — please speak clearly and try again",
        )

    log.info("Voice transcript: %r", transcript)

    # ── Step 2: Item extraction ────────────────────────────────────────────
    raw_items = await _extract_items(transcript)

    if not raw_items:
        return VoiceTranscribeResponse(
            transcript=transcript,
            items=[],
            confidence=0.3,
            error="Could not identify products from your speech. Try: '2 Maggi and 1 kg sugar'",
        )

    # ── Step 3: Product matching ───────────────────────────────────────────
    products = await _fetch_products(store_id, db)
    matched  = _match_items(raw_items, products)

    overall_conf = sum(i.confidence for i in matched) / len(matched) if matched else 0.0

    return VoiceTranscribeResponse(
        transcript=transcript,
        items=matched,
        confidence=round(overall_conf, 2),
    )


# ─── Transcription ────────────────────────────────────────────────────────────

async def _transcribe(audio_bytes: bytes, mime_type: str) -> str:
    """
    Community Edition: no external transcription. Use a deterministic demo
    transcript to keep the flow runnable without proprietary AI services.
    """
    if len(audio_bytes) < 1500:
        return "1 Amul milk and 2 bread"
    return "2 Maggi and 1 kg sugar and 3 Parle G"


# ─── Item Extraction ──────────────────────────────────────────────────────────

async def _extract_items(transcript: str) -> list[dict]:
    """Community Edition: regex-only extraction."""
    return _extract_via_regex(transcript)


def _extract_via_regex(transcript: str) -> list[dict]:
    """
    Regex-based fallback: handles patterns like:
      "2 Maggi", "1 kg sugar", "three Parle G", "do Amul butter"
    """
    WORD_NUMS = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
        "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
        "ek": 1, "do": 2, "teen": 3, "char": 4, "paanch": 5,
        "a": 1, "an": 1,
    }

    # Split on connectors first so "and" never bleeds into product names
    text = transcript.lower().strip()
    segments = re.split(r"\band\b|,", text)

    # Pattern per segment: optional_number + optional_unit + product_name
    pattern = r"""
        ^\s*
        (?:(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|
                ek|do|teen|char|paanch|a|an)\s+)?   # qty (optional)
        (?:(kg|gram|gm|litre|ltr|ml|piece|pcs|pack|dozen)\s+)?  # unit (optional)
        ([a-z][a-z0-9 '\-]{1,30}?)\s*$              # product name (rest of segment)
    """

    results = []
    for seg in segments:
        seg = seg.strip()
        if not seg:
            continue

        m = re.match(pattern, seg, re.VERBOSE)
        if not m:
            continue

        qty_raw  = m.group(1) or "1"
        name     = m.group(3).strip()

        if not name or len(name) < 2:
            continue

        try:
            qty = float(qty_raw)
        except ValueError:
            qty = float(WORD_NUMS.get(qty_raw.lower(), 1))

        # Unit is a quantity modifier, not part of the product name
        product_name = name.title()

        if product_name not in [r["product_name"] for r in results]:
            results.append({"product_name": product_name, "quantity": qty})

    return results


# ─── Product Matching ─────────────────────────────────────────────────────────

async def _fetch_products(store_id: int, db: AsyncSession) -> list[Product]:
    rows = await db.execute(
        select(Product).where(
            Product.store_id == store_id,
            Product.is_active.is_(True),
        )
    )
    return list(rows.scalars().all())


def _match_items(raw_items: list[dict], products: list[Product]) -> list[VoiceBillItem]:
    """
    Three-pass fuzzy match:
    1. Exact name match (case-insensitive)
    2. Product name contains search term
    3. Search term contains product name word
    """
    matched = []

    for item in raw_items:
        name  = item.get("product_name", "").strip().lower()
        qty   = float(item.get("quantity", 1))
        found = None
        conf  = 0.0

        # Pass 1: exact
        for p in products:
            if p.name.lower() == name:
                found = p
                conf  = 1.0
                break

        # Pass 2: product name contains search term
        if not found:
            for p in products:
                if name in p.name.lower():
                    found = p
                    conf  = 0.85
                    break

        # Pass 3: search term contains product name word
        if not found:
            for p in products:
                p_words = set(p.name.lower().split())
                n_words = set(name.split())
                overlap = p_words & n_words
                if overlap and max(len(w) for w in overlap) >= 3:
                    found = p
                    conf  = 0.65
                    break

        matched.append(VoiceBillItem(
            product_name=item.get("product_name", name.title()),
            quantity=qty,
            matched_id=found.id if found else None,
            unit_price=float(found.selling_price) if found else None,
            confidence=conf,
        ))

    return matched
