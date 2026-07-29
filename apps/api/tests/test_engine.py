import httpx

import asyncio

import pytest
from pydantic import ValidationError

from app.config import Settings, get_settings
from app.engine import (
    XiaoyiEngineClient,
    _contains_deprecated_fields,
    build_xiaoyi_chat_payload,
    engine_error,
    map_phase,
    map_status,
    parse_engine_task,
    redact_sensitive,
    resolve_xiaoyi_org_id,
)
from app.errors import AppError
from app.schemas import PortPrecheckRequest


def test_maps_external_task_state():
    assert map_status("in_progress") == "RUNNING"
    assert map_status("completed") == "SUCCEEDED"
    assert map_phase("scanning") == "SCANNING"


def test_rejects_deprecated_precheck_fields_at_any_depth():
    assert _contains_deprecated_fields({"params": {"scan_port": True}})


def test_builds_documented_xiaoyi_ip_port_payload():
    snapshot = {
        "xiaoyi_context": {
            "org_id": 2,
            "user_id": "admin",
            "plan_id": 999,
            "scan_mode": "standard",
            "scan_speed": "quick",
            "download_intermediate_results": True,
        },
        "asset_list": [
            {
                "host": "139.198.31.136",
                "hostType": "ip",
                "ports": [
                    {
                        "port": 81,
                        "state": "open",
                        "service": "http",
                        "protocol": "tcp",
                    }
                ],
            }
        ],
    }

    assert build_xiaoyi_chat_payload(snapshot) == {
        **snapshot["xiaoyi_context"],
        "asset_list": [
            {
                "asset_type": "ip_port",
                "asset_address": [
                    {"address": "139.198.31.136", "port": 81, "service": "http"}
                ],
                "whitebox_context": "",
            }
        ],
    }


def test_builds_xiaoyi_payload_without_optional_org_id():
    snapshot = {
        "xiaoyi_context": {
            "user_id": "admin",
            "plan_id": 999,
            "scan_mode": "standard",
            "scan_speed": "quick",
            "download_intermediate_results": True,
        },
        "asset_list": [{"host": "example.test", "hostType": "domain"}],
    }

    payload = build_xiaoyi_chat_payload(snapshot)

    assert "org_id" not in payload
    assert payload["user_id"] == "admin"
    assert payload["plan_id"] == 999


@pytest.mark.parametrize(
    "port",
    [
        {"port": 81, "state": "closed", "service": "http", "protocol": "tcp"},
        {"port": 81, "state": "open", "service": "http", "protocol": "udp"},
    ],
)
def test_rejects_unselected_or_non_tcp_xiaoyi_ports(port):
    snapshot = {
        "xiaoyi_context": {
            "org_id": 2,
            "user_id": "admin",
            "plan_id": 999,
            "scan_mode": "standard",
            "scan_speed": "quick",
            "download_intermediate_results": True,
        },
        "asset_list": [
            {"host": "139.198.31.136", "hostType": "ip", "ports": [port]}
        ],
    }

    with pytest.raises(AppError) as captured:
        build_xiaoyi_chat_payload(snapshot)

    assert captured.value.code == "INVALID_ENGINE_PAYLOAD"


def test_rejects_non_integer_xiaoyi_org_and_plan_ids():
    snapshot = {
        "xiaoyi_context": {
            "org_id": "uuid-org",
            "user_id": "admin",
            "plan_id": "uuid-plan",
            "scan_mode": "standard",
            "scan_speed": "quick",
            "download_intermediate_results": True,
        },
        "asset_list": [{"host": "example.test", "hostType": "domain"}],
    }

    with pytest.raises(AppError) as captured:
        build_xiaoyi_chat_payload(snapshot)

    assert captured.value.code == "INVALID_ENGINE_PAYLOAD"


@pytest.mark.parametrize(
    ("org_id", "plan_id"),
    [(0, 1), (-1, 1), (1, 0), (1, 2_147_483_648)],
)
def test_rejects_xiaoyi_ids_outside_positive_java_integer_range(
    org_id, plan_id
):
    snapshot = {
        "xiaoyi_context": {
            "org_id": org_id,
            "user_id": "admin",
            "plan_id": plan_id,
            "scan_mode": "standard",
            "scan_speed": "quick",
            "download_intermediate_results": True,
        },
        "asset_list": [{"host": "example.test", "hostType": "domain"}],
    }

    with pytest.raises(AppError) as captured:
        build_xiaoyi_chat_payload(snapshot)

    assert captured.value.code == "INVALID_ENGINE_PAYLOAD"


async def test_xiaoyi_create_task_sends_documented_body_without_request_id(
    monkeypatch,
):
    sent = {}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        async def post(self, url, json, headers):
            sent.update(json)
            request = httpx.Request("POST", url)
            return httpx.Response(
                200,
                request=request,
                json={"taskId": "real-1", "status": "PENDING"},
            )

    monkeypatch.setattr(
        "app.engine.httpx.AsyncClient", lambda **kwargs: FakeClient()
    )
    settings = Settings(
        jwt_secret="test-secret-that-is-at-least-32-characters",
        engine_mode="xiaoyi",
        xiaoyi_base_url="https://xiaoyi.test",
    )
    snapshot = {
        "xiaoyi_context": {
            "org_id": 2,
            "user_id": "admin",
            "plan_id": 999,
            "scan_mode": "standard",
            "scan_speed": "quick",
            "download_intermediate_results": True,
        },
        "asset_list": [
            {
                "host": "139.198.31.136",
                "hostType": "ip",
                "ports": [{"port": 81, "service": "http"}],
            }
        ],
    }

    result = await XiaoyiEngineClient(settings).create_task(
        snapshot, "local-request-id"
    )

    assert result.external_task_id == "real-1"
    assert "request_id" not in sent
    assert set(sent) == {
        "org_id",
        "user_id",
        "plan_id",
        "scan_mode",
        "scan_speed",
        "download_intermediate_results",
        "asset_list",
    }


def test_port_precheck_requires_host_type():
    valid = PortPrecheckRequest.model_validate(
        {
            "action": "can_port",
            "hosts": [{"host": "example.test", "hostType": "domain"}],
        }
    )

    assert valid.hosts[0].hostType == "domain"
    with pytest.raises(ValidationError):
        PortPrecheckRequest.model_validate(
            {"action": "can_port", "hosts": [{"host": "example.test"}]}
        )


def test_test_suite_forces_mock_engine_without_credentials():
    settings = get_settings()

    assert settings.engine_mode == "mock"
    assert settings.xiaoyi_token in {None, ""}
    assert settings.xiaoyi_base_url == "http://127.0.0.1:1"


def test_blank_xiaoyi_org_id_is_treated_as_unconfigured():
    settings = Settings(
        jwt_secret="test-secret-that-is-at-least-32-characters",
        xiaoyi_org_id="",
    )

    assert settings.xiaoyi_org_id is None


def test_xiaoyi_org_mapping_is_optional():
    settings = Settings(
        jwt_secret="test-secret-that-is-at-least-32-characters",
        engine_mode="xiaoyi",
        xiaoyi_org_id=None,
    )

    assert resolve_xiaoyi_org_id(settings) is None


def test_blank_xiaoyi_user_id_is_treated_as_unconfigured():
    settings = Settings(
        jwt_secret="test-secret-that-is-at-least-32-characters",
        xiaoyi_user_id="   ",
    )

    assert settings.xiaoyi_user_id is None


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


async def test_xiaoyi_precheck_session_reuses_one_socket(monkeypatch):
    sent_messages: list[dict] = []
    connect_urls: list[str] = []
    responses = [
        {
            "action": "can_subdomain_result",
            "success": True,
            "hasResult": True,
            "domains": [{"domain": "www.example.test", "type": "subdomain"}],
            "subdomainCount": 1,
        },
        {
            "action": "can_port_result",
            "success": True,
            "hasResult": True,
            "hosts": [{"host": "example.test", "hostType": "domain", "ports": [443]}],
            "portCount": 1,
        },
    ]

    class FakeSocket:
        async def send(self, message):
            import json

            sent_messages.append(json.loads(message))

        async def recv(self):
            import json

            return json.dumps(responses.pop(0))

        async def close(self):
            return None

    async def fake_connect(url, **kwargs):
        connect_urls.append(url)
        return FakeSocket()

    monkeypatch.setattr("app.engine.websockets.connect", fake_connect)
    settings = Settings(
        jwt_secret="test-secret-that-is-at-least-32-characters",
        engine_mode="xiaoyi",
        engine_timeout_seconds=1,
        xiaoyi_base_url="https://xiaoyi.example",
    )

    async with XiaoyiEngineClient(settings).precheck_session() as session:
        first = await session.send(
            {"action": "can_subdomain", "domains": ["example.test"]}
        )
        second = await session.send(
            {
                "action": "can_port",
                "hosts": [{"host": "example.test", "hostType": "domain"}],
            }
        )

    assert first["action"] == "can_subdomain_result"
    assert second["action"] == "can_port_result"
    assert connect_urls == ["wss://xiaoyi.example/api/osCore/ws/asset-can"]
    assert sent_messages == [
        {"action": "can_subdomain", "domains": ["example.test"]},
        {
            "action": "can_port",
            "hosts": [{"host": "example.test", "hostType": "domain"}],
        },
    ]


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


def test_engine_rejection_preserves_only_known_safe_validation_detail():
    request = httpx.Request("POST", "https://xiaoyi.test/api/osCore/chat")
    response = httpx.Response(
        400,
        request=request,
        json={"error": "asset_list 不能为空"},
    )

    error = engine_error(
        httpx.HTTPStatusError("failed", request=request, response=response),
        "创建任务",
    )

    assert error.details is not None
    assert error.details["upstream_error"] == "asset_list 不能为空"


@pytest.mark.parametrize(
    "upstream_message",
    [
        "whitebox_context=admin-session-cookie-value",
        "cookie: session-value",
        "Authorization: Bearer private-value",
        "invalid credentials: admin@example.com / p@ssw0rd!",
        "cookies include an authenticated browser session",
        "asset_list 不能为空 because value contained private material",
    ],
)
def test_sensitive_upstream_rejection_detail_is_suppressed(upstream_message):
    request = httpx.Request("POST", "https://xiaoyi.test/api/osCore/chat")
    response = httpx.Response(
        400,
        request=request,
        json={"error": upstream_message},
    )

    error = engine_error(
        httpx.HTTPStatusError("failed", request=request, response=response),
        "创建任务",
    )

    assert error.details == {"upstream_error": "上游错误详情已隐藏"}
