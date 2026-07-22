import httpx

from app.engine import (
    _contains_deprecated_fields,
    engine_error,
    map_phase,
    map_status,
    parse_engine_task,
    redact_sensitive,
)


def test_maps_external_task_state():
    assert map_status("in_progress") == "RUNNING"
    assert map_status("completed") == "SUCCEEDED"
    assert map_phase("scanning") == "SCANNING"


def test_rejects_deprecated_precheck_fields_at_any_depth():
    assert _contains_deprecated_fields({"params": {"scan_port": True}})
    assert not _contains_deprecated_fields({"targets": ["example.test"]})


def test_parses_child_task_and_redacts_nested_secrets():
    task = parse_engine_task(
        {"taskId": "child-1", "taskName": "Port scan", "status": "IN_PROGRESS"},
        "fallback",
    )
    assert task.external_task_id == "child-1"
    assert task.name == "Port scan"
    assert redact_sensitive(
        {
            "access_token": "secret",
            "nested": [{"db_password": "secret", "safe": "Bearer hidden-value"}],
        }
    ) == {
        "access_token": "***",
        "nested": [{"db_password": "***", "safe": "Bearer ***"}],
    }

def test_classifies_engine_http_errors_without_exposing_response_body():
    request = httpx.Request("GET", "http://engine.local/task")

    def error(status: int):
        response = httpx.Response(status, request=request, text="sensitive upstream body")
        return httpx.HTTPStatusError("failed", request=request, response=response)

    assert engine_error(error(422), "创建任务").code == "ENGINE_REJECTED"
    assert engine_error(error(401), "查询任务").code == "ENGINE_AUTH_FAILED"
    assert engine_error(error(404), "查询任务").code == "ENGINE_TASK_NOT_FOUND"
    unavailable = engine_error(httpx.ConnectError("offline", request=request), "查询任务")
    assert unavailable.code == "ENGINE_UNAVAILABLE"
    assert "sensitive" not in unavailable.message
    assert engine_error(ValueError("invalid json"), "查询任务").code == "INVALID_ENGINE_PAYLOAD"