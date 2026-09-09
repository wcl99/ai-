import pytest
from sqlalchemy.engine import URL

from app.config import Settings


def production_settings(**overrides):
    values = {
        "app_environment": "production",
        "jwt_secret": "production-secret-that-is-at-least-32-characters",
        "cookie_secure": True,
        "database_password": "production-database-password",
        "bootstrap_admin_username": "admin",
        "bootstrap_admin_password": "production-bootstrap-password",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_development_configuration_keeps_local_http_available():
    settings = Settings(
        _env_file=None,
        jwt_secret="development-secret-that-is-at-least-32-characters",
    )

    settings.validate_runtime_security()


def test_production_rejects_insecure_session_cookie():
    settings = production_settings(cookie_secure=False)

    with pytest.raises(ValueError, match="COOKIE_SECURE"):
        settings.validate_runtime_security()


def test_production_rejects_placeholder_jwt_secret():
    settings = production_settings(
        jwt_secret="replace-with-at-least-32-random-characters",
    )

    with pytest.raises(ValueError, match="JWT_SECRET"):
        settings.validate_runtime_security()


def test_production_rejects_placeholder_bootstrap_password():
    settings = production_settings(bootstrap_admin_password="change-this-password")

    with pytest.raises(ValueError, match="BOOTSTRAP_ADMIN_PASSWORD"):
        settings.validate_runtime_security()


def test_production_rejects_placeholder_database_password():
    settings = production_settings(database_password="change-this-database-password")

    with pytest.raises(ValueError, match="DATABASE_PASSWORD"):
        settings.validate_runtime_security()


def test_production_requires_database_password():
    settings = production_settings(database_password=None)

    with pytest.raises(ValueError, match="DATABASE_PASSWORD"):
        settings.validate_runtime_security()


def test_production_demo_data_requires_explicit_organization_scope():
    settings = production_settings(demo_data_enabled=True, demo_data_org_id=None)

    with pytest.raises(ValueError, match="DEMO_DATA_ORG_ID"):
        settings.validate_runtime_security()


def test_production_rejects_empty_database_password():
    settings = production_settings(database_password="")

    with pytest.raises(ValueError, match="DATABASE_PASSWORD"):
        settings.validate_runtime_security()


def test_database_password_is_encoded_by_sqlalchemy_url():
    password = "random@password:/#%value"
    settings = production_settings(
        database_password=password,
        database_host="postgres",
    )

    url = settings.database_connection_url

    assert isinstance(url, URL)
    assert url.password == password
    assert "random%40password%3A%2F%23%25value" in url.render_as_string(
        hide_password=False
    )
    assert "random%40password%3A%2F%23%25value" in (
        settings.database_connection_url_string
    )


def test_empty_database_password_keeps_explicit_database_url():
    settings = Settings(
        _env_file=None,
        jwt_secret="test-secret-that-is-at-least-32-characters",
        database_url="sqlite+aiosqlite:///:memory:",
        database_password="",
    )

    assert settings.database_connection_url == "sqlite+aiosqlite:///:memory:"
