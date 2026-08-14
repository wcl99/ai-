import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.dialects import postgresql
from starlette.websockets import WebSocketDisconnect

import app.main as main_module
from app.auth import create_token, password_hash
from app.config import get_settings
from app.db import SessionLocal
from app.models import Organization, Report, ScanPlan, Task, User, Vulnerability, XiaoyiPlanMapping
from app.schemas import DomainPrecheckRequest, PortPrecheckRequest
from app.services import plan_for_update_query
from app.sync import sync_once
from conftest import captcha_login


async def test_dashboard_summary_contains_risk_trend_and_deterministic_ai_fallback(
    authenticated_client,
):
    response = await authenticated_client.get("/api/v1/dashboard/summary")

    assert response.status_code == 200
    data = response.json()["data"]
    assert {"tasks", "running_tasks", "failed_tasks", "high_risk", "assets", "vulnerabilities"} <= set(
        data["metrics"]
    )
    assert {"warnings", "priority_findings", "remediation", "source"} <= set(
        data["ai_summary"]
    )
    assert data["ai_summary"]["source"] == "fallback"
    assert len(data["risk_trend"]) == 7
    assert {"start", "critical", "high", "medium", "low"} <= set(data["risk_trend"][0])

async def test_liveness_is_independent_and_keeps_compatibility_alias(client):
    live = await client.get("/health/live")
    compatibility = await client.get("/health")

    assert live.status_code == 200
    assert live.json() == {"status": "ok"}
    assert compatibility.json() == live.json()


async def test_overview_analytics_are_complete_scoped_and_time_filtered(
    authenticated_client,
):
    now = datetime.now(UTC)
    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.username == "admin"))
        plan = ScanPlan(
            org_id=user.org_id,
            created_by=user.id,
            name="Overview analytics",
            test_type="standard",
            status="READY",
            snapshot={},
        )
        session.add(plan)
        await session.flush()
        session.add_all(
            [
                Vulnerability(
                    org_id=user.org_id,
                    plan_id=plan.id,
                    title="Critical old finding",
                    severity="critical",
                    status="OPEN",
                    data_json={"source_tool": "nuclei"},
                    created_at=now - timedelta(days=8),
                ),
                Vulnerability(
                    org_id=user.org_id,
                    plan_id=plan.id,
                    title="High recent finding",
                    severity="high",
                    status="OPEN",
                    data_json={"source_tool": "WebRE工具"},
                    created_at=now - timedelta(minutes=5),
                ),
                Vulnerability(
                    org_id=user.org_id,
                    plan_id=plan.id,
                    title="Medium recent finding",
                    severity="medium",
                    status="RETESTING",
                    data_json={},
                    created_at=now - timedelta(days=2),
                ),
                Report(
                    org_id=user.org_id,
                    plan_id=plan.id,
                    filename="standard-current.md",
                    format="md",
                    report_level="standard",
                    local_path="/tmp/standard-current.md",
                    status="READY",
                    first_viewed_at=now - timedelta(minutes=4),
                    first_viewed_by=user.id,
                    first_exported_at=now - timedelta(minutes=3),
                    first_exported_by=user.id,
                    created_at=now - timedelta(minutes=5),
                ),
                Report(
                    org_id=user.org_id,
                    plan_id=plan.id,
                    filename="partial-external.pdf",
                    format="pdf",
                    report_level="partial",
                    external_url="https://xiaoyi.example/report.pdf",
                    status="READY",
                    first_viewed_at=now - timedelta(days=1),
                    first_viewed_by=user.id,
                    created_at=now - timedelta(days=2),
                ),
                Report(
                    org_id=user.org_id,
                    plan_id=plan.id,
                    filename="standard-old.docx",
                    format="docx",
                    report_level="standard",
                    local_path="/tmp/standard-old.docx",
                    status="READY",
                    first_viewed_at=now - timedelta(days=7),
                    first_viewed_by=user.id,
                    first_exported_at=now - timedelta(days=7),
                    first_exported_by=user.id,
                    created_at=now - timedelta(days=8),
                ),
            ]
        )
        other_org = Organization(name="Other overview organization")
        session.add(other_org)
        await session.flush()
        other_user = User(
            org_id=other_org.id,
            username="other-overview-admin",
            name="Other Admin",
            password_hash=password_hash.hash("other-password"),
            role="admin",
        )
        session.add(other_user)
        await session.flush()
        other_plan = ScanPlan(
            org_id=other_org.id,
            created_by=other_user.id,
            name="Other overview plan",
            test_type="standard",
            status="READY",
            snapshot={},
        )
        session.add(other_plan)
        await session.flush()
        session.add(
            Vulnerability(
                org_id=other_org.id,
                plan_id=other_plan.id,
                title="Foreign finding",
                severity="high",
                data_json={"source_tool": "foreign"},
                created_at=now - timedelta(minutes=5),
            )
        )
        await session.commit()

    vulnerabilities = await authenticated_client.get(
        "/api/v1/vulnerabilities/overview?range=7d&timezone=Asia%2FShanghai"
    )
    reports = await authenticated_client.get(
        "/api/v1/reports/overview?range=7d&timezone=Asia%2FShanghai"
    )

    assert vulnerabilities.status_code == 200
    vulnerability_data = vulnerabilities.json()["data"]
    assert vulnerability_data["metrics"] == {
        "total": 3,
        "critical": 1,
        "high": 1,
        "medium": 1,
        "low": 0,
        "unknown": 0,
        "open": 2,
        "retesting": 1,
        "fixed": 0,
    }
    assert sum(item["count"] for item in vulnerability_data["trend"]) == 2
    assert sum(item["count"] for item in vulnerability_data["source_distribution"]) == 3
    assert {item["key"] for item in vulnerability_data["source_distribution"]} == {
        "WebRE工具",
        "nuclei",
        "xiaoyi",
    }
    assert vulnerability_data["granularity"] == "day"

    assert reports.status_code == 200
    report_data = reports.json()["data"]
    assert report_data["metrics"]["total"]["value"] == 3
    assert report_data["metrics"]["monthly_new"]["value"] == 3
    assert report_data["metrics"]["pending_export"]["value"] == 1
    assert report_data["metrics"]["exported"]["value"] == 2
    assert report_data["metrics"]["pending_confirmation"]["value"] == 0
    assert report_data["metrics"]["monthly_delivered"]["value"] == 3
    assert sum(item["count"] for item in report_data["trend"]) == 2
    assert {item["key"]: item["count"] for item in report_data["source_distribution"]} == {
        "code_audit": 0,
        "data_analysis": 0,
        "emergency": 0,
        "other": 0,
        "penetration": 3,
    }
    assert {item["key"]: item["count"] for item in report_data["risk_distribution"]} == {
        "critical": 3,
        "high": 0,
        "low": 0,
        "medium": 0,
        "none": 0,
    }
    assert len(report_data["latest_reports"]) == 3
    assert report_data["latest_reports"][0]["creator_name"] == "Test Admin"
    assert len(report_data["recent_exports"]) == 2
    assert report_data["recent_exports"][0]["exporter_name"] == "Test Admin"
    assert report_data["insights"]


async def test_overview_analytics_support_today_and_timezone_fallback(authenticated_client):
    vulnerabilities = await authenticated_client.get(
        "/api/v1/vulnerabilities/overview?range=today&timezone=invalid%2Fzone"
    )
    reports = await authenticated_client.get(
        "/api/v1/reports/overview?range=today&timezone=invalid%2Fzone"
    )

    for response in (vulnerabilities, reports):
        assert response.status_code == 200
        assert response.json()["data"]["range"] == "today"
        assert response.json()["data"]["timezone"] == "Asia/Shanghai"
        assert response.json()["data"]["granularity"] == "hour"
        assert len(response.json()["data"]["trend"]) >= 1


async def test_report_lifecycle_records_only_the_first_successful_view_and_export(
    authenticated_client, tmp_path
):
    report_path = tmp_path / "lifecycle.md"
    report_path.write_text("# Lifecycle report", encoding="utf-8")
    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.username == "admin"))
        plan = ScanPlan(
            org_id=user.org_id,
            created_by=user.id,
            name="Lifecycle plan",
            test_type="standard",
            status="READY",
            snapshot={},
        )
        session.add(plan)
        await session.flush()
        report = Report(
            org_id=user.org_id,
            plan_id=plan.id,
            filename=report_path.name,
            format="md",
            local_path=str(report_path),
            status="READY",
        )
        session.add(report)
        await session.commit()
        report_id = report.id
        user_id = user.id

    first_preview = await authenticated_client.get(f"/api/v1/reports/{report_id}/content")
    second_preview = await authenticated_client.get(f"/api/v1/reports/{report_id}/content")
    assert first_preview.status_code == second_preview.status_code == 200

    async with SessionLocal() as session:
        viewed = await session.get(Report, report_id)
        first_viewed_at = viewed.first_viewed_at
        assert first_viewed_at is not None
        assert viewed.first_viewed_by == user_id
        assert viewed.first_exported_at is None
        assert viewed.first_exported_by is None

    first_download = await authenticated_client.get(f"/api/v1/reports/{report_id}/download")
    second_download = await authenticated_client.get(f"/api/v1/reports/{report_id}/download")
    assert first_download.status_code == second_download.status_code == 200

    async with SessionLocal() as session:
        exported = await session.get(Report, report_id)
        assert exported.first_viewed_at == first_viewed_at
        assert exported.first_viewed_by == user_id
        assert exported.first_exported_at is not None
        assert exported.first_exported_by == user_id


async def test_report_lifecycle_ignores_failed_preview_and_download(
    authenticated_client, tmp_path
):
    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.username == "admin"))
        plan = ScanPlan(
            org_id=user.org_id,
            created_by=user.id,
            name="Failed lifecycle plan",
            test_type="standard",
            status="READY",
            snapshot={},
        )
        session.add(plan)
        await session.flush()
        missing = Report(
            org_id=user.org_id,
            plan_id=plan.id,
            filename="missing.md",
            format="md",
            local_path=str(tmp_path / "missing.md"),
            status="READY",
        )
        unsupported_path = tmp_path / "unsupported.pdf"
        unsupported_path.write_bytes(b"pdf")
        unsupported = Report(
            org_id=user.org_id,
            plan_id=plan.id,
            filename=unsupported_path.name,
            format="pdf",
            local_path=str(unsupported_path),
            status="READY",
        )
        session.add_all([missing, unsupported])
        await session.commit()
        missing_id = missing.id
        unsupported_id = unsupported.id

    assert (
        await authenticated_client.get(f"/api/v1/reports/{missing_id}/download")
    ).status_code == 404
    assert (
        await authenticated_client.get(f"/api/v1/reports/{unsupported_id}/content")
    ).status_code == 415

    async with SessionLocal() as session:
        for report_id in (missing_id, unsupported_id):
            report = await session.get(Report, report_id)
            assert report.first_viewed_at is None
            assert report.first_viewed_by is None
            assert report.first_exported_at is None
            assert report.first_exported_by is None


def test_confirmation_query_locks_the_plan_row():
    statement = plan_for_update_query(uuid.uuid4(), uuid.uuid4())

    sql = str(statement.compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE" in sql


async def test_readiness_checks_the_database(client):
    response = await client.get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


async def test_digital_human_login_accepts_numeric_org_and_returns_document_fields(
    client,
):
    response = await client.post(
        "/api/auth/login",
        json={
            "username": "admin",
            "password": "correct-horse-battery-staple",
            "org_id": 1,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["username"] == "admin"
    assert body["org"] == {"id": 1, "name": "Test Organization"}
    assert body["role"] == "admin"
    assert body["is_sys_admin"] is True


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


def test_precheck_payload_models_reject_nested_or_oversized_values():
    with pytest.raises(ValidationError):
        PortPrecheckRequest.model_validate(
            {
                "action": "can_port",
                "hosts": [{"host": "example.test", "authorization": "secret"}],
            }
        )
    with pytest.raises(ValidationError):
        DomainPrecheckRequest.model_validate(
            {"action": "can_subdomain", "domains": ["x" * 254]}
        )


async def test_auditor_cannot_open_precheck_websocket(monkeypatch):
    class FakeWebSocket:
        closed_with = None

        async def accept(self):
            return None

        async def close(self, code):
            self.closed_with = code

    async def auditor(*_):
        return SimpleNamespace(role="auditor")

    socket = FakeWebSocket()
    monkeypatch.setattr(main_module, "websocket_user", auditor)

    await main_module.precheck_socket(socket)

    assert socket.closed_with == 4403


async def test_precheck_websocket_returns_protocol_and_engine_errors(monkeypatch):
    class FailingEngine:
        async def precheck(self, message):
            raise main_module.AppError(502, "ENGINE_UNAVAILABLE", "Engine unavailable")

    class FakeWebSocket:
        def __init__(self):
            self.messages = [
                [],
                {"action": "can_subdomain", "domains": ["example.test"]},
            ]
            self.sent = []

        async def accept(self):
            return None

        async def receive_json(self):
            if self.messages:
                return self.messages.pop(0)
            raise main_module.WebSocketDisconnect

        async def send_json(self, message):
            self.sent.append(message)

    async def admin(*_):
        return SimpleNamespace(role="admin")

    socket = FakeWebSocket()
    monkeypatch.setattr(main_module, "websocket_user", admin)
    monkeypatch.setattr(main_module, "get_engine_client", lambda settings: FailingEngine())

    await main_module.precheck_socket(socket)

    assert socket.sent == [
        {
            "action": "can_error",
            "success": False,
            "message": "Invalid precheck payload",
        },
        {
            "action": "can_error",
            "success": False,
            "message": "Engine unavailable",
        },
    ]


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
    confirmation = await authenticated_client.post(
        f"/api/v1/scan-plans/{plan_id}/confirm"
    )
    assert confirmation.status_code == 200

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


async def test_plan_confirmation_is_audited_and_task_creation_is_idempotent(
    authenticated_client,
):
    plan = await authenticated_client.post(
        "/api/v1/scan-plans",
        json={"name": "Audited authorization", "targets": ["example.test"]},
    )
    plan_id = plan.json()["id"]

    confirmation = await authenticated_client.post(
        f"/api/v1/scan-plans/{plan_id}/confirm"
    )
    assert confirmation.status_code == 200
    audits = await authenticated_client.get(
        "/api/v1/audit-logs?action=plan.confirm"
    )
    assert audits.status_code == 200
    assert audits.json()["data"]["total"] == 1
    assert audits.json()["data"]["items"][0]["resource_id"] == plan_id

    payload = {"plan_id": plan_id, "request_id": "stable-task-submission"}
    first = await authenticated_client.post("/api/v1/tasks", json=payload)
    repeated = await authenticated_client.post("/api/v1/tasks", json=payload)

    assert first.status_code == 201
    assert repeated.status_code == 201
    assert repeated.json()["id"] == first.json()["id"]
    listed = await authenticated_client.get("/api/v1/tasks")
    assert listed.json()["data"]["total"] == 1
    task_audits = await authenticated_client.get(
        "/api/v1/audit-logs?action=task.create"
    )
    assert task_audits.json()["data"]["total"] == 1


async def test_draft_asset_list_can_update_before_confirmation(authenticated_client):
    plan = await authenticated_client.post(
        "/api/v1/scan-plans",
        json={"name": "Draft assets", "targets": ["example.test"]},
    )

    updated = await authenticated_client.patch(
        f"/api/v1/scan-plans/{plan.json()['id']}/assets",
        json={
            "asset_list": [
                {
                    "host": "WWW.Example.Test",
                    "hostType": "domain",
                    "ports": [443],
                    "whitebox_context": "test account and repository context",
                },
                {
                    "host": "www.example.test",
                    "hostType": "domain",
                    "ports": [443],
                    "whitebox_context": "test account and repository context",
                },
            ]
        },
    )

    assert updated.status_code == 200, updated.text
    assert updated.json()["asset_list"] == [
        {
            "host": "www.example.test",
            "hostType": "domain",
            "ports": [443],
            "whitebox_context": "test account and repository context",
        }
    ]
    assert updated.json()["snapshot"]["asset_list"] == updated.json()["asset_list"]


async def test_http_asset_uses_hostname_for_cdn_check_and_preserves_url(
    authenticated_client, monkeypatch
):
    target = "http://139.198.31.136:81/#/login"
    checked_targets = []
    settings = get_settings().model_copy(update={"cdninfo_enabled": True})

    async def fake_assess_targets(targets, _settings):
        checked_targets.extend(targets)
        return [
            {
                "host": targets[0],
                "hostType": "ip",
                "cdn_status": "SAFE",
                "cdn_provider": None,
            }
        ]

    monkeypatch.setattr(main_module, "get_settings", lambda: settings)
    monkeypatch.setattr(main_module, "assess_targets", fake_assess_targets)
    plan = await authenticated_client.post(
        "/api/v1/scan-plans",
        json={"name": "HTTP asset", "targets": [target]},
    )

    updated = await authenticated_client.patch(
        f"/api/v1/scan-plans/{plan.json()['id']}/assets",
        json={"asset_list": [{"host": target, "hostType": "http"}]},
    )

    assert updated.status_code == 200, updated.text
    assert checked_targets == ["139.198.31.136"]
    assert updated.json()["asset_list"] == [
        {
            "host": target,
            "hostType": "http",
            "cdn_status": "SAFE",
            "cdn_provider": None,
        }
    ]


async def test_confirmed_plan_asset_list_is_frozen(authenticated_client):
    plan = await authenticated_client.post(
        "/api/v1/scan-plans",
        json={"name": "Frozen assets", "targets": ["example.test"]},
    )
    saved = await authenticated_client.patch(
        f"/api/v1/scan-plans/{plan.json()['id']}/assets",
        json={"asset_list": [{"host": "example.test", "hostType": "domain"}]},
    )
    assert saved.status_code == 200
    confirmed = await authenticated_client.post(
        f"/api/v1/scan-plans/{plan.json()['id']}/confirm"
    )

    rejected = await authenticated_client.patch(
        f"/api/v1/scan-plans/{plan.json()['id']}/assets",
        json={"asset_list": [{"host": "other.test", "hostType": "domain"}]},
    )

    assert confirmed.json()["status"] == "READY"
    assert confirmed.json()["snapshot"]["asset_list"] == [
        {"host": "example.test", "hostType": "domain"}
    ]
    assert rejected.status_code == 409
    assert rejected.json()["code"] == "PLAN_NOT_DRAFT"


async def test_confirmation_freezes_xiaoyi_context(authenticated_client):
    plan = await authenticated_client.post(
        "/api/v1/scan-plans",
        json={
            "name": "Xiaoyi frozen context",
            "test_type": "standard",
            "targets": ["example.test"],
        },
    )

    confirmed = await authenticated_client.post(
        f"/api/v1/scan-plans/{plan.json()['id']}/confirm"
    )

    context = confirmed.json()["snapshot"]["xiaoyi_context"]
    assert "org_id" not in context
    assert context["user_id"] == "admin"
    assert isinstance(context["plan_id"], int)
    assert context["plan_id"] > 0
    assert context["scan_mode"] == "standard"
    assert context["scan_speed"] == "standard"
    assert context["download_intermediate_results"] is True


async def test_confirmation_preserves_explicit_deep_pentest_speed(authenticated_client):
    plan = await authenticated_client.post(
        "/api/v1/scan-plans",
        json={
            "name": "Deep controlled validation",
            "test_type": "standard",
            "scan_speed": "deep",
            "targets": ["example.test"],
        },
    )

    confirmed = await authenticated_client.post(
        f"/api/v1/scan-plans/{plan.json()['id']}/confirm"
    )

    assert confirmed.json()["snapshot"]["xiaoyi_context"]["scan_speed"] == "deep"


@pytest.mark.parametrize(
    "scan_mode",
    [
        "standard",
        "two_high_one_weak",
        "mlps_2_0",
    ],
)
async def test_confirmation_preserves_pentest_scenario(authenticated_client, scan_mode):
    plan = await authenticated_client.post(
        "/api/v1/scan-plans",
        json={
            "name": f"Scenario {scan_mode}",
            "test_type": "standard",
            "scan_mode": scan_mode,
            "targets": ["example.test"],
        },
    )

    confirmed = await authenticated_client.post(
        f"/api/v1/scan-plans/{plan.json()['id']}/confirm"
    )

    assert confirmed.json()["snapshot"]["scan_mode"] == scan_mode
    assert confirmed.json()["snapshot"]["xiaoyi_context"]["scan_mode"] == scan_mode


async def test_reconfirmation_keeps_the_original_xiaoyi_actor(authenticated_client):
    plan = await authenticated_client.post(
        "/api/v1/scan-plans",
        json={"name": "Immutable confirmation", "targets": ["example.test"]},
    )
    first = await authenticated_client.post(
        f"/api/v1/scan-plans/{plan.json()['id']}/confirm"
    )
    created = await authenticated_client.post(
        "/api/v1/users",
        json={
            "username": "second-expert",
            "name": "Second Expert",
            "password": "second-expert-password",
            "role": "security_expert",
        },
    )
    assert created.status_code == 201
    login = await captcha_login(
        authenticated_client, "second-expert", "second-expert-password"
    )
    second = await authenticated_client.post(
        f"/api/v1/scan-plans/{plan.json()['id']}/confirm",
        headers={"Authorization": f"Bearer {login.json()['token']}"},
    )

    assert second.status_code == 200
    assert second.json()["snapshot"] == first.json()["snapshot"]
    assert second.json()["snapshot"]["xiaoyi_context"]["user_id"] == "admin"


async def test_confirmed_plans_use_distinct_persisted_xiaoyi_plan_ids(
    authenticated_client,
):
    confirmed = []
    for name in ["First mapped plan", "Second mapped plan"]:
        plan = await authenticated_client.post(
            "/api/v1/scan-plans",
            json={"name": name, "targets": ["example.test"]},
        )
        response = await authenticated_client.post(
            f"/api/v1/scan-plans/{plan.json()['id']}/confirm"
        )
        confirmed.append((plan.json()["id"], response.json()))

    async with SessionLocal() as session:
        mappings = {
            str(item.plan_id): item.id
            for item in await session.scalars(select(XiaoyiPlanMapping))
        }

    first_id = confirmed[0][1]["snapshot"]["xiaoyi_context"]["plan_id"]
    second_id = confirmed[1][1]["snapshot"]["xiaoyi_context"]["plan_id"]
    assert first_id == mappings[confirmed[0][0]]
    assert second_id == mappings[confirmed[1][0]]
    assert first_id != second_id


async def test_task_creation_freezes_direct_target_asset_list(authenticated_client):
    plan = await authenticated_client.post(
        "/api/v1/scan-plans",
        json={"name": "Direct target", "targets": ["Example.Test"]},
    )
    await authenticated_client.post(f"/api/v1/scan-plans/{plan.json()['id']}/confirm")

    task = await authenticated_client.post(
        "/api/v1/tasks",
        json={"plan_id": plan.json()["id"], "request_id": "direct-target-assets"},
    )
    frozen = await authenticated_client.get(f"/api/v1/scan-plans/{plan.json()['id']}")

    assert task.status_code == 201
    assert frozen.json()["snapshot"]["asset_list"] == [
        {"host": "example.test", "hostType": "domain"}
    ]


async def test_precheck_socket_reuses_one_upstream_session(monkeypatch):
    sent_messages = []
    accepted = []

    class FakeSession:
        entered = 0
        exited = 0

        async def __aenter__(self):
            FakeSession.entered += 1
            return self

        async def __aexit__(self, *_):
            FakeSession.exited += 1

        async def send(self, message):
            sent_messages.append(message)
            if message["action"] == "can_subdomain":
                return {
                    "action": "can_subdomain_result",
                    "success": True,
                    "hasResult": True,
                    "domains": [{"domain": "www.example.test", "type": "subdomain"}],
                    "subdomainCount": 1,
                }
            return {
                "action": "can_port_result",
                "success": True,
                "hasResult": True,
                "hosts": [{"host": "example.test", "hostType": "domain", "ports": [443]}],
                "portCount": 1,
            }

    class FakeClient:
        def precheck_session(self):
            return FakeSession()

        async def precheck(self, message):
            raise AssertionError("precheck_socket should use the reusable session")

    class FakeWebSocket:
        def __init__(self):
            self.messages = [
                {"action": "can_subdomain", "domains": ["example.test"]},
                {
                    "action": "can_port",
                    "hosts": [{"host": "example.test", "hostType": "domain"}],
                },
            ]
            self.sent = []

        async def accept(self):
            accepted.append(True)

        async def close(self, code=1000):
            self.close_code = code

        async def receive_json(self):
            if not self.messages:
                raise WebSocketDisconnect()
            return self.messages.pop(0)

        async def send_json(self, message):
            self.sent.append(message)

    async def fake_websocket_user(websocket, settings):
        return SimpleNamespace(role="admin")

    monkeypatch.setattr(main_module, "websocket_user", fake_websocket_user)
    monkeypatch.setattr(main_module, "get_engine_client", lambda settings: FakeClient())
    websocket = FakeWebSocket()

    await main_module.precheck_socket(websocket)

    assert accepted == [True]
    assert FakeSession.entered == 1
    assert FakeSession.exited == 1
    assert sent_messages == [
        {"action": "can_subdomain", "domains": ["example.test"]},
        {
            "action": "can_port",
            "hosts": [{"host": "example.test", "hostType": "domain"}],
        },
    ]
    assert [message["action"] for message in websocket.sent] == [
        "can_subdomain_result",
        "can_port_result",
    ]

async def test_request_id_cannot_be_reused_for_another_plan(authenticated_client):
    plans = []
    for name in ("First idempotent plan", "Second idempotent plan"):
        plan = await authenticated_client.post(
            "/api/v1/scan-plans",
            json={"name": name, "targets": ["example.test"]},
        )
        await authenticated_client.post(
            f"/api/v1/scan-plans/{plan.json()['id']}/confirm"
        )
        plans.append(plan.json()["id"])

    first = await authenticated_client.post(
        "/api/v1/tasks",
        json={"plan_id": plans[0], "request_id": "plan-bound-request"},
    )
    conflict = await authenticated_client.post(
        "/api/v1/tasks",
        json={"plan_id": plans[1], "request_id": "plan-bound-request"},
    )

    assert first.status_code == 201
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "IDEMPOTENCY_CONFLICT"


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


async def test_operator_cannot_bypass_separate_plan_authorization(authenticated_client):
    created = await authenticated_client.post(
        "/api/v1/users",
        json={
            "username": "operator",
            "name": "Test Operator",
            "password": "operator-password-is-long-enough",
            "role": "operator",
        },
    )
    assert created.status_code == 201
    login = await captcha_login(
        authenticated_client, "operator", "operator-password-is-long-enough"
    )
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['token']}"}

    plan = await authenticated_client.post(
        "/api/v1/scan-plans",
        headers=headers,
        json={
            "name": "Untrusted inline authorization",
            "targets": ["example.test"],
            "authorization_confirmed": True,
        },
    )

    assert plan.status_code == 201
    assert plan.json()["status"] == "DRAFT"
    assert plan.json()["snapshot"]["authorization_confirmed"] is False

    task = await authenticated_client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"plan_id": plan.json()["id"], "request_id": "operator-bypass-attempt"},
    )
    assert task.status_code == 409
    assert task.json()["code"] == "PLAN_NOT_READY"

    confirmation = await authenticated_client.post(
        f"/api/v1/scan-plans/{plan.json()['id']}/confirm",
        headers=headers,
    )
    assert confirmation.status_code == 403


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
    confirmation = await authenticated_client.post(
        f"/api/v1/scan-plans/{plan.json()['id']}/confirm"
    )
    assert confirmation.status_code == 200
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


async def test_task_list_metrics_are_global_when_rows_are_filtered(
    authenticated_client,
):
    plan = await authenticated_client.post(
        "/api/v1/scan-plans",
        json={
            "name": "Task metric scope",
            "test_type": "standard",
            "targets": ["metrics.example.test"],
            "authorization_confirmed": True,
        },
    )
    await authenticated_client.post(f"/api/v1/scan-plans/{plan.json()['id']}/confirm")
    first = await authenticated_client.post(
        "/api/v1/tasks",
        json={"plan_id": plan.json()["id"], "request_id": "metric-running-task"},
    )
    second = await authenticated_client.post(
        "/api/v1/tasks",
        json={"plan_id": plan.json()["id"], "request_id": "metric-failed-task"},
    )
    async with SessionLocal() as session:
        running = await session.get(Task, uuid.UUID(first.json()["id"]))
        failed = await session.get(Task, uuid.UUID(second.json()["id"]))
        running.status = "RUNNING"
        failed.status = "FAILED"
        await session.commit()

    response = await authenticated_client.get("/api/v1/tasks?status=RUNNING")

    assert response.status_code == 200
    data = response.json()["data"]
    assert {item["id"] for item in data["items"]} == {first.json()["id"]}
    assert data["metrics"] == {
        "total": 2,
        "queued": 0,
        "running": 1,
        "completed": 0,
        "failed": 1,
        "cancelled": 0,
    }


async def test_only_terminal_tasks_can_be_deleted(authenticated_client):
    plan = await authenticated_client.post(
        "/api/v1/scan-plans",
        json={"name": "Delete task", "targets": ["delete.example.test"]},
    )
    await authenticated_client.post(f"/api/v1/scan-plans/{plan.json()['id']}/confirm")
    task = await authenticated_client.post(
        "/api/v1/tasks",
        json={"plan_id": plan.json()["id"], "request_id": "delete-terminal-task"},
    )
    task_id = task.json()["id"]

    active = await authenticated_client.delete(f"/api/v1/tasks/{task_id}")
    assert active.status_code == 409
    assert active.json()["code"] == "TASK_NOT_DELETABLE"

    async with SessionLocal() as session:
        stored = await session.get(Task, uuid.UUID(task_id))
        stored.status = "SUCCEEDED"
        await session.commit()

    deleted = await authenticated_client.delete(f"/api/v1/tasks/{task_id}")
    assert deleted.status_code == 200
    assert deleted.json()["data"] is None
    assert (await authenticated_client.get(f"/api/v1/tasks/{task_id}")).status_code == 404


async def test_task_list_supports_combined_center_filters(authenticated_client):
    plan = await authenticated_client.post(
        "/api/v1/scan-plans",
        json={
            "name": "Filtered task plan",
            "test_type": "standard",
            "targets": ["filtered.example.test"],
            "authorization_confirmed": True,
        },
    )
    await authenticated_client.post(f"/api/v1/scan-plans/{plan.json()['id']}/confirm")
    created = await authenticated_client.post(
        "/api/v1/tasks",
        json={"plan_id": plan.json()["id"], "request_id": "center-filter-request"},
    )

    response = await authenticated_client.get(
        "/api/v1/tasks?keyword=Filtered&test_type=standard&creator=Test%20Admin"
        "&created_from=2020-01-01T00:00:00Z&created_to=2099-01-01T00:00:00Z"
    )

    assert response.status_code == 200
    assert [item["id"] for item in response.json()["data"]["items"]] == [created.json()["id"]]


async def test_vulnerability_can_be_deleted_within_the_current_organization(
    authenticated_client,
):
    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.username == "admin"))
        plan = ScanPlan(
            org_id=user.org_id,
            created_by=user.id,
            name="Delete vulnerability",
            test_type="standard",
            status="READY",
            snapshot={},
        )
        session.add(plan)
        await session.flush()
        vulnerability = Vulnerability(
            org_id=user.org_id,
            plan_id=plan.id,
            title="Disposable vulnerability",
            severity="high",
            status="OPEN",
            data_json={},
        )
        session.add(vulnerability)
        await session.commit()
        vulnerability_id = vulnerability.id

    deleted = await authenticated_client.delete(
        f"/api/v1/vulnerabilities/{vulnerability_id}"
    )

    assert deleted.status_code == 200
    assert deleted.json()["data"] is None
    assert (
        await authenticated_client.get(f"/api/v1/vulnerabilities/{vulnerability_id}")
    ).status_code == 404


async def test_task_qa_messages_are_scoped_and_persisted(authenticated_client, monkeypatch):
    async def fake_task_expert(*_args, **_kwargs):
        return "The task has not returned findings yet."

    monkeypatch.setattr(main_module, "run_task_expert_agent", fake_task_expert)
    plan = await authenticated_client.post(
        "/api/v1/scan-plans",
        json={
            "name": "QA context",
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
        json={"plan_id": plan.json()["id"], "request_id": "qa-message-test"},
    )
    task_id = task.json()["id"]

    created = await authenticated_client.post(
        f"/api/v1/tasks/{task_id}/qa/messages",
        json={"content": "  What was discovered?  "},
    )
    assert created.status_code == 201
    assert created.json()["user_message"]["role"] == "user"
    assert created.json()["user_message"]["content"] == "What was discovered?"
    assert created.json()["assistant_message"]["role"] == "assistant"

    listed = await authenticated_client.get(f"/api/v1/tasks/{task_id}/qa/messages")
    assert listed.status_code == 200
    assert [item["content"] for item in listed.json()["data"]] == [
        "What was discovered?",
        "The task has not returned findings yet.",
    ]

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
async def test_login_requires_a_valid_captcha(client):
    challenge = await client.get("/api/v1/auth/captcha")
    assert challenge.status_code == 200
    assert challenge.json()["data"]["question"].endswith("=?")

    rejected = await client.post(
        "/api/v1/auth/login",
        json={
            "username": "admin",
            "password": "correct-horse-battery-staple",
            "captcha_token": challenge.json()["data"]["token"],
            "captcha_answer": "999",
        },
    )
    accepted = await captcha_login(client, "admin", "correct-horse-battery-staple")

    assert rejected.status_code == 400
    assert rejected.json()["code"] == "CAPTCHA_INVALID"
    assert accepted.status_code == 200
