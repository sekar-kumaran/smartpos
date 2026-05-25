"""Community Edition anomaly detection placeholder."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession


class AnomalyDetectionService:
    async def run_for_store(self, db: AsyncSession, store_id: int) -> list:
        """Advanced anomaly logic is intentionally not part of the public build."""
        return []
