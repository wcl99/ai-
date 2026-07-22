import asyncio

from sqlalchemy import select

from app import sync
from app.config import get_settings
from app.db import SessionLocal
from app.engine import EngineTask
from app.errors import AppError
from app.models import Report, Task


class ChildEngine:
    async def create_task(self, payload: dict, request_id: str) -> EngineTask:
        return EngineTask(
            "parent-external",
            "RUNNING",
            "INFO_COLLECTING",
            10,
            {"token": "parent-secret"},
        )

    async def get_task(self, external_task_id: str, current_progress: float = 0) -> EngineTask:
        return EngineTask(
            external_task_id,
            "RUNNING",
            "SCANNING",
            50,
            {"authorization": "Bearer secret", "reportUrl": "http://engine.local/reports/parent.pdf"},
        )

    async def get_children(self, external_task_id: str) -> list[EngineTask]:
        return [
            EngineTask(
                "child-external",
                "RUNNING",
                "SCANNING",
                40,
                {"password": "child-secret", "result": "safe"},
                "Port scan",
            )
        ]

    async def stop_task(self, external_task_id: str) -> None:
        return None


async def test_sync_persists_child_tasks_and_redacts_engine_payload(authenticated_client, monkeypatch):
    plan = await authenticated_client.post(
        "/api/v1/scan-plans",
        json={
            "name": "Child sync",
            "targets": ["example.test"],
            "authorization_confirmed": True,
        },
    )
    task = await authenticated_client.post(
        "/api/v1/tasks",
        json={"plan_id": plan.json()["id"], "request_id": "child-sync-test"},
    )
    monkeypatch.setattr(sync, "get_engine_client", lambda settings: ChildEngine())

    await sync.sync_once(get_settings())
    await sync.sync_once(get_settings())

    children = await authenticated_client.get(f"/api/v1/tasks/{task.json()['id']}/children")
    assert children.status_code == 200
    assert children.json()["data"][0]["name"] == "Port scan"
    async with SessionLocal() as session:
        parent = await session.scalar(select(Task).where(Task.external_task_id == "parent-external"))
        child = await session.scalar(select(Task).where(Task.external_task_id == "child-external"))
        report = await session.scalar(select(Report).where(Report.task_id == parent.id))
    assert parent.raw_external["authorization"] == "***"
    assert child.raw_external == {"password": "***", "result": "safe"}
    assert report.filename == "parent.pdf"
    assert report.format == "pdf"
    assert report.status == "EXTERNAL"

    listed = await authenticated_client.get(f"/api/v1/reports?task_id={task.json()['id']}")
    assert listed.json()["data"][0]["external_url"] == "http://engine.local/reports/parent.pdf"
    unavailable = await authenticated_client.get(
        f"/api/v1/reports/{listed.json()['data'][0]['id']}/download"
    )
    assert unavailable.status_code == 404

def test_engine_report_url_rejects_unsupported_or_credentialed_urls():
    assert sync.engine_report_url({"reportUrl": "ftp://engine.local/report.pdf"}) is None
    assert sync.engine_report_url({"reportUrl": "http://user:pass@engine.local/report.pdf"}) is None
    assert sync.engine_report_url(
        {"data": {"report": {"url": "https://engine.local/report.pdf"}}}
    ) == "https://engine.local/report.pdf"

class FlakyEngine:
    def __init__(self, failures: int, code: str = "ENGINE_UNAVAILABLE"):
        self.failures = failures
        self.code = code
        self.attempts = 0

    async def create_task(self, payload: dict, request_id: str) -> EngineTask:
        self.attempts += 1
        if self.attempts <= self.failures:
            raise AppError(502, self.code, "engine failure")
        return EngineTask("recovered-task", "SUCCEEDED", "FINISHED", 100, {})


async def create_queued_task(client, name: str, request_id: str) -> str:
    plan = await client.post(
        "/api/v1/scan-plans",
        json={
            "name": name,
            "targets": ["example.test"],
            "authorization_confirmed": True,
        },
    )
    task = await client.post(
        "/api/v1/tasks",
        json={"plan_id": plan.json()["id"], "request_id": request_id},
    )
    return task.json()["id"]


async def test_transient_engine_failures_retry_and_recover(authenticated_client, monkeypatch):
    task_id = await create_queued_task(
        authenticated_client, "Retry task", "retry-task-request"
    )
    engine = FlakyEngine(failures=2)
    monkeypatch.setattr(sync, "get_engine_client", lambda settings: engine)
    settings = get_settings().model_copy(update={"engine_retry_limit": 2})

    await sync.sync_once(settings)
    first = await authenticated_client.get(f"/api/v1/tasks/{task_id}")
    assert first.json()["status"] == "QUEUED"
    assert first.json()["sync_failures"] == 1

    await sync.sync_once(settings)
    await sync.sync_once(settings)
    recovered = await authenticated_client.get(f"/api/v1/tasks/{task_id}")
    assert recovered.json()["status"] == "SUCCEEDED"
    assert recovered.json()["sync_failures"] == 0
    assert recovered.json()["error_code"] is None


async def test_retry_limit_exhaustion_fails_task(authenticated_client, monkeypatch):
    task_id = await create_queued_task(
        authenticated_client, "Exhausted task", "exhausted-task-request"
    )
    engine = FlakyEngine(failures=3)
    monkeypatch.setattr(sync, "get_engine_client", lambda settings: engine)
    settings = get_settings().model_copy(update={"engine_retry_limit": 2})

    await sync.sync_once(settings)
    await sync.sync_once(settings)
    await sync.sync_once(settings)
    failed = await authenticated_client.get(f"/api/v1/tasks/{task_id}")
    assert failed.json()["status"] == "FAILED"
    assert failed.json()["sync_failures"] == 2
    assert failed.json()["error_code"] == "ENGINE_UNAVAILABLE"


async def test_non_retryable_engine_error_fails_immediately(authenticated_client, monkeypatch):
    task_id = await create_queued_task(
        authenticated_client, "Rejected task", "rejected-task-request"
    )
    engine = FlakyEngine(failures=1, code="ENGINE_REJECTED")
    monkeypatch.setattr(sync, "get_engine_client", lambda settings: engine)

    await sync.sync_once(get_settings())
    failed = await authenticated_client.get(f"/api/v1/tasks/{task_id}")
    assert failed.json()["status"] == "FAILED"
    assert failed.json()["error_code"] == "ENGINE_REJECTED"


async def test_stop_request_reaches_terminal_state(authenticated_client):
    task_id = await create_queued_task(
        authenticated_client, "Stop task", "stop-task-request"
    )
    await sync.sync_once(get_settings())
    active_retry = await authenticated_client.post(f"/api/v1/tasks/{task_id}/retry")
    assert active_retry.status_code == 409
    stopped = await authenticated_client.post(f"/api/v1/tasks/{task_id}/stop")
    assert stopped.json()["status"] == "CANCELLING"

    await sync.sync_once(get_settings())
    result = await authenticated_client.get(f"/api/v1/tasks/{task_id}")
    assert result.json()["status"] == "CANCELLED"
    retried = await authenticated_client.post(f"/api/v1/tasks/{task_id}/retry")
    assert retried.status_code == 201
    assert retried.json()["id"] != task_id
    assert retried.json()["status"] == "QUEUED"
    events = await authenticated_client.get(f"/api/v1/tasks/{task_id}/events")
    assert events.json()["data"][-1]["event_type"] == "retried"


async def test_sync_loop_continues_after_iteration_failure(monkeypatch):
    stop = asyncio.Event()
    calls = 0

    async def flaky_once(settings):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise RuntimeError("database temporarily unavailable")
        stop.set()

    monkeypatch.setattr(sync, "sync_once", flaky_once)
    settings = get_settings().model_copy(update={"sync_interval_seconds": 0.001})
    await sync.sync_forever(settings, stop)
    assert calls == 2