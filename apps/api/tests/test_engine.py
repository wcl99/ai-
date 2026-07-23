import httpx

import asyncio

import pytest

from app.config import Settings, get_settings
from app.engine import (
    XiaoyiEngineClient,
    _contains_deprecated_fields,
    engine_error,
    map_phase,
    map_status,
    parse_engine_task,
    redact_sensitive,
)
from app.errors import AppError


def test_maps_external_task_state():
    assert map_status("in_progress") == "RUNNING"
    assert map_status("completed") == "SUCCEEDED"
    assert map_phase("scanning") == "SCANNING"


def test_rejects_deprecated_precheck_fields_at_any_depth():
    assert _contains_deprecated_fields({"params": {"scan_port": True}})


def test_test_suite_forces_mock_engine_without_credentials():
    settings = get_settings()

    assert settings.engine_mode == "mock"
    assert settings.xiaoyi_token in {None, ""}
    assert settings.xiaoyi_base_url == "http://127.0.0.1:1"


async def test_xiaoyi_precheck_receive_has_a_total_timeout(monkeypatch):
    class HangingSocket:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        async def send(self, message):
            return None

        async def recv(self):
            await asyncio.Event().wait()

    monkeypatch.setattr(
        "app.engine.websockets.connect",
        lambda *args, **kwargs: HangingSocket(),
    )
    settings = Settings(
        jwt_secret="test-secret-that-is-at-least-32-characters",
        engine_mode="xiaoyi",
        engine_timeout_seconds=0.01,
    )

    with pytest.raises(AppError) as captured:
        await XiaoyiEngineClient(settings).precheck(
            {"action": "can_subdomain", "domains": ["example.test"]}
        )

    assert captured.value.code == "ENGINE_UNAVAILABLE"
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
