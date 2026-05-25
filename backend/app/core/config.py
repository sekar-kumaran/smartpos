"""Core configuration for SmartPOS AI Community Edition."""

from functools import lru_cache
from typing import Any, List, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    APP_NAME: str = "SmartPOS AI Community Edition"
    APP_VERSION: str = "1.0.0"
    APP_ENV: Literal["development", "staging", "production", "test"] = "development"
    DEBUG: bool = False

    SECRET_KEY: str = "community-demo-secret-change-locally"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    AES_ENCRYPTION_KEY: str = "community-demo-aes-key-32-bytes!!"
    ALLOWED_ORIGINS: List[str] = ["*"]
    ALLOWED_HOSTS: List[str] = ["*"]

    DATABASE_URL: str = "postgresql+asyncpg://smartpos:smartpos_demo_password@localhost:5432/smartpos"
    DATABASE_SYNC_URL: str = (
        "postgresql+psycopg2://smartpos:smartpos_demo_password@localhost:5432/smartpos"
    )
    SQLITE_URL: str = "sqlite+aiosqlite:///./smartpos_local.db"
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 40
    DB_POOL_RECYCLE: int = 3600

    RLS_GUC_VAR: str = "app.current_tenant_id"

    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_URL: str = "redis://localhost:6379/2"
    CACHE_TTL_SECONDS: int = 300

    DEFAULT_STATE_CODE: str = "29"
    DEFAULT_SUPPLY_TYPE: str = "intra"
    GSTIN_REGEX: str = r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"

    DEFAULT_PAGE_SIZE: int = 50
    MAX_PAGE_SIZE: int = 200

    ENABLE_DEMO_AUTH: bool = True
    DEMO_USER_EMAIL: str = "demo@smartpos.community"
    ENABLE_ADVANCED_ANALYTICS: bool = False
    ENABLE_VOICE: bool = True

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug(cls, value: Any) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "on", "debug"}:
                return True
            if normalized in {"0", "false", "no", "off", "release", "prod", "production", ""}:
                return False
        return bool(value)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
