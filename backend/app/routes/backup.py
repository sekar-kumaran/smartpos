"""Backup routes – create encrypted backup, upload to cloud, restore preview."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import require_role
from app.services.backup_service import BackupService

router   = APIRouter()
_service = BackupService()


@router.post("/create")
async def create_backup(
    store_id: int = Query(...),
    payload:  dict = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """
    Create AES-256-GCM encrypted backup of all store data.
    Owner-only. Returns encrypted blob (base64) and metadata.
    """
    backup = await _service.create_backup(db, store_id)
    # Remove blob from response to save bandwidth (use /upload to push to cloud)
    return {
        "filename":   backup["filename"],
        "size_bytes": backup["size_bytes"],
        "created_at": backup["created_at"],
        "store_id":   backup["store_id"],
        "message":    "Backup created. Call /upload to push to cloud storage.",
    }


@router.post("/upload")
async def upload_backup(
    store_id: int = Query(...),
    payload: dict = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Create backup and immediately upload to configured object storage."""
    backup = await _service.create_backup(db, store_id)
    url    = await _service.upload_backup(backup)
    return {
        "message":    "Backup uploaded successfully",
        "filename":   backup["filename"],
        "url":        url,
        "size_bytes": backup["size_bytes"],
    }


@router.post("/restore/preview")
async def restore_preview(
    body: dict,
    payload: dict = Depends(require_role("owner")),
):
    """
    Decrypt and preview backup metadata without restoring.
    Pass {"encrypted_b64": "<base64 string>"} in body.
    """
    encrypted_b64 = body.get("encrypted_b64", "")
    if not encrypted_b64:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="encrypted_b64 is required")

    return _service.restore_preview(encrypted_b64)
