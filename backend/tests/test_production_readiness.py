import os
import pytest
from fastapi.testclient import TestClient
from app.core.config import Settings
from app.main import app
from app.core.database import Base


def test_production_secret_key_required():
    """Verify that in production, missing SECRET_KEY fails safely with ValueError."""
    os.environ["ENVIRONMENT"] = "production"
    os.environ.pop("SECRET_KEY", None)
    try:
        with pytest.raises(ValueError, match="SECRET_KEY environment variable is mandatory"):
            Settings(
                ENVIRONMENT="production",
                DEBUG=False,
                DATABASE_URL="postgresql://user:pass@host:5432/db",
                BACKEND_CORS_ORIGINS=["https://my-app.netlify.app"]
            )
    finally:
        os.environ["ENVIRONMENT"] = "testing"


def test_production_rejects_dev_placeholder_secret():
    """Verify that known dev secrets are rejected in production."""
    os.environ["ENVIRONMENT"] = "production"
    os.environ["SECRET_KEY"] = "powerhouse-dev-only-secret-key-do-not-use-in-production"
    try:
        with pytest.raises(ValueError, match="cannot use known development default keys"):
            Settings(
                ENVIRONMENT="production",
                DEBUG=False,
                DATABASE_URL="postgresql://user:pass@host:5432/db",
                BACKEND_CORS_ORIGINS=["https://my-app.netlify.app"]
            )
    finally:
        os.environ["ENVIRONMENT"] = "testing"
        os.environ.pop("SECRET_KEY", None)


def test_production_rejects_short_secret():
    """Verify that secrets shorter than 32 characters are rejected in production."""
    os.environ["ENVIRONMENT"] = "production"
    os.environ["SECRET_KEY"] = "short-secret-key-123"
    try:
        with pytest.raises(ValueError, match="at least 32 characters long"):
            Settings(
                ENVIRONMENT="production",
                DEBUG=False,
                DATABASE_URL="postgresql://user:pass@host:5432/db",
                BACKEND_CORS_ORIGINS=["https://my-app.netlify.app"]
            )
    finally:
        os.environ["ENVIRONMENT"] = "testing"
        os.environ.pop("SECRET_KEY", None)


def test_production_rejects_sqlite():
    """Verify that ephemeral SQLite is strictly rejected in production."""
    os.environ["ENVIRONMENT"] = "production"
    os.environ["SECRET_KEY"] = "super-secure-production-secret-key-must-be-long-enough-32-chars"
    try:
        with pytest.raises(ValueError, match="Ephemeral SQLite databases are strictly prohibited"):
            Settings(
                ENVIRONMENT="production",
                DEBUG=False,
                DATABASE_URL="sqlite:///./powerhouse.db",
                BACKEND_CORS_ORIGINS=["https://my-app.netlify.app"]
            )
    finally:
        os.environ["ENVIRONMENT"] = "testing"
        os.environ.pop("SECRET_KEY", None)


def test_production_rejects_wildcard_cors():
    """Verify that wildcard CORS is rejected in production with credentials."""
    os.environ["ENVIRONMENT"] = "production"
    os.environ["SECRET_KEY"] = "super-secure-production-secret-key-must-be-long-enough-32-chars"
    try:
        with pytest.raises(ValueError, match="Wildcard '\\*' in BACKEND_CORS_ORIGINS is prohibited"):
            Settings(
                ENVIRONMENT="production",
                DEBUG=False,
                DATABASE_URL="postgresql://user:pass@host:5432/db",
                BACKEND_CORS_ORIGINS=["*"]
            )
    finally:
        os.environ["ENVIRONMENT"] = "testing"
        os.environ.pop("SECRET_KEY", None)


def test_database_url_normalization():
    """Verify that postgres:// is normalized to postgresql+psycopg2://."""
    s = Settings(
        DATABASE_URL="postgres://render_user:pass123@dpg-host.oregon-postgres.render.com/powerhouse_db"
    )
    assert s.DATABASE_URL.startswith("postgresql+psycopg2://")


def test_health_and_readiness_endpoints(client: TestClient):
    """Verify that /health and /ready respond successfully with appropriate structure."""
    # 1. Root /health
    res_health = client.get("/health")
    assert res_health.status_code == 200
    data_health = res_health.json()
    assert data_health["status"] == "healthy"
    assert data_health["service"] == "power-house-api"

    # 2. API v1 /health
    res_v1_health = client.get("/api/v1/health")
    assert res_v1_health.status_code == 200
    assert res_v1_health.json()["status"] == "healthy"

    # 3. Root /ready
    res_ready = client.get("/ready")
    assert res_ready.status_code == 200
    data_ready = res_ready.json()
    assert data_ready["status"] == "ready"
    assert data_ready["database"] == "connected"

    # 4. API v1 /ready
    res_v1_ready = client.get("/api/v1/ready")
    assert res_v1_ready.status_code == 200
    assert res_v1_ready.json()["database"] == "connected"


def test_all_models_registered_in_metadata():
    """Verify that all 31 core application tables are defined in Base.metadata."""
    expected_tables = {
        'action_proposals', 'agent_runs', 'alerts', 'applications', 'approvals',
        'audit_logs', 'business_analyses', 'business_profiles', 'compliance_tasks',
        'disruption_events', 'documents', 'emission_factors', 'employee_profiles',
        'government_schemes', 'green_impact_measurements', 'green_operational_metrics',
        'green_opportunities', 'learning_paths', 'regulatory_chunks',
        'regulatory_knowledge_documents', 'role_profiles', 'shipment_checkpoints',
        'shipment_exceptions', 'shipments', 'skill_gaps', 'supplier_documents',
        'suppliers', 'supply_chain_decisions', 'supply_chain_risks', 'supply_items',
        'users'
    }
    actual_tables = set(Base.metadata.tables.keys())
    missing = expected_tables - actual_tables
    assert not missing, f"Missing tables in metadata: {missing}"


def test_alembic_boolean_server_defaults_postgresql_compatible():
    """
    Regression test: Verify that all Boolean columns with server_default in Alembic
    migrations use PostgreSQL-compatible boolean expressions (e.g. sa.false() or sa.true()),
    and never use integer defaults ('0', 0, sa.text('0')) which cause psycopg2 DatatypeMismatch.
    """
    import re
    from sqlalchemy.dialects import postgresql
    import sqlalchemy as sa

    versions_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "alembic", "versions")
    assert os.path.isdir(versions_dir), f"Migrations directory not found: {versions_dir}"

    incompatible_patterns = [
        re.compile(r"server_default\s*=\s*['\"]0['\"]"),
        re.compile(r"server_default\s*=\s*['\"]1['\"]"),
        re.compile(r"server_default\s*=\s*sa\.text\(\s*['\"]0['\"]\s*\)"),
        re.compile(r"server_default\s*=\s*sa\.text\(\s*['\"]1['\"]\s*\)"),
    ]

    violations = []
    migration_files = [f for f in os.listdir(versions_dir) if f.endswith(".py")]
    assert len(migration_files) >= 6, "Expected at least 6 migration files in chain"

    for file_name in migration_files:
        file_path = os.path.join(versions_dir, file_name)
        with open(file_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        for line_no, line in enumerate(lines, 1):
            if "Boolean" in line and "server_default" in line:
                for pat in incompatible_patterns:
                    if pat.search(line):
                        violations.append(f"{file_name}:{line_no} -> {line.strip()}")

    assert not violations, f"Found incompatible integer defaults for Boolean columns in migrations: {violations}"

    # Verify that sa.false() and sa.true() compile to valid PostgreSQL boolean literals
    false_compiled = str(sa.false().compile(dialect=postgresql.dialect()))
    true_compiled = str(sa.true().compile(dialect=postgresql.dialect()))
    assert false_compiled.lower() == "false"
    assert true_compiled.lower() == "true"

