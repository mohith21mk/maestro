import os
import sys
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.core.config import settings
from app.api.router import api_router
from app.core.port_guard import check_and_guard_port

# Configure structured logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("powerhouse")

# Local development port guard check (only runs in local dev on Windows port 8000)
if (
    settings.ENVIRONMENT == "development"
    and sys.platform == "win32"
    and "uvicorn" in sys.modules
    and not ("pytest" in sys.modules or os.getenv("TESTING") == "true")
):
    try:
        check_and_guard_port(host="127.0.0.1", port=8000)
    except Exception as e:
        logger.warning(f"Development port guard skipped: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Lifespan startup check for local dev
    if (
        settings.ENVIRONMENT == "development"
        and sys.platform == "win32"
        and not ("pytest" in sys.modules or os.getenv("TESTING") == "true")
    ):
        try:
            check_and_guard_port(host="127.0.0.1", port=8000)
        except Exception as e:
            logger.warning(f"Development port guard skipped: {e}")
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description="Enterprise Business Compliance & Statutory Approval Management API",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG or settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.DEBUG or settings.ENVIRONMENT != "production" else None,
    openapi_url="/openapi.json" if settings.DEBUG or settings.ENVIRONMENT != "production" else None,
    lifespan=lifespan,
)

# CORS Configuration
origins = settings.BACKEND_CORS_ORIGINS
if isinstance(origins, str):
    origins = [o.strip() for o in origins.split(",") if o.strip()]

# In production, ensure no wildcards with allow_credentials=True
cors_origins: list[str] = []
if isinstance(origins, list):
    for origin in origins:
        if origin == "*" and settings.ENVIRONMENT in ("production", "prod"):
            continue
        cors_origins.append(origin)

if not cors_origins and settings.ENVIRONMENT == "development":
    cors_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.get("/health", tags=["Health"])
@app.get(f"{settings.API_V1_STR}/health", tags=["Health"])
def health_check():
    """Liveness probe for hosting platforms (Render/Netlify integration verification)."""
    return {
        "status": "healthy",
        "service": "power-house-api",
        "environment": settings.ENVIRONMENT,
        "version": "1.0.0",
    }


@app.get("/ready", tags=["Health"])
@app.get(f"{settings.API_V1_STR}/ready", tags=["Health"])
def readiness_check():
    """Readiness probe checking database connectivity without exposing sensitive credentials."""
    from sqlalchemy import text
    from app.core.database import SessionLocal

    db_status = "connected"
    try:
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Readiness probe database connection failed: {e}", exc_info=settings.DEBUG)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "degraded",
                "database": "unreachable",
                "detail": "Database connection verification failed.",
            },
        )

    return {
        "status": "ready",
        "database": db_status,
        "environment": settings.ENVIRONMENT,
    }


# Include Master API Router under /api/v1
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception at {request.url.path}: {str(exc)}", exc_info=settings.DEBUG)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "An internal server error occurred. Please contact compliance support.",
            "error_code": "INTERNAL_SERVER_ERROR",
        },
    )


if __name__ == "__main__":
    import uvicorn
    host = os.getenv("HOST", "0.0.0.0" if settings.ENVIRONMENT in ("production", "prod") else "127.0.0.1")
    port = int(os.getenv("PORT", 8000))
    if settings.ENVIRONMENT == "development" and sys.platform == "win32" and port == 8000:
        check_and_guard_port(host="127.0.0.1", port=8000)
    uvicorn.run("app.main:app", host=host, port=port, reload=(settings.ENVIRONMENT == "development"))
