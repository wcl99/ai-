import asyncio
import json
import uuid
from pathlib import Path

import pytest
from sqlalchemy import select

import app.main as main_module
from app import result_aggregation, sync
from app.config import get_settings
from app.db import SessionLocal
from app.engine import EngineTask
from app.errors import AppError
from app.models import Report, Task, Vulnerability


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
                "FAILED",
                "FINISHED",
                100,
                {"password": "child-secret", "result": "safe"},
                "Port scan",
                "子任务扫描失败或超时",
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
    confirmation = await authenticated_client.post(
        f"/api/v1/scan-plans/{plan.json()['id']}/confirm"
    )
    assert confirmation.status_code == 200
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
    assert children.json()["data"][0]["error_code"] == "XIAOYI_TASK_FAILED"
    assert children.json()["data"][0]["error_message"] == "子任务扫描失败或超时"
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
    assert listed.json()["data"]["items"][0]["external_url"] == "http://engine.local/reports/parent.pdf"
    unavailable = await authenticated_client.get(
        f"/api/v1/reports/{listed.json()['data']['items'][0]['id']}/download"
    )
    assert unavailable.status_code == 404


async def test_active_child_tools_persist_findings_without_duplicates(
    authenticated_client, monkeypatch
):
    class ActiveFindingEngine:
        async def create_task(self, payload: dict, request_id: str) -> EngineTask:
            return EngineTask("active-parent", "RUNNING", "SCANNING", 25, {})

        async def get_task(
            self, external_task_id: str, current_progress: float = 0
        ) -> EngineTask:
            return EngineTask(external_task_id, "RUNNING", "SCANNING", 50, {})

        async def get_children(self, external_task_id: str) -> list[EngineTask]:
            if external_task_id != "active-parent":
                return []
            return [
                EngineTask(
                    "active-child",
                    "RUNNING",
                    "SCANNING",
                    40,
                    {},
                    "example.test",
                )
            ]

        async def get_tools(self, external_task_id: str) -> list[dict]:
            assert external_task_id == "active-child"
            return [
                {
                    "toolName": "live-validator",
                    "phase": "SCANNING",
                    "success": True,
                    "result": json.dumps(
                        [
                            {
                                "type": "text",
                                "text": json.dumps(
                                    {
                                        "vuln_info": {
                                            "vuln_name": "Live confirmed finding",
                                            "vuln_level": "high",
                                            "http_url": "https://example.test/live",
                                        }
                                    }
                                ),
                            }
                        ]
                    ),
                }
            ]

        async def stop_task(self, external_task_id: str) -> None:
            return None

    task_id = await create_queued_task(
        authenticated_client, "Live findings", "live-findings-request"
    )
    monkeypatch.setattr(sync, "get_engine_client", lambda settings: ActiveFindingEngine())

    await sync.sync_once(get_settings())
    await sync.sync_once(get_settings())

    async with SessionLocal() as session:
        findings = list(
            await session.scalars(
                select(Vulnerability).where(
                    Vulnerability.task_id == uuid.UUID(task_id)
                )
            )
        )
    assert [finding.title for finding in findings] == ["Live confirmed finding"]

    await sync.sync_once(get_settings())
    async with SessionLocal() as session:
        findings = list(
            await session.scalars(
                select(Vulnerability).where(
                    Vulnerability.task_id == uuid.UUID(task_id)
                )
            )
        )
    assert len(findings) == 1


@pytest.mark.parametrize(
    ("tool_error", "expected_status"),
    [
        ("ZIP entry size is too large or invalid", "SUCCEEDED"),
        ("Target refused connection during validation", "PARTIAL_SUCCEEDED"),
    ],
)
async def test_terminal_tool_evidence_creates_local_report_without_hiding_failures(
    authenticated_client, monkeypatch, tmp_path, tool_error, expected_status
):
    class EvidenceEngine:
        async def create_task(self, payload: dict, request_id: str) -> EngineTask:
            return EngineTask("evidence-parent", "RUNNING", "SCANNING", 50, {})

        async def get_task(
            self, external_task_id: str, current_progress: float = 0
        ) -> EngineTask:
            return EngineTask(external_task_id, "FAILED", "FINISHED", 100, {})

        async def get_children(self, external_task_id: str) -> list[EngineTask]:
            return [
                EngineTask(
                    "evidence-child",
                    "FAILED",
                    "FINISHED",
                    100,
                    {},
                    "example.test",
                )
            ]

        async def get_tools(self, external_task_id: str) -> list[dict]:
            vulnerability = {
                "status": "success",
                "detail": {
                    "status": "valid",
                    "vuln_info": {
                        "vuln_name": "Source Map exposure",
                        "vuln_description": "Production source map is publicly readable.",
                        "vuln_level": "低危",
                        "vuln_suggestions": "Disable production source maps.",
                        "http_url": "https://example.test/app.js.map",
                    },
                },
            }
            return [
                {
                    "toolName": "scan_smart_retest_result_detail",
                    "phase": "EXPLOIT_COMPLETED",
                    "success": True,
                    "result": json.dumps(
                        [{"type": "text", "text": json.dumps(vulnerability)}]
                    ),
                },
                {
                    "toolName": "report_generator",
                    "phase": "REPORT_GENERATING",
                    "success": False,
                    "errorMessage": json.dumps(
                        [
                            {
                                "type": "text",
                                "text": json.dumps(
                                    {
                                        "status": "failed",
                                        "message": tool_error,
                                    }
                                ),
                            }
                        ]
                    ),
                },
            ]

        async def stop_task(self, external_task_id: str) -> None:
            return None

    task_id = await create_queued_task(
        authenticated_client, "Evidence aggregation", "evidence-aggregation"
    )
    monkeypatch.setattr(sync, "get_engine_client", lambda settings: EvidenceEngine())
    def fake_convert(self, markdown, output_dir, basename):
        outputs = {}
        for report_format in ("docx", "pdf"):
            path = output_dir / f"{basename}.{report_format}"
            path.write_bytes(report_format.encode())
            outputs[report_format] = path
        return outputs

    monkeypatch.setattr(result_aggregation.ReportConverter, "convert", fake_convert)
    settings = get_settings().model_copy(update={"report_dir": tmp_path})

    await sync.sync_once(settings)
    await sync.sync_once(settings)

    task = await authenticated_client.get(f"/api/v1/tasks/{task_id}")
    assert task.json()["status"] == expected_status
    if expected_status == "SUCCEEDED":
        assert task.json()["error_code"] is None
        assert task.json()["error_message"] is None
    else:
        assert tool_error in task.json()["error_message"]
    async with SessionLocal() as session:
        vulnerability = await session.scalar(
            select(Vulnerability).where(Vulnerability.task_id == uuid.UUID(task_id))
        )
        reports = list(await session.scalars(
            select(Report).where(Report.task_id == uuid.UUID(task_id))
        ))
    assert vulnerability.title == "Source Map exposure"
    assert vulnerability.severity == "low"
    assert {report.format for report in reports} == {"md", "docx", "pdf"}
    report = next(report for report in reports if report.format == "md")
    assert report.local_path is not None
    report_id = str(report.id)
    content = Path(report.local_path).read_text(encoding="utf-8")
    assert "Source Map exposure" in content
    assert tool_error in content
    preview = await authenticated_client.get(
        f"/api/v1/reports/{report_id}/content"
    )
    assert preview.status_code == 200
    assert "Source Map exposure" in preview.text
    events = await authenticated_client.get(f"/api/v1/tasks/{task_id}/events")
    fallback_events = [
        event
        for event in events.json()["data"]
        if event["event_type"] == "report_fallback_used"
    ]
    assert len(fallback_events) == (1 if expected_status == "SUCCEEDED" else 0)


async def test_existing_zip_partial_result_recovers_when_local_report_is_ready(
    authenticated_client, monkeypatch, tmp_path
):
    task_id = await create_queued_task(
        authenticated_client, "Existing ZIP fallback", "existing-zip-fallback"
    )
    report_path = tmp_path / f"{task_id}.md"
    report_path.write_text("# Existing fallback report", encoding="utf-8")
    async with SessionLocal() as session:
        task = await session.get(Task, uuid.UUID(task_id))
        task.status = "PARTIAL_SUCCEEDED"
        task.phase = "FINISHED"
        task.progress = 100
        task.error_code = "XIAOYI_PARTIAL_RESULT"
        task.error_message = "报告生成失败：ZIP entry size is too large or invalid"
        session.add(
            Vulnerability(
                org_id=task.org_id,
                plan_id=task.plan_id,
                task_id=task.id,
                asset_key="https://example.test/existing",
                title="Existing confirmed finding",
                severity="high",
                description="Confirmed before report packaging failed.",
                data_json={},
            )
        )
        session.add(
            Report(
                org_id=task.org_id,
                plan_id=task.plan_id,
                task_id=task.id,
                filename=report_path.name,
                format="md",
                local_path=str(report_path),
                status="READY",
            )
        )
        await session.commit()

    monkeypatch.setattr(sync, "get_engine_client", lambda settings: RestartEngine(
        EngineTask("unused", "RUNNING", "INIT", 0, {})
    ))

    await sync.sync_once(get_settings())

    recovered = await authenticated_client.get(f"/api/v1/tasks/{task_id}")
    assert recovered.json()["status"] == "SUCCEEDED"
    assert recovered.json()["error_code"] is None
    assert recovered.json()["error_message"] is None
    events = await authenticated_client.get(f"/api/v1/tasks/{task_id}/events")
    assert events.json()["data"][-1]["event_type"] == "report_fallback_used"


async def test_task_tools_are_normalized(authenticated_client, monkeypatch):
    class ToolEngine:
        async def get_tools(self, external_task_id: str):
            assert external_task_id == "external-with-tools"
            return [{"id": "nmap", "name": "Nmap", "status": "COMPLETED"}]

    plan = await authenticated_client.post(
        "/api/v1/scan-plans",
        json={
            "name": "Tool plan",
            "targets": ["example.test"],
            "asset_list": [{"host": "example.test", "hostType": "domain"}],
        },
    )
    await authenticated_client.post(f"/api/v1/scan-plans/{plan.json()['id']}/confirm")
    task = await authenticated_client.post(
        "/api/v1/tasks",
        json={"plan_id": plan.json()["id"], "request_id": "tool-normalization"},
    )
    async with SessionLocal() as session:
        stored = await session.scalar(select(Task).where(Task.id == uuid.UUID(task.json()["id"])))
        stored.external_task_id = "external-with-tools"
        await session.commit()

    monkeypatch.setattr(main_module, "get_engine_client", lambda settings: ToolEngine())
    response = await authenticated_client.get(f"/api/v1/tasks/{task.json()['id']}/tools")

    assert response.status_code == 200
    assert response.json()["data"] == [
        {"id": "nmap", "name": "Nmap", "status": "COMPLETED"}
    ]

def test_engine_report_url_rejects_unsupported_or_credentialed_urls():
    assert sync.engine_report_url({"reportUrl": "ftp://engine.local/report.pdf"}) is None
    assert sync.engine_report_url({"reportUrl": "http://user:pass@engine.local/report.pdf"}) is None
    assert sync.engine_report_url(
        {"data": {"report": {"url": "https://engine.local/report.pdf"}}}
    ) == "https://engine.local/report.pdf"


def test_report_packaging_error_classifier_does_not_hide_other_failures():
    assert sync.is_report_packaging_error(
        "报告生成失败：ZIP entry size is too large or invalid"
    )
    assert not sync.is_report_packaging_error(
        "ZIP entry size is too large or invalid；Target refused connection"
    )
    assert not sync.is_report_packaging_error("Target refused connection")

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


class RestartEngine:
    def __init__(self, result: EngineTask):
        self.result = result

    async def create_task(self, payload: dict, request_id: str) -> EngineTask:
        return self.result

    async def get_task(
        self, external_task_id: str, current_progress: float = 0
    ) -> EngineTask:
        return self.result

    async def get_children(self, external_task_id: str) -> list[EngineTask]:
        return []

    async def stop_task(self, external_task_id: str) -> None:
        return None


async def create_queued_task(client, name: str, request_id: str) -> str:
    plan = await client.post(
        "/api/v1/scan-plans",
        json={
            "name": name,
            "targets": ["example.test"],
            "authorization_confirmed": True,
        },
    )
    confirmation = await client.post(
        f"/api/v1/scan-plans/{plan.json()['id']}/confirm"
    )
    assert confirmation.status_code == 200
    task = await client.post(
        "/api/v1/tasks",
        json={"plan_id": plan.json()["id"], "request_id": request_id},
    )
    return task.json()["id"]


async def test_fresh_sync_iteration_rediscovers_task_without_regressing_state(
    authenticated_client, monkeypatch
):
    task_id = await create_queued_task(
        authenticated_client, "Restart recovery", "restart-recovery-request"
    )
    before_restart = RestartEngine(
        EngineTask("restart-external", "RUNNING", "SCANNING", 60, {})
    )
    monkeypatch.setattr(sync, "get_engine_client", lambda settings: before_restart)
    await sync.sync_once(get_settings())

    after_restart = RestartEngine(
        EngineTask("restart-external", "QUEUED", "INIT", 20, {})
    )
    monkeypatch.setattr(sync, "get_engine_client", lambda settings: after_restart)
    await sync.sync_once(get_settings())

    recovered = await authenticated_client.get(f"/api/v1/tasks/{task_id}")
    assert recovered.json()["status"] == "RUNNING"
    assert recovered.json()["progress"] == 60


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


async def test_rejected_engine_detail_is_saved_in_task_event(
    authenticated_client, monkeypatch
):
    class RejectedEngine:
        async def create_task(self, payload: dict, request_id: str) -> EngineTask:
            raise AppError(
                400,
                "ENGINE_REJECTED",
                "小易拒绝创建任务请求",
                {"upstream_error": "asset_list 不能为空"},
            )

    task_id = await create_queued_task(
        authenticated_client, "Rejected detail", "rejected-detail-request"
    )
    monkeypatch.setattr(sync, "get_engine_client", lambda settings: RejectedEngine())

    await sync.sync_once(get_settings())

    events = await authenticated_client.get(f"/api/v1/tasks/{task_id}/events")
    assert events.json()["data"][-1]["data_json"] == {
        "code": "ENGINE_REJECTED",
        "upstream_error": "asset_list 不能为空",
    }


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
