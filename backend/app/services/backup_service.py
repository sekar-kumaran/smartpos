"""Community Edition encrypted backup service.

Local encrypted backup creation and restore preview are included. Cloud upload
is intentionally disabled to avoid public infrastructure patterns or provider
credentials.
"""

from __future__ import annotations

import gzip
import json
import os
from base64 import b64decode, b64encode
from datetime import datetime

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings


class BackupService:
    def __init__(self) -> None:
        self._key = self._load_key()

    def _load_key(self) -> bytes:
        raw = settings.AES_ENCRYPTION_KEY.encode("utf-8")
        if len(raw) not in (16, 24, 32):
            raw = raw[:32].ljust(32, b"\x00")
        return raw

    def encrypt(self, plaintext: bytes) -> bytes:
        aesgcm = AESGCM(self._key)
        nonce = os.urandom(12)
        return nonce + aesgcm.encrypt(nonce, plaintext, None)

    def decrypt(self, ciphertext: bytes) -> bytes:
        aesgcm = AESGCM(self._key)
        return aesgcm.decrypt(ciphertext[:12], ciphertext[12:], None)

    async def create_backup(self, db: AsyncSession, store_id: int) -> dict:
        tables = ["stores", "users", "products", "customers", "sales", "sale_items", "credits"]
        backup_data: dict = {
            "store_id": store_id,
            "created_at": datetime.now(datetime.UTC).isoformat(),
            "version": "1.0",
            "tables": {},
        }

        for table in tables:
            result = await db.execute(text(f"SELECT * FROM {table}"))  # noqa: S608
            rows = result.mappings().all()
            filtered = [
                dict(row)
                for row in rows
                if row.get("store_id") == store_id or (table == "stores" and row.get("id") == store_id)
            ]
            backup_data["tables"][table] = [
                {
                    key: value if isinstance(value, str | int | float | bool | type(None)) else str(value)
                    for key, value in row.items()
                }
                for row in filtered
            ]

        compressed = gzip.compress(json.dumps(backup_data).encode("utf-8"))
        encrypted = self.encrypt(compressed)
        filename = f"backup_{store_id}_{datetime.now(datetime.UTC).strftime('%Y%m%d_%H%M%S')}.enc"

        return {
            "filename": filename,
            "size_bytes": len(encrypted),
            "store_id": store_id,
            "created_at": backup_data["created_at"],
            "blob_b64": b64encode(encrypted).decode("ascii"),
        }

    async def upload_backup(self, backup: dict) -> str:
        raise HTTPException(
            status_code=503,
            detail="Cloud backup upload is not included in Community Edition.",
        )

    def restore_preview(self, encrypted_b64: str) -> dict:
        try:
            compressed = self.decrypt(b64decode(encrypted_b64))
            data = json.loads(gzip.decompress(compressed))
            return {
                "store_id": data["store_id"],
                "created_at": data["created_at"],
                "version": data["version"],
                "table_sizes": {table: len(rows) for table, rows in data["tables"].items()},
            }
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Failed to decrypt backup: {exc}") from exc
