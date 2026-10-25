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

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    def validate_runtime(self) -> None:
        if self.is_production and self.hmac_secret == "development-only-secret-change-before-deployment":
            raise RuntimeError("HMAC_SECRET must be configured in production")
        if len(self.hmac_secret) < 32:
            raise RuntimeError("HMAC_SECRET must be at least 32 characters")


@lru_cache
def get_settings() -> Settings:
    return Settings()
