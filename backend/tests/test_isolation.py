import os
import subprocess
import pytest
from app.core.config import settings


def test_backend_settings_isolation():
    """Verify that backend settings are strictly isolated to POWER HOUSE."""
    assert "POWER HOUSE" in settings.APP_NAME, "App name must be POWER HOUSE"
    assert "mineguard" not in settings.APP_NAME.lower(), "Prohibited term 'mineguard' in APP_NAME"
    assert "mineguard" not in settings.DATABASE_URL.lower(), "Prohibited term 'mineguard' in DATABASE_URL"
    assert "mineguard" not in settings.SECRET_KEY.lower(), "Prohibited term 'mineguard' in SECRET_KEY"


def test_git_remotes_isolation():
    """Verify that no git remote references the MineGuard repository."""
    try:
        remotes = subprocess.check_output(
            ["git", "remote", "-v"],
            stderr=subprocess.DEVNULL,
            text=True
        )
        assert "mineguard" not in remotes.lower(), "Prohibited remote pointing to MineGuard detected"
    except (subprocess.CalledProcessError, FileNotFoundError):
        # Ignore if running in environment without git
        pass


def test_no_prohibited_terms_in_backend_code():
    """Verify that backend source files do not reference MineGuard or mining models."""
    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "app"))
    forbidden = ["mineguard", "mine_guard", "mine-guard"]

    for root, _, files in os.walk(backend_dir):
        for file in files:
            if file.endswith(".py"):
                file_path = os.path.join(root, file)
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read().lower()
                    for term in forbidden:
                        assert term not in content, (
                            f"Prohibited cross-project term '{term}' found in {file_path}"
                        )


def test_production_secret_requirement(monkeypatch):
    """Verify that in production mode, missing or default SECRET_KEY fails safely."""
    from app.core.config import Settings

    # Missing SECRET_KEY in production must raise ValueError
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.delenv("SECRET_KEY", raising=False)

    with pytest.raises(ValueError, match="The SECRET_KEY environment variable is mandatory in production"):
        Settings()

    # Default placeholder key in production must also raise ValueError
    monkeypatch.setenv("SECRET_KEY", "powerhouse-dev-only-secret-key-do-not-use-in-production")
    with pytest.raises(ValueError, match="cannot use known development default keys"):
        Settings()

    # Valid explicit production secret passes without error
    monkeypatch.setenv("SECRET_KEY", "secure_prod_random_token_9876543210_valid")
    prod_settings = Settings()
    assert prod_settings.ENVIRONMENT == "production"
