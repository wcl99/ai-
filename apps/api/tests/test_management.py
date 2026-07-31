from app.config import get_settings
from app.db import SessionLocal
from app.main import app
from app.models import User

from sqlalchemy import select


async def test_login_cookie_uses_configured_security_attributes(client):
    settings = get_settings().model_copy(update={"cookie_secure": True})
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        response = await client.post(
            "/api/v1/auth/login",
            json={
                "username": "admin",
                "password": "correct-horse-battery-staple",
            },
        )
    finally:
        app.dependency_overrides.pop(get_settings, None)

    assert response.status_code == 200
    cookie = response.headers["set-cookie"].lower()
    assert "access_token=" in cookie
    assert "httponly" in cookie
    assert "secure" in cookie
    assert "samesite=lax" in cookie


async def test_logout_expires_access_token(authenticated_client):
    settings = get_settings().model_copy(update={"cookie_secure": True})
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        response = await authenticated_client.post("/api/v1/auth/logout")
    finally:
        app.dependency_overrides.pop(get_settings, None)

    assert response.status_code == 200
    assert response.json() == {"success": True, "message": "logged out", "data": None}
    cookie = response.headers["set-cookie"].lower()
    assert "access_token=" in cookie
    assert "max-age=0" in cookie
    assert "httponly" in cookie
    assert "secure" in cookie
    assert "samesite=lax" in cookie


async def test_admin_creates_digital_human_and_it_can_use_ai_api(authenticated_client):
    created = await authenticated_client.post(
        "/api/v1/users",
        json={
            "username": "digital.agent",
            "name": "Digital Agent",
            "password": "digital-agent-password",
            "role": "operator",
            "is_digital_human": True,
        },
    )
    assert created.status_code == 201
    assert created.json()["is_active"] is True
    assert "password_hash" not in created.json()

    duplicate = await authenticated_client.post(
        "/api/v1/users",
        json={
            "username": "digital.agent",
            "name": "Duplicate",
            "password": "digital-agent-password",
        },
    )
    assert duplicate.status_code == 409

    audits = await authenticated_client.get("/api/v1/audit-logs?action=user.create")
    assert audits.status_code == 200
    assert audits.json()["data"]["total"] == 1

    login = await authenticated_client.post(
        "/api/v1/auth/login",
        json={"username": "DIGITAL.AGENT", "password": "digital-agent-password"},
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['token']}"}

    forbidden = await authenticated_client.get("/api/v1/users", headers=headers)
    assert forbidden.status_code == 403
    forbidden_setting = await authenticated_client.patch(
        "/api/v1/settings/organization",
        json={"name": "Forbidden rename"},
        headers=headers,
    )
    assert forbidden_setting.status_code == 403
    plan = await authenticated_client.post(
        "/api/ai/create-test-plan",
        json={"plan_name": "Digital validation", "target": "example.test"},
        headers=headers,
    )
    assert plan.status_code == 200
    assert isinstance(plan.json()["plan_id"], int)
    assert plan.json()["plan"]["status"] == "pending"


async def test_runtime_settings_hide_secrets_and_admin_cannot_lock_itself_out(authenticated_client):
    current = await authenticated_client.get("/api/v1/auth/me")
    user_id = current.json()["id"]

    runtime = await authenticated_client.get("/api/v1/settings/runtime")
    assert runtime.status_code == 200
    assert runtime.json()["data"]["engine_configured"] is True
    assert "xiaoyi_token" not in runtime.text
    assert "database_url" not in runtime.text

    lockout = await authenticated_client.patch(
        f"/api/v1/users/{user_id}", json={"is_active": False}
    )
    assert lockout.status_code == 409
    demotion = await authenticated_client.patch(
        f"/api/v1/users/{user_id}", json={"role": "operator"}
    )
    assert demotion.status_code == 409


async def test_organization_settings_are_trimmed_and_audited(authenticated_client):
    updated = await authenticated_client.patch(
        "/api/v1/settings/organization", json={"name": "  Validation Team  "}
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Validation Team"

    read = await authenticated_client.get("/api/v1/settings/organization")
    assert read.status_code == 200
    assert read.json()["name"] == "Validation Team"
    audits = await authenticated_client.get(
        "/api/v1/audit-logs?resource_type=organization"
    )
    assert audits.json()["data"]["items"][0]["action"] == "organization.update"


async def test_inactive_user_session_is_rejected(authenticated_client):
    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.username == "admin"))
        user.is_active = False
        await session.commit()

    response = await authenticated_client.get("/api/v1/auth/me")

    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"
