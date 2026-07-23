import asyncio

import pytest
from sqlalchemy import select

import app.main as main_module
from app.auth import create_token, password_hash
from app.config import get_settings
from app.db import SessionLocal
from app.models import Organization, ScanPlan, Task, User

from app.sync import sync_once


async def test_liveness_is_independent_and_keeps_compatibility_alias(client):
    live = await client.get("/health/live")
    compatibility = await client.get("/health")

    assert live.status_code == 200
    assert live.json() == {"status": "ok"}
    assert compatibility.json() == live.json()


async def test_readiness_checks_the_database(client):
    response = await client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


async def test_readiness_reports_database_failure_without_details(client, monkeypatch):
    class BrokenSession:
        async def __aenter__(self):
            raise OSError("database credentials must not leak")

        async def __aexit__(self, *_):
            return False

    monkeypatch.setattr(main_module, "SessionLocal", BrokenSession)

    response = await client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}
    assert "credentials" not in response.text


async def test_same_origin_spa_serves_assets_and_browser_routes(
    client, tmp_path, monkeypatch
):
    static_dir = tmp_path / "static"
    assets_dir = static_dir / "assets"
    assets_dir.mkdir(parents=True)
    (static_dir / "index.html").write_text(
        "<!doctype html><title>AI Security Platform</title>",
        encoding="utf-8",
    )
    (assets_dir / "app.js").write_text("window.platformReady = true;", encoding="utf-8")
    (static_dir / ".secret").write_text("must-not-leak", encoding="utf-8")
    monkeypatch.setattr(get_settings(), "static_dir", static_dir)

    root = await client.get("/")
    asset = await client.get("/assets/app.js")
    browser_route = await client.get("/tasks")
    missing_api = await client.get("/api/v1/not-a-real-endpoint")
    hidden_file = await client.get("/.secret")

    assert root.status_code == 200
    assert "AI Security Platform" in root.text
    assert asset.status_code == 200
    assert asset.text == "window.platformReady = true;"
    assert browser_route.status_code == 200
    assert browser_route.text == root.text
    assert missing_api.status_code == 404
    assert missing_api.json()["code"] == "NOT_FOUND"
    assert hidden_file.status_code == 404
    assert "must-not-leak" not in hidden_file.text


async def test_authorized_plan_runs_through_mock_engine(authenticated_client):
    plan_response = await authenticated_client.post(
        "/api/v1/scan-plans",
        json={
            "name": "Safe validation",
            "test_type": "standard",
            "targets": ["example.test"],
            "authorization_confirmed": True,
        },
    )
    assert plan_response.status_code == 201
    plan_id = plan_response.json()["id"]

    task_response = await authenticated_client.post(
        "/api/v1/tasks", json={"plan_id": plan_id, "request_id": "golden-path-001"}
    )
    assert task_response.status_code == 201
    task_id = task_response.json()["id"]

    for _ in range(5):
        await sync_once(get_settings())
        await asyncio.sleep(0)

    result = await authenticated_client.get(f"/api/v1/tasks/{task_id}")
    assert result.status_code == 200
    assert result.json()["status"] == "SUCCEEDED"


async def test_draft_plan_cannot_start(authenticated_client):
    plan_response = await authenticated_client.post(
        "/api/v1/scan-plans",
        json={"name": "Unconfirmed", "targets": ["example.test"]},
    )
    response = await authenticated_client.post(
        "/api/v1/tasks", json={"plan_id": plan_response.json()["id"]}
    )
    assert response.status_code == 409
    assert response.json()["code"] == "PLAN_NOT_READY"


async def test_assets_are_available_to_the_frontend(authenticated_client):
    created = await authenticated_client.post(
        "/api/v1/assets",
        json={"asset_type": "domain", "address": "example.test", "authorized": True},
    )
    assert created.status_code == 201
    listed = await authenticated_client.get("/api/v1/assets")
    assert listed.status_code == 200
    assert listed.json()["data"]["total"] == 1


async def test_asset_list_contract_includes_page_and_update_time(authenticated_client):
    await authenticated_client.post(
        "/api/v1/assets",
        json={"asset_type": "domain", "address": "asset.example.test"},
    )

    response = await authenticated_client.get("/api/v1/assets?page=1&page_size=1")

    assert response.status_code == 200
    page = response.json()["data"]
    assert page["page"] == 1
    assert page["page_size"] == 1
    assert page["total"] == 1
    assert page["items"][0]["updated_at"]


async def test_task_list_contract_includes_plan_and_creator_summaries(
    authenticated_client,
):
    plan = await authenticated_client.post(
        "/api/v1/scan-plans",
        json={
            "name": "Frontend contract",
            "test_type": "standard",
            "targets": ["contract.example.test"],
            "authorization_confirmed": True,
        },
    )
    await authenticated_client.post(
        "/api/v1/tasks",
        json={"plan_id": plan.json()["id"], "request_id": "list-contract-task"},
    )

    response = await authenticated_client.get("/api/v1/tasks?page=1&page_size=1")

    assert response.status_code == 200
    page = response.json()["data"]
    assert page["page"] == 1
    assert page["page_size"] == 1
    assert page["total"] == 1
    item = page["items"][0]
    assert item["plan_name"] == "Frontend contract"
    assert item["test_type"] == "standard"
    assert item["targets"] == ["contract.example.test"]
    assert item["created_by_name"] == "Test Admin"


async def test_task_qa_messages_are_scoped_and_persisted(authenticated_client):
    plan = await authenticated_client.post(
        "/api/v1/scan-plans",
        json={
            "name": "QA context",
            "targets": ["example.test"],
            "authorization_confirmed": True,
        },
    )
    task = await authenticated_client.post(
        "/api/v1/tasks",
        json={"plan_id": plan.json()["id"], "request_id": "qa-message-test"},
    )
    task_id = task.json()["id"]

    created = await authenticated_client.post(
        f"/api/v1/tasks/{task_id}/qa/messages",
        json={"content": "  What was discovered?  "},
    )
    assert created.status_code == 201
    assert created.json()["role"] == "user"
    assert created.json()["content"] == "What was discovered?"

    listed = await authenticated_client.get(f"/api/v1/tasks/{task_id}/qa/messages")
    assert listed.status_code == 200
    assert [item["content"] for item in listed.json()["data"]] == ["What was discovered?"]

    invalid = await authenticated_client.post(
        f"/api/v1/tasks/{task_id}/qa/messages", json={"content": "   "}
    )
    assert invalid.status_code == 422


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/tasks",
        "/api/v1/assets",
        "/api/v1/vulnerabilities",
        "/api/v1/reports",
    ],
)
async def test_resource_lists_reject_unauthenticated_requests(client, path):
    response = await client.get(path)

    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHORIZED"


async def test_asset_list_is_isolated_across_organizations(authenticated_client):
    await authenticated_client.post(
        "/api/v1/assets",
        json={"asset_type": "domain", "address": "first-org.example.test"},
    )
    async with SessionLocal() as session:
        first_user = await session.scalar(select(User).where(User.username == "admin"))
        second_org = Organization(name="Second Organization")
        session.add(second_org)
        await session.flush()
        second_user = User(
            org_id=second_org.id,
            username="second-admin",
            name="Second Admin",
            password_hash=password_hash.hash("second-admin-password"),
            role="admin",
        )
        session.add(second_user)
        await session.flush()
        second_plan = ScanPlan(
            org_id=second_org.id,
            created_by=second_user.id,
            name="Second organization plan",
            targets=["second.example.test"],
        )
        session.add(second_plan)
        await session.flush()
        session.add(
            Task(
                org_id=first_user.org_id,
                plan_id=second_plan.id,
                created_by=second_user.id,
                request_id="malformed-cross-org-task",
                name="Leaked second organization task",
            )
        )
        await session.commit()
        await session.refresh(second_user)
        token = create_token(second_user, get_settings())

    response = await authenticated_client.get(
        "/api/v1/assets", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    assert response.json()["data"]["total"] == 0

    tasks = await authenticated_client.get("/api/v1/tasks")
    assert tasks.status_code == 200
    assert tasks.json()["data"]["total"] == 0
    assert "Second organization" not in tasks.text


async def test_platform_http_errors_use_the_documented_contract(client):
    unauthorized = await client.get("/api/v1/tasks")
    missing = await client.get("/not-a-platform-route")

    assert unauthorized.json() == {
        "success": False,
        "code": "UNAUTHORIZED",
        "message": "Authentication required",
        "details": None,
    }
    assert missing.status_code == 404
    assert missing.json() == {
        "success": False,
        "code": "NOT_FOUND",
        "message": "Not Found",
        "details": None,
    }
