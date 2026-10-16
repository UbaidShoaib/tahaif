from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AnyHttpUrl, Field, PostgresDsn, RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


# Look for .env in CWD first, then walk up to find the repo-root .env.
# This covers: running from apps/api/ (alembic, uvicorn) and the repo root.
def _find_env_file() -> str:
    for parent in [Path("."), Path(__file__).parents[4], Path(__file__).parents[3]]:
        candidate = parent / ".env"
        if candidate.exists():
            return str(candidate)
    return ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_find_env_file(), env_file_encoding="utf-8", extra="ignore"
    )

    # App
    environment: Literal["development", "staging", "production"] = "development"
    # Brand (white-label): every customer-facing name comes from here, never a literal.
    brand_name: str = "GiftShop"
    app_name: str = "GiftShop API"
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
    cookie_secure: bool = False  # True in production

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/v1/auth/oauth/google/callback"

    # Frontend
    frontend_url: str = "http://localhost:3000"
    # Reverse proxies in front of the API that append to X-Forwarded-For:
    # 0 locally, 1 on Railway/Render/Fly, 2 with Cloudflare in front of those.
    # Card voice/video notes stop playing this many days after delivery.
    note_expiry_days: int = Field(default=90, ge=1)
    trusted_proxy_hops: int = Field(default=0, ge=0, le=5)

    # Meilisearch
    meilisearch_url: AnyHttpUrl = "http://localhost:7700"  # type: ignore[assignment]
    meilisearch_master_key: str = ""

    # S3 / MinIO
    s3_endpoint_url: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_bucket_name: str = "tahaif-media"
    s3_public_url: str = ""
    s3_region: str = "us-east-1"  # MinIO's default; set to the bucket's region on AWS

    # Payments
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    # Email
    resend_api_key: str = ""
    email_from: str = "noreply@example.com"
    # Signed-in buyers must confirm their email (6-digit code) before checkout.
    # Guest checkout is unaffected.
    require_verified_email_for_checkout: bool = True

    # Messaging (Twilio)
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_whatsapp_from: str = "whatsapp:+14155238886"
    twilio_sms_from: str = ""
    # Off: no automatic WhatsApp; staff send from the admin "messages to send"
    # queue via wa.me links (ADR 0009). Turn on only with a paid WhatsApp API.
    whatsapp_api_enabled: bool = False

    # FX rates
    open_exchange_rates_app_id: str = ""

    # Observability
    sentry_dsn: str = ""

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
