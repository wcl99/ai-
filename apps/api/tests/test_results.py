import uuid

from app.config import get_settings
from app.auth import password_hash
from app.db import SessionLocal
from app.main import app
from app.models import Organization, Report, ScanPlan, Task, User, Vulnerability


async def create_task(client, name: str, request_id: str) -> tuple[str, str]:
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
    return plan.json()["id"], task.json()["id"]


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
