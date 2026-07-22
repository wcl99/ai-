from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "AI 安服平台 API"
    database_url: str = "postgresql+asyncpg://aisec:aisec@127.0.0.1:5432/aisec"
    jwt_secret: str = Field(min_length=32)
    jwt_issuer: str = "ai-security-platform"
    jwt_ttl_seconds: int = 3600
    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"
    engine_mode: Literal["mock", "xiaoyi"] = "mock"
    xiaoyi_base_url: str = "http://127.0.0.1:49980"
    xiaoyi_token: str | None = None
    engine_timeout_seconds: float = 30
    engine_retry_limit: int = Field(default=2, ge=0, le=10)
    sync_interval_seconds: float = 1
    report_dir: Path = Path("data/reports")
    bootstrap_admin_username: str | None = None
    bootstrap_admin_password: str | None = None

    @property
    def allowed_origins(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
