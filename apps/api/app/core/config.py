from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, PostgresDsn, RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    environment: Literal["development", "staging", "production"] = "development"
    app_name: str = "Tahaif API"
    app_version: str = "0.1.0"
    debug: bool = False

    # Database
    database_url: PostgresDsn

    # Redis
    redis_url: RedisDsn = "redis://localhost:6379/0"  # type: ignore[assignment]

    # Security
    secret_key: str
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # Meilisearch
    meilisearch_url: AnyHttpUrl = "http://localhost:7700"  # type: ignore[assignment]
    meilisearch_master_key: str = ""

    # S3 / MinIO
    s3_endpoint_url: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_bucket_name: str = "tahaif-media"
    s3_public_url: str = ""

    # Payments
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    # Observability
    sentry_dsn: str = ""

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
