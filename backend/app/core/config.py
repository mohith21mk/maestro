import os
from typing import List, Union
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, model_validator


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="allow"
    )

    APP_NAME: str = "POWER HOUSE Backend API"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEBUG: bool = os.getenv("DEBUG", "true").lower() in ("true", "1", "yes")
    API_V1_STR: str = "/api/v1"

    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "sqlite:///./powerhouse.db"
    )

    SECRET_KEY: str = os.getenv(
        "SECRET_KEY",
        "powerhouse-dev-only-secret-key-do-not-use-in-production"
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    BACKEND_CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        env = (self.ENVIRONMENT or "").strip().lower()
        is_production = env in ("production", "prod") or not self.DEBUG
        raw_env_secret = os.getenv("SECRET_KEY")

        if is_production:
            if not raw_env_secret or not raw_env_secret.strip():
                raise ValueError(
                    "Production configuration error: The SECRET_KEY environment variable is mandatory in production. "
                    "A secret must be explicitly provided via secure environment configuration."
                )
            dev_placeholders = [
                "powerhouse-enterprise-regulatory-secret-key-2026-compliance",
                "powerhouse-dev-only-secret-key-do-not-use-in-production",
                "changeme",
                "secret",
            ]
            if raw_env_secret in dev_placeholders:
                raise ValueError(
                    "Production configuration error: The SECRET_KEY environment variable cannot use known development default keys. "
                    "Please inject a secure, cryptographically random key into the production environment."
                )

        return self


settings = Settings()
