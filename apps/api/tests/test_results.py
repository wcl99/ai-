import uuid

from sqlalchemy import select

from app.config import get_settings
from app.auth import password_hash
from app.db import SessionLocal
from app.main import app
from app.models import (
    Organization,
    Report,
    ScanPlan,
    Task,
    User,
    Vulnerability,
    XiaoyiPlanMapping,
)


async def create_task(client, name: str, request_id: str) -> tuple[str, str]:
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
    return plan.json()["id"], task.json()["id"]


async def test_xiaoyi_result_ids_map_to_platform_plan_and_task(authenticated_client):
    plan_id, task_id = await create_task(
        authenticated_client, "Xiaoyi callback mapping", "xiaoyi-callback-mapping"
    )
    async with SessionLocal() as session:
        mapping = await session.scalar(
            select(XiaoyiPlanMapping).where(
                XiaoyiPlanMapping.plan_id == uuid.UUID(plan_id)
            )
        )
        task = await session.get(Task, uuid.UUID(task_id))
        task.external_task_id = "xiaoyi-result-task-1"
        await session.commit()

    uploaded = await authenticated_client.post(
        "/api/ai/upload-vulnerability",
        json={
            "plan_id": mapping.id,
            "task_id": "xiaoyi-result-task-1",
            "severity": "high",
            "data": {"title": "Mapped Xiaoyi finding"},
        },
    )

    assert uploaded.status_code == 200
    assert uploaded.json()["data"]["plan_id"] == mapping.id
    assert uploaded.json()["data"]["org_id"]
    vulnerability = await authenticated_client.get(
        f"/api/v1/vulnerabilities/{uploaded.json()['data']['vulnerability_id']}"
    )
    assert vulnerability.json()["plan_id"] == plan_id
    assert vulnerability.json()["task_id"] == task_id


async def test_duplicate_xiaoyi_callback_returns_the_original_result(
    authenticated_client,
):
    plan_id, task_id = await create_task(
        authenticated_client, "Idempotent callback", "idempotent-callback"
    )
    payload = {
        "plan_id": plan_id,
        "task_id": task_id,
        "severity": "high",
        "asset_key": "example.test:443",
        "data": {"title": "One callback finding", "http_url": "https://example.test"},
    }

    first = await authenticated_client.post(
        "/api/ai/upload-vulnerability", json=payload
    )
    second = await authenticated_client.post(
        "/api/ai/upload-vulnerability", json=payload
    )

    assert first.status_code == second.status_code == 200
    assert first.json()["data"]["vulnerability_id"] == second.json()["data"][
        "vulnerability_id"
    ]
    listed = await authenticated_client.get(
        f"/api/v1/vulnerabilities?task_id={task_id}"
    )
    assert listed.json()["data"]["total"] == 1


async def xiaoyi_result_identity(plan_id: str, task_id: str) -> tuple[int, str]:
    async with SessionLocal() as session:
        mapping = await session.scalar(
            select(XiaoyiPlanMapping).where(
                XiaoyiPlanMapping.plan_id == uuid.UUID(plan_id)
            )
        )
        task = await session.get(Task, uuid.UUID(task_id))
        external_task_id = f"xiaoyi-{task_id}"
        task.external_task_id = external_task_id
        await session.commit()
        return mapping.id, external_task_id


async def test_xiaoyi_asset_callback_accepts_documented_ip_and_port(
    authenticated_client,
):
    plan_id, task_id = await create_task(
        authenticated_client, "Asset callback", "asset-callback"
    )
    external_plan_id, external_task_id = await xiaoyi_result_identity(
        plan_id, task_id
    )

    response = await authenticated_client.post(
        "/api/ai/upload-asset",
        json={
            "plan_id": external_plan_id,
            "task_id": external_task_id,
            "asset": {
                "ip": "192.0.2.10",
                "port": 443,
                "service": "https",
                "status": "open",
            },
        },
    )

    assert response.status_code == 200
    assert response.json()["data"]["plan_id"] == external_plan_id
    assert response.json()["data"]["org_id"]
    assets = await authenticated_client.get("/api/v1/assets")
    assert assets.json()["data"]["items"][0]["asset_key"] == "192.0.2.10:443"


async def test_xiaoyi_report_callback_maps_external_task_and_is_idempotent(
    authenticated_client,
):
    plan_id, task_id = await create_task(
        authenticated_client, "Report callback", "report-callback"
    )
    external_plan_id, external_task_id = await xiaoyi_result_identity(
        plan_id, task_id
    )
    payload = {
        "plan_id": external_plan_id,
        "task_id": external_task_id,
        "filename": "xiaoyi-report.md",
        "external_url": "https://reports.example.test/xiaoyi-report.md",
    }

    first = await authenticated_client.post("/api/ai/upload-report", json=payload)
    second = await authenticated_client.post("/api/ai/upload-report", json=payload)

    assert first.status_code == second.status_code == 200
    assert first.json()["data"]["plan_id"] == external_plan_id
    assert first.json()["data"]["org_id"]
    assert first.json()["data"]["report_id"] == second.json()["data"]["report_id"]
    reports = await authenticated_client.get(f"/api/v1/reports?task_id={task_id}")
    assert reports.json()["data"]["total"] == 1


async def test_report_callback_accepts_documented_url_in_filename(
    authenticated_client,
):
    plan_id, task_id = await create_task(
        authenticated_client, "URL report callback", "url-report-callback"
    )
    external_plan_id, external_task_id = await xiaoyi_result_identity(
        plan_id, task_id
    )
    report_url = "https://reports.example.test/final-report.docx"

    uploaded = await authenticated_client.post(
        "/api/ai/upload-report",
        json={
            "plan_id": external_plan_id,
            "task_id": external_task_id,
            "filename": report_url,
        },
    )

    assert uploaded.status_code == 200
    report = await authenticated_client.get(
        f"/api/v1/reports/{uploaded.json()['data']['report_id']}"
    )
    assert report.json()["external_url"] == report_url
    assert report.json()["filename"] == "final-report.docx"


async def test_xiaoyi_callback_rejects_mismatched_platform_org(
    authenticated_client,
):
    plan_id, task_id = await create_task(
        authenticated_client, "Org callback", "org-callback"
    )
    external_plan_id, external_task_id = await xiaoyi_result_identity(
        plan_id, task_id
    )

    response = await authenticated_client.post(
        "/api/ai/upload-log",
        json={
            "plan_id": external_plan_id,
            "task_id": external_task_id,
            "org_id": str(uuid.uuid4()),
            "content": "organization validation",
        },
    )

    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"


async def test_xiaoyi_log_callback_maps_external_task_and_is_idempotent(
    authenticated_client,
):
    plan_id, task_id = await create_task(
        authenticated_client, "Log callback", "log-callback"
    )
    external_plan_id, external_task_id = await xiaoyi_result_identity(
        plan_id, task_id
    )
    payload = {
        "plan_id": external_plan_id,
        "task_id": external_task_id,
        "level": "warning",
        "type": "agent_activity",
        "agent_type": "xiaoyi",
        "action": "validate_finding",
        "content": "正在验证高风险漏洞",
    }

    first = await authenticated_client.post("/api/ai/upload-log", json=payload)
    second = await authenticated_client.post("/api/ai/upload-log", json=payload)

    assert first.status_code == second.status_code == 200
    assert first.json()["data"]["plan_id"] == external_plan_id
    assert first.json()["data"]["org_id"]
    assert first.json()["data"]["log_id"] == second.json()["data"]["log_id"]
    logs = await authenticated_client.get(f"/api/v1/ai-logs?plan_id={plan_id}")
    assert logs.json()["data"]["total"] == 1


async def test_key_xiaoyi_logs_become_task_events_but_debug_noise_does_not(
    authenticated_client,
):
    plan_id, task_id = await create_task(
        authenticated_client, "Callback event", "callback-event"
    )
    external_plan_id, external_task_id = await xiaoyi_result_identity(
        plan_id, task_id
    )
    for level, content in (
        ("debug", "工具内部调试细节"),
        ("warning", "发现疑似高风险漏洞，正在验证"),
        ("error", "API Fuzz 执行失败：目标拒绝连接"),
    ):
        response = await authenticated_client.post(
            "/api/ai/upload-log",
            json={
                "plan_id": external_plan_id,
                "task_id": external_task_id,
                "level": level,
                "type": "agent_activity",
                "agent_type": "xiaoyi",
                "content": content,
            },
        )
        assert response.status_code == 200

    events = await authenticated_client.get(f"/api/v1/tasks/{task_id}/events")
    callback_events = [
        item for item in events.json()["data"] if item["event_type"].startswith("xiaoyi_")
    ]
    assert [(item["event_type"], item["message"]) for item in callback_events] == [
        ("xiaoyi_warning", "发现疑似高风险漏洞，正在验证"),
        ("xiaoyi_error", "API Fuzz 执行失败：目标拒绝连接"),
    ]


async def test_digital_results_must_match_task_plan(authenticated_client):
    first_plan, first_task = await create_task(
        authenticated_client, "First result plan", "result-plan-first"
    )
    second_plan, _ = await create_task(
        authenticated_client, "Second result plan", "result-plan-second"
    )

    mismatch = await authenticated_client.post(
        "/api/ai/upload-vulnerability",
        json={
            "plan_id": second_plan,
            "task_id": first_task,
            "data": {"title": "Wrong owner"},
        },
    )
    assert mismatch.status_code == 422
    assert mismatch.json()["code"] == "TASK_PLAN_MISMATCH"

    uploaded = await authenticated_client.post(
        "/api/ai/upload-vulnerability",
        json={
            "plan_id": first_plan,
            "task_id": first_task,
            "severity": "high",
            "data": {"title": "Validated finding"},
        },
    )
    vulnerability = await authenticated_client.get(
        f"/api/v1/vulnerabilities/{uploaded.json()['data']['vulnerability_id']}"
    )
    assert vulnerability.json()["task_id"] == first_task


async def test_vulnerability_list_contract_has_page_and_safe_task_summary(
    authenticated_client,
):
    plan_id, task_id = await create_task(
        authenticated_client, "Vulnerability list", "vulnerability-list-contract"
    )
    await authenticated_client.post(
        "/api/ai/upload-vulnerability",
        json={
            "plan_id": plan_id,
            "task_id": task_id,
            "data": {
                "title": "List finding",
                "tags": ["remote", 7, "validated"],
                "password": "finding-secret",
                "nested": {"access_token": "nested-secret"},
            },
        },
    )

    response = await authenticated_client.get(
        "/api/v1/vulnerabilities?page=1&page_size=1"
    )

    assert response.status_code == 200
    page = response.json()["data"]
    assert page["total"] == 1
    assert page["page"] == 1
    assert page["page_size"] == 1
    assert page["items"][0]["task_name"] == "Vulnerability list"
    assert page["items"][0]["tags"] == ["remote", "validated"]
    assert "raw_external" not in response.text
    assert "finding-secret" not in response.text
    assert "nested-secret" not in response.text
    assert "data_json" not in page["items"][0]


async def test_vulnerability_list_filters_by_task_and_plan(authenticated_client):
    first_plan, first_task = await create_task(
        authenticated_client, "First filtered task", "first-filtered-result"
    )
    second_plan, second_task = await create_task(
        authenticated_client, "Second filtered task", "second-filtered-result"
    )
    for plan_id, task_id, title in (
        (first_plan, first_task, "First task finding"),
        (second_plan, second_task, "Second task finding"),
    ):
        await authenticated_client.post(
            "/api/ai/upload-vulnerability",
            json={
                "plan_id": plan_id,
                "task_id": task_id,
                "data": {"title": title},
            },
        )

    by_task = await authenticated_client.get(
        f"/api/v1/vulnerabilities?task_id={first_task}"
    )
    by_plan = await authenticated_client.get(
        f"/api/v1/vulnerabilities?plan_id={second_plan}"
    )

    assert [item["title"] for item in by_task.json()["data"]["items"]] == [
        "First task finding"
    ]
    assert [item["title"] for item in by_plan.json()["data"]["items"]] == [
        "Second task finding"
    ]


async def test_vulnerability_upload_redacts_nested_credentials(authenticated_client):
    plan_id, task_id = await create_task(
        authenticated_client, "Redacted finding", "redacted-finding-contract"
    )
    uploaded = await authenticated_client.post(
        "/api/ai/upload-vulnerability",
        json={
            "plan_id": plan_id,
            "task_id": task_id,
            "data": {
                "title": "Credential-bearing finding",
                "password": "plain-secret",
                "nested": {"access_token": "token-secret"},
            },
        },
    )

    response = await authenticated_client.get(
        f"/api/v1/vulnerabilities/{uploaded.json()['data']['vulnerability_id']}"
    )

    assert response.json()["data_json"]["password"] == "***"
    assert response.json()["data_json"]["nested"]["access_token"] == "***"


async def test_report_upload_rejects_credentialed_external_url(authenticated_client):
    plan_id, task_id = await create_task(
        authenticated_client, "Credentialed report", "credentialed-report-contract"
    )

    response = await authenticated_client.post(
        "/api/ai/upload-report",
        json={
            "plan_id": plan_id,
            "task_id": task_id,
            "external_url": "https://user:password@reports.example.test/report.md",
        },
    )

    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_REPORT_URL"


async def test_report_list_hides_credentialed_historical_url(authenticated_client):
    plan_id, task_id = await create_task(
        authenticated_client, "Historical report", "historical-report-contract"
    )
    async with SessionLocal() as session:
        task = await session.get(Task, uuid.UUID(task_id))
        session.add(
            Report(
                org_id=task.org_id,
                plan_id=uuid.UUID(plan_id),
                task_id=task.id,
                filename="historical.md",
                external_url="https://user:password@reports.example.test/historical.md",
            )
        )
        await session.commit()

    response = await authenticated_client.get("/api/v1/reports")

    assert response.status_code == 200
    assert response.json()["data"]["items"][0]["external_url"] is None
    assert "user:password" not in response.text


async def test_report_list_contract_has_page_and_association_summaries(
    authenticated_client,
):
    plan_id, task_id = await create_task(
        authenticated_client, "Report list", "report-list-contract"
    )
    await authenticated_client.post(
        "/api/ai/upload-report",
        json={
            "plan_id": plan_id,
            "task_id": task_id,
            "filename": "contract.md",
            "external_url": "https://reports.example.test/contract.md",
        },
    )

    response = await authenticated_client.get("/api/v1/reports?page=1&page_size=1")

    assert response.status_code == 200
    page = response.json()["data"]
    assert page["total"] == 1
    assert page["page"] == 1
    assert page["page_size"] == 1
    assert page["items"][0]["plan_name"] == "Report list"
    assert page["items"][0]["task_name"] == "Report list"
    assert "local_path" not in response.text


async def test_result_list_summaries_do_not_cross_organization_boundaries(
    authenticated_client,
):
    current_plan_id, current_task_id = await create_task(
        authenticated_client, "Current plan", "current-org-summary-contract"
    )
    async with SessionLocal() as session:
        current_task = await session.get(Task, uuid.UUID(current_task_id))
        second_org = Organization(name="Result Isolation Organization")
        session.add(second_org)
        await session.flush()
        second_user = User(
            org_id=second_org.id,
            username="result-isolation-user",
            name="Result Isolation User",
            password_hash=password_hash.hash("result-isolation-password"),
            role="admin",
        )
        session.add(second_user)
        await session.flush()
        second_plan = ScanPlan(
            org_id=second_org.id,
            created_by=second_user.id,
            name="Secret second plan",
            targets=["secret.example.test"],
        )
        session.add(second_plan)
        await session.flush()
        second_task = Task(
            org_id=second_org.id,
            plan_id=second_plan.id,
            created_by=second_user.id,
            request_id="second-org-result-task",
            name="Secret second task",
        )
        session.add(second_task)
        await session.flush()
        session.add_all(
            [
                Vulnerability(
                    org_id=current_task.org_id,
                    plan_id=uuid.UUID(current_plan_id),
                    task_id=second_task.id,
                    title="Malformed association finding",
                ),
                Report(
                    org_id=current_task.org_id,
                    plan_id=uuid.UUID(current_plan_id),
                    task_id=second_task.id,
                    filename="current.md",
                ),
                Report(
                    org_id=current_task.org_id,
                    plan_id=second_plan.id,
                    filename="cross-plan.md",
                ),
            ]
        )
        await session.commit()

    vulnerabilities = await authenticated_client.get("/api/v1/vulnerabilities")
    reports = await authenticated_client.get("/api/v1/reports")

    assert vulnerabilities.json()["data"]["items"][0]["task_name"] is None
    assert reports.json()["data"]["total"] == 1
    assert reports.json()["data"]["items"][0]["task_name"] is None
    assert "Secret second" not in vulnerabilities.text
    assert "Secret second" not in reports.text


async def test_uploaded_report_is_task_scoped_downloadable_and_audited(
    authenticated_client, tmp_path
):
    plan_id, task_id = await create_task(
        authenticated_client, "Report result plan", "result-report-test"
    )
    settings = get_settings().model_copy(update={"report_dir": tmp_path})
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        uploaded = await authenticated_client.post(
            "/api/ai/upload-report",
            json={
                "plan_id": plan_id,
                "task_id": task_id,
                "filename": "validation.md",
                "content": "# Validation report",
            },
        )
        report_id = uploaded.json()["data"]["report_id"]
        report = await authenticated_client.get(f"/api/v1/reports/{report_id}")
        assert report.json()["task_id"] == task_id

        preview = await authenticated_client.get(f"/api/v1/reports/{report_id}/content")
        assert preview.status_code == 200
        assert preview.text == "# Validation report"
        assert preview.headers["content-type"].startswith("text/plain")
        assert preview.headers["x-content-type-options"] == "nosniff"

        download = await authenticated_client.get(f"/api/v1/reports/{report_id}/download")
        assert download.status_code == 200
        assert download.text == "# Validation report"
        audits = await authenticated_client.get("/api/v1/audit-logs?action=report.download")
        assert audits.json()["data"]["total"] == 1
        previews = await authenticated_client.get("/api/v1/audit-logs?action=report.preview")
        assert previews.json()["data"]["total"] == 1
    finally:
        app.dependency_overrides.pop(get_settings, None)

async def test_ai_logs_are_queryable_and_redacted(authenticated_client):
    plan_id, _ = await create_task(
        authenticated_client, "Log result plan", "result-log-test"
    )
    uploaded = await authenticated_client.post(
        "/api/ai/upload-log",
        json={
            "plan_id": plan_id,
            "level": "warning",
            "content": "Started with Bearer abc.def and token=plain-secret",
            "details": {
                "access_token": "detail-secret",
                "nested": {"db_password": "password-secret", "safe": "value"},
            },
        },
    )
    assert uploaded.status_code == 200

    listed = await authenticated_client.get(
        f"/api/v1/ai-logs?plan_id={plan_id}&level=warning"
    )
    assert listed.status_code == 200
    item = listed.json()["data"]["items"][0]
    assert item["content"] == "Started with Bearer *** and token=***"
    assert item["details_json"] == {
        "access_token": "***",
        "nested": {"db_password": "***", "safe": "value"},
    }
