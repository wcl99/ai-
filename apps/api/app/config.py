"""Load environment-backed application settings and enforce runtime security rules."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    # BaseSettings maps these fields to environment variables (and an optional .env file).
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "AI 安服平台 API"
    app_environment: Literal["development", "test", "production"] = "development"
    database_url: str = "postgresql+asyncpg://aisec:aisec@127.0.0.1:5432/aisec"
    database_password: SecretStr | None = None
    database_username: str = "aisec"
    database_host: str = "127.0.0.1"
    database_port: int = Field(default=5432, ge=1, le=65535)
    database_name: str = "aisec"
    jwt_secret: str = Field(min_length=32)
    jwt_issuer: str = "ai-security-platform"
    jwt_ttl_seconds: int = 3600
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict"] = "lax"
    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"
    engine_mode: Literal["mock", "xiaoyi"] = "mock"
    xiaoyi_base_url: str = "http://127.0.0.1:49980"
    xiaoyi_token: str | None = None
    engine_timeout_seconds: float = 30
    engine_retry_limit: int = Field(default=2, ge=0, le=10)
    sync_interval_seconds: float = 1
    report_dir: Path = Path("data/reports")
    static_dir: Path = Path("static")
    bootstrap_admin_username: str | None = None
    bootstrap_admin_password: str | None = None

    @property
    def allowed_origins(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]

    @property
    def database_connection_url(self) -> str | URL:
        if (
            self.database_password is None
            or not self.database_password.get_secret_value()
        ):
            return self.database_url
        return URL.create(
            drivername="postgresql+asyncpg",
            username=self.database_username,
            password=self.database_password.get_secret_value(),
            host=self.database_host,
            port=self.database_port,
            database=self.database_name,
        )

    @property
    def database_connection_url_string(self) -> str:
        value = self.database_connection_url
        if isinstance(value, URL):
            return value.render_as_string(hide_password=False)
        return value

    def validate_runtime_security(self) -> None:
        if self.app_environment != "production":
            return
        if not self.cookie_secure:
            raise ValueError("COOKIE_SECURE must be true in production")
        if self.jwt_secret.lower().startswith(("replace-", "change-", "example-")):
            raise ValueError("JWT_SECRET must not use a placeholder in production")
        if (
            self.database_password is None
            or not self.database_password.get_secret_value()
        ):
            raise ValueError("DATABASE_PASSWORD is required in production")
        if (
            self.database_password
            and self.database_password.get_secret_value().lower().startswith(
                ("replace-", "change-", "example-")
            )
        ):
            raise ValueError("DATABASE_PASSWORD must not use a placeholder in production")
        if (
            self.bootstrap_admin_password
            and self.bootstrap_admin_password.lower().startswith(
                ("replace-", "change-", "example-")
            )
        ):
            raise ValueError(
                "BOOTSTRAP_ADMIN_PASSWORD must not use a placeholder in production"
            )


@lru_cache
def get_settings() -> Settings:
    # FastAPI may resolve this dependency many times; one immutable-style instance is enough.
    return Settings()  # type: ignore[call-arg]
