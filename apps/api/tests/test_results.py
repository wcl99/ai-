from app.config import get_settings
from app.main import app


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