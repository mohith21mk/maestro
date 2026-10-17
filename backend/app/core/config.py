import os
from typing import List, Union
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, model_validator


BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_SQLITE_PATH = os.path.join(BACKEND_DIR, "powerhouse.db").replace("\\", "/")


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
        f"sqlite:///{DEFAULT_SQLITE_PATH}"
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

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def normalize_database_url(cls, v: str) -> str:
        if isinstance(v, str):
            v_stripped = v.strip()
            # Normalize Render/Heroku postgres:// URLs to SQLAlchemy compatible postgresql+psycopg2://
            if v_stripped.startswith("postgres://"):
                return v_stripped.replace("postgres://", "postgresql+psycopg2://", 1)
            elif v_stripped.startswith("postgresql://") and not v_stripped.startswith("postgresql+"):
                return v_stripped.replace("postgresql://", "postgresql+psycopg2://", 1)
            return v_stripped
        return v

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            v_stripped = v.strip()
            if not v_stripped.startswith("["):
                return [i.strip() for i in v_stripped.split(",") if i.strip()]
        if isinstance(v, list):
            return [str(i).strip() for i in v if str(i).strip()]
        return v

    @model_validator(mode="after")
    def validate_production_configuration(self) -> "Settings":
        env = (self.ENVIRONMENT or "").strip().lower()
        is_production = env in ("production", "prod")
        raw_env_secret = os.getenv("SECRET_KEY")

        if is_production:
            # 1. Enforce strict SECRET_KEY
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
                "default-secret",
            ]
            if raw_env_secret in dev_placeholders:
                raise ValueError(
                    "Production configuration error: The SECRET_KEY environment variable cannot use known development default keys. "
                    "Please inject a secure, cryptographically random key (at least 32 characters) into the production environment."
                )
            if len(raw_env_secret.strip()) < 32:
                raise ValueError(
                    "Production configuration error: SECRET_KEY must be at least 32 characters long for cryptographic security."
                )

            # 2. Enforce Managed PostgreSQL database in production when DATABASE_URL is explicitly configured
            raw_db_env = os.getenv("DATABASE_URL")
            db_url = (self.DATABASE_URL or "").strip().lower()
            if ("DATABASE_URL" in self.model_fields_set or raw_db_env is not None) and db_url.startswith("sqlite"):
                raise ValueError(
                    "Production configuration error: Ephemeral SQLite databases are strictly prohibited in production. "
                    "A managed PostgreSQL connection URL (e.g. from Render PostgreSQL) must be provided in DATABASE_URL."
                )

            # 3. Enforce strict CORS in production (no wildcards with credentials)
            origins = self.BACKEND_CORS_ORIGINS
            if isinstance(origins, list):
                if "*" in origins:
                    raise ValueError(
                        "Production configuration error: Wildcard '*' in BACKEND_CORS_ORIGINS is prohibited when allow_credentials=True. "
                        "Specify the exact deployed frontend origin (e.g., https://your-site.netlify.app)."
                    )
                if "BACKEND_CORS_ORIGINS" in self.model_fields_set or os.getenv("BACKEND_CORS_ORIGINS") is not None:
                    prod_origins = [o for o in origins if not ("localhost" in o or "127.0.0.1" in o)]
                    if not prod_origins:
                        raise ValueError(
                            "Production configuration error: BACKEND_CORS_ORIGINS must include the production frontend domain "
                            "(e.g. https://your-site.netlify.app), not solely localhost addresses."
                        )

        return self


settings = Settings()
