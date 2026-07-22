import asyncio

from app.config import get_settings
from app.sync import sync_once


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