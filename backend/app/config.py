from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./dvault.db"
    environment: str = "development"
    hmac_secret: str = "development-only-secret-change-before-deployment"
    source_store_dir: Path = Path("./source_stores")
    enable_failure_injection: bool = False
    audit_signing_key: str | None = None
    audit_signing_key_path: Path = Path("./.keys/audit_signing_key.pem")
    audit_key_id: str = "local-demo-v1"
    frontend_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"
    enable_demo_controls: bool = False
    demo_show_synthetic_contacts: bool = False
    demo_user_subject_ref: str | None = None
    ocr_provider: str = "none"
    google_vision_api_key: str | None = None
    ocr_timeout_seconds: float = 30.0
    ocr_max_bytes: int = 10 * 1024 * 1024

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    def validate_runtime(self) -> None:
        if self.is_production and self.hmac_secret == "development-only-secret-change-before-deployment":
            raise RuntimeError("HMAC_SECRET must be configured in production")
        if len(self.hmac_secret) < 32:
            raise RuntimeError("HMAC_SECRET must be at least 32 characters")
        if self.is_production and not self.audit_signing_key and not self.audit_signing_key_path.exists():
            raise RuntimeError("AUDIT_SIGNING_KEY must be configured in production")
        if self.is_production and (self.enable_demo_controls or self.enable_failure_injection):
            raise RuntimeError("Demo controls and failure injection must be disabled in production")
        if self.is_production and self.demo_show_synthetic_contacts:
            raise RuntimeError("Synthetic contact display must be disabled in production")
        provider = (self.ocr_provider or "none").strip().lower()
        if self.is_production and provider not in {"", "none", "disabled"} and not self.google_vision_api_key:
            raise RuntimeError("GOOGLE_VISION_API_KEY must be configured when external OCR is enabled")


@lru_cache
def get_settings() -> Settings:
    return Settings()
