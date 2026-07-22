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
    plan = await authenticated_client.post(
        "/api/ai/create-test-plan",
        json={"plan_name": "Digital validation", "target": "example.test"},
        headers=headers,
    )
    assert plan.status_code == 200
    assert plan.json()["data"]["status"] == "DRAFT"


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