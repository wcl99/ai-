import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import select

from app.config import get_settings
from app.demo_data import DemoDataStore
from app.db import SessionLocal
from app.main import app
from app.models import Asset, Report, ScanPlan, Task, User, Vulnerability


def write_demo_files(directory: Path) -> None:
    payload = {
        "查询资产地址": "http://139.198.31.136:81",
        "漏洞数量": 2,
        "漏洞列表": [
            {
                "漏洞ID": 139,
                "漏洞名称": "权限提升",
                "严重等级": "critical",
                "漏洞地址": "http://139.198.31.136:81/api/user",
                "资产地址": "http://139.198.31.136:81",
                "Payload": "display only",
                "请求体": "PATCH /api/user",
                "响应体": "HTTP/1.1 200 OK\nDate: Sun, 09 Aug 2026 21:27:29 GMT",
                "漏洞描述": "越权修改用户权限。",
                "分析过程": "接口缺少对象级授权校验。",
                "修复建议": "服务端校验当前用户权限。",
            },
            {
                "漏洞ID": 141,
                "漏洞名称": "CSP not implemented",
                "严重等级": "low",
                "漏洞地址": "http://139.198.31.136:81/",
                "资产地址": "http://139.198.31.136:81",
                "Payload": "display only",
                "请求体": "",
                "响应体": "",
                "漏洞描述": "缺少 CSP 响应头。",
                "分析过程": "响应头检查。",
                "修复建议": "配置 Content-Security-Policy。",
            },
        ],
    }
    (directory / "vulnerabilities_http_139.198.31.136_81.json").write_text(
        json.dumps(payload, ensure_ascii=False), encoding="utf-8"
    )
    (directory / "http_--139.198.31.136_81渗透测试报告.docx").write_bytes(b"PK demo")


def test_demo_store_maps_linked_records_and_source_fields(tmp_path):
    write_demo_files(tmp_path)

    first = DemoDataStore.load(tmp_path)
    second = DemoDataStore.load(tmp_path)

    assert first.asset["address"] == "http://139.198.31.136:81"
    assert first.task["status"] == "SUCCEEDED"
    assert first.task["phase"] == "FINISHED"
    assert first.task["progress"] == 100
    assert len(first.vulnerabilities) == 2
    assert first.vulnerabilities[0]["plan_id"] == first.task["plan_id"]
    assert first.vulnerabilities[0]["task_id"] == first.task["id"]
    assert first.vulnerabilities[0]["data_json"]["http_request"] == "PATCH /api/user"
    assert first.vulnerabilities[0]["data_json"]["analysis"] == "接口缺少对象级授权校验。"
    assert first.vulnerabilities[0]["data_json"]["evidence_at"] == "2026-08-09T21:27:29+00:00"
    assert first.vulnerabilities[1]["data_json"]["evidence_at"] is None
    assert first.task["created_at"].isoformat() == "2026-08-09T21:27:29+00:00"
    assert first.report["task_id"] == first.task["id"]
    assert first.report["format"] == "docx"
    assert first.task["id"] == second.task["id"]
    assert first.vulnerabilities[0]["id"] == second.vulnerabilities[0]["id"]


def test_demo_store_filters_vulnerabilities(tmp_path):
    write_demo_files(tmp_path)
    store = DemoDataStore.load(tmp_path)

    assert [item["title"] for item in store.filter_vulnerabilities(severity="low")] == [
        "CSP not implemented"
    ]
    assert [item["title"] for item in store.filter_vulnerabilities(keyword="权限")] == [
        "权限提升"
    ]
    assert store.filter_vulnerabilities(asset="https://other.example") == []


def test_demo_store_rejects_report_outside_data_directory(tmp_path):
    write_demo_files(tmp_path)
    outside = tmp_path.parent / "outside.docx"
    outside.write_bytes(b"PK outside")

    with pytest.raises(ValueError, match="inside demo data directory"):
        DemoDataStore.load(tmp_path, report_path=outside)


@pytest.mark.asyncio
async def test_demo_mode_exposes_linked_read_api(authenticated_client, tmp_path):
    write_demo_files(tmp_path)
    settings = get_settings().model_copy(
        update={"demo_data_enabled": True, "demo_data_dir": tmp_path}
    )
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        assets = await authenticated_client.get("/api/v1/assets")
        tasks = await authenticated_client.get("/api/v1/tasks")
        vulnerabilities = await authenticated_client.get(
            "/api/v1/vulnerabilities?severity=critical&keyword=权限"
        )
        reports = await authenticated_client.get("/api/v1/reports")
        dashboard = await authenticated_client.get("/api/v1/dashboard/summary")

        task = tasks.json()["data"]["items"][0]
        vulnerability = vulnerabilities.json()["data"]["items"][0]
        report = reports.json()["data"]["items"][0]
        assert assets.json()["data"]["total"] == 1
        assert tasks.json()["data"]["metrics"]["completed"] == 1
        assert vulnerability["task_id"] == task["id"]
        assert report["task_id"] == task["id"]
        assert dashboard.json()["data"]["metrics"] == {
            "assets": 1,
            "tasks": 1,
            "running_tasks": 0,
            "failed_tasks": 0,
            "high_risk": 1,
            "vulnerabilities": 2,
            "open_vulnerabilities": 2,
            "reports": 1,
        }
        trend_by_date = {
            item["start"]: item for item in dashboard.json()["data"]["risk_trend"]
        }
        # The fixture is intentionally dated outside the current seven-day window;
        # the API must not leak stale demo findings into the active trend.
        assert "2026-08-09" not in trend_by_date

        detail = await authenticated_client.get(
            f"/api/v1/vulnerabilities/{vulnerability['id']}"
        )
        plan_messages = await authenticated_client.get(
            f"/api/v1/scan-plans/{task['plan_id']}/consultation/messages"
        )
        events = await authenticated_client.get(f"/api/v1/tasks/{task['id']}/events")
        qa_messages = await authenticated_client.get(
            f"/api/v1/tasks/{task['id']}/qa/messages"
        )
        download = await authenticated_client.get(
            f"/api/v1/reports/{report['id']}/download"
        )
        assert detail.json()["data_json"]["http_request"] == "PATCH /api/user"
        assert plan_messages.json()["data"] == []
        assert len(events.json()["data"]) == 2
        assert qa_messages.json()["data"] == []
        assert download.status_code == 200
        assert download.content == b"PK demo"
    finally:
        app.dependency_overrides.pop(get_settings, None)


@pytest.mark.asyncio
async def test_demo_mode_keeps_existing_records_visible(
    authenticated_client, tmp_path
):
    write_demo_files(tmp_path)
    historical_at = datetime(2026, 8, 12, 8, 0, tzinfo=UTC)
    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.username == "admin"))
        plan = ScanPlan(
            org_id=user.org_id,
            created_by=user.id,
            name="历史授权任务",
            test_type="standard",
            status="READY",
            targets=["https://legacy.example"],
            created_at=historical_at,
            updated_at=historical_at,
        )
        session.add(plan)
        await session.flush()
        task = Task(
            org_id=user.org_id,
            plan_id=plan.id,
            created_by=user.id,
            request_id="legacy-request-001",
            name="历史任务",
            status="SUCCEEDED",
            phase="FINISHED",
            progress=100,
            created_at=historical_at,
            updated_at=historical_at,
        )
        session.add(task)
        await session.flush()
        session.add(
            Asset(
                org_id=user.org_id,
                plan_id=plan.id,
                asset_key="https://legacy.example",
                asset_type="http",
                address="https://legacy.example",
                service="HTTPS",
                authorized=True,
                data_json={"source": "historical"},
                created_at=historical_at,
                updated_at=historical_at,
            )
        )
        session.add(
            Vulnerability(
                org_id=user.org_id,
                plan_id=plan.id,
                task_id=task.id,
                asset_key="https://legacy.example",
                title="历史高危漏洞",
                severity="high",
                status="OPEN",
                data_json={"source_tool": "historical"},
                created_at=historical_at,
                updated_at=historical_at,
            )
        )
        session.add(
            Report(
                org_id=user.org_id,
                plan_id=plan.id,
                task_id=task.id,
                filename="历史报告.md",
                format="md",
                status="READY",
                local_path=None,
                created_at=historical_at,
                updated_at=historical_at,
            )
        )
        await session.commit()

    settings = get_settings().model_copy(
        update={"demo_data_enabled": True, "demo_data_dir": tmp_path}
    )
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        assets = await authenticated_client.get("/api/v1/assets")
        tasks = await authenticated_client.get("/api/v1/tasks")
        vulnerabilities = await authenticated_client.get("/api/v1/vulnerabilities")
        vulnerability_overview = await authenticated_client.get(
            "/api/v1/vulnerabilities/overview?range=all"
        )
        reports = await authenticated_client.get("/api/v1/reports")
        report_overview = await authenticated_client.get(
            "/api/v1/reports/overview?range=all"
        )
        dashboard = await authenticated_client.get("/api/v1/dashboard/summary")
        filtered_tasks_page_two = await authenticated_client.get(
            "/api/v1/tasks?keyword=历史&page=2&page_size=1"
        )
        filtered_reports_page_two = await authenticated_client.get(
            "/api/v1/reports?keyword=历史&page=2&page_size=1"
        )
        assert assets.json()["data"]["total"] == 2
        assert tasks.json()["data"]["total"] == 2
        assert vulnerabilities.json()["data"]["total"] == 3
        assert reports.json()["data"]["total"] == 2
        assert vulnerability_overview.json()["data"]["metrics"]["total"] == 3
        assert sum(
            point["count"]
            for point in vulnerability_overview.json()["data"]["trend"]
        ) == 2
        assert report_overview.json()["data"]["metrics"]["total"]["value"] == 2
        assert sum(
            point["count"] for point in report_overview.json()["data"]["trend"]
        ) == 2
        assert dashboard.json()["data"]["metrics"] == {
            "assets": 2,
            "tasks": 2,
            "running_tasks": 0,
            "failed_tasks": 0,
            "high_risk": 2,
            "vulnerabilities": 3,
            "open_vulnerabilities": 3,
            "reports": 2,
        }
        assert filtered_tasks_page_two.json()["data"]["items"] == []
        assert filtered_reports_page_two.json()["data"]["items"] == []
        assert any(
            item["address"] == "https://legacy.example"
            for item in assets.json()["data"]["items"]
        )
        assert any(item["name"] == "历史任务" for item in tasks.json()["data"]["items"])
        assert any(
            item["title"] == "历史高危漏洞"
            for item in vulnerabilities.json()["data"]["items"]
        )
        assert any(item["filename"] == "历史报告.md" for item in reports.json()["data"]["items"])
        assert any(
            item["filename"] == "历史报告.md"
            for item in report_overview.json()["data"]["latest_reports"]
        )
    finally:
        app.dependency_overrides.pop(get_settings, None)
