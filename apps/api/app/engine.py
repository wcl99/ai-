import asyncio
import json
import re
from dataclasses import dataclass

import httpx
import websockets

from .config import Settings
from .errors import AppError

TERMINAL_STATUSES = {"SUCCEEDED", "PARTIAL_SUCCEEDED", "FAILED", "CANCELLED"}

STATUS_MAP = {
    "WAITING": "QUEUED",
    "PENDING": "QUEUED",
    "DISPATCHING": "QUEUED",
    "IN_PROGRESS": "RUNNING",
    "PARTIAL_COMPLETED": "PARTIAL_SUCCEEDED",
    "COMPLETED": "SUCCEEDED",
    "FAILED": "FAILED",
    "TIMEOUT": "FAILED",
    "STOPPED": "CANCELLED",
}

PHASE_MAP = {
    "INIT": "INIT",
    "INFO_COLLECTING": "INFO_COLLECTING",
    "SCANNING": "SCANNING",
    "EXPLOITING": "EXPLOITING",
    "REPORT_GENERATING": "REPORT_GENERATING",
    "FINISHED": "FINISHED",
}


def map_status(value: str) -> str:
    return STATUS_MAP.get(value.upper(), "FAILED")


def map_phase(value: str | None) -> str:
    if not value:
        return "INIT"
    return PHASE_MAP.get(value.upper(), "INIT")


def engine_error(exc: Exception, action: str) -> AppError:
    if isinstance(exc, ValueError):
        return AppError(502, "INVALID_ENGINE_PAYLOAD", f"小易{action}响应格式无效")
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if status in {400, 422}:
            return AppError(400, "ENGINE_REJECTED", f"小易拒绝{action}请求")
        if status in {401, 403}:
            return AppError(502, "ENGINE_AUTH_FAILED", "小易引擎鉴权失败")
        if status == 404:
            return AppError(502, "ENGINE_TASK_NOT_FOUND", "小易任务不存在")
    return AppError(502, "ENGINE_UNAVAILABLE", f"小易引擎{action}失败")


@dataclass(slots=True)
class EngineTask:
    external_task_id: str
    status: str
    phase: str
    progress: float
    raw: dict
    name: str = ""


SENSITIVE_KEYS = {
    "authorization",
    "cookie",
    "password",
    "secret",
    "token",
    "whitebox",
    "white_box",
}


def sensitive_key(key: str) -> bool:
    normalized = key.lower().replace("-", "_")
    return (
        normalized in SENSITIVE_KEYS
        or normalized.endswith(("_token", "_password", "_secret"))
        or normalized.startswith(("whitebox_", "white_box_"))
    )


def redact_sensitive_text(value: str) -> str:
    value = re.sub(
        r"(?i)(bearer\s+)[A-Za-z0-9._~+/=-]+",
        r"\1***",
        value,
    )
    return re.sub(
        r"(?i)\b((?:access[_-]?)?token|password|secret)\s*([:=])\s*[^\s,;]+",
        r"\1\2***",
        value,
    )


def redact_sensitive(value: object) -> object:
    if isinstance(value, dict):
        return {
            key: "***" if sensitive_key(key) else redact_sensitive(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact_sensitive(item) for item in value]
    if isinstance(value, str):
        return redact_sensitive_text(value)
    return value


def parse_engine_task(
    data: dict,
    fallback_id: str,
    current_progress: float = 0,
    default_status: str = "FAILED",
) -> EngineTask:
    external_id = str(data.get("taskId") or data.get("task_id") or data.get("id") or fallback_id)
    return EngineTask(
        external_id,
        map_status(str(data.get("status", default_status))),
        map_phase(data.get("phase")),
        float(data.get("progress", current_progress)),
        data,
        str(data.get("name") or data.get("taskName") or ""),
    )


class MockEngineClient:
    async def create_task(self, payload: dict, request_id: str) -> EngineTask:
        return EngineTask(f"mock-{request_id}", "RUNNING", "INFO_COLLECTING", 10, {})

    async def get_task(self, external_task_id: str, current_progress: float = 0) -> EngineTask:
        progress = min(100.0, current_progress + 25.0)
        if progress >= 100:
            status, phase = "SUCCEEDED", "FINISHED"
        elif progress >= 75:
            status, phase = "RUNNING", "REPORT_GENERATING"
        elif progress >= 50:
            status, phase = "RUNNING", "SCANNING"
        else:
            status, phase = "RUNNING", "INFO_COLLECTING"
        return EngineTask(external_task_id, status, phase, progress, {"mock": True})

    async def stop_task(self, external_task_id: str) -> None:
        return None

    async def get_children(self, external_task_id: str) -> list[EngineTask]:
        return []

    async def precheck(self, message: dict) -> dict:
        action = message.get("action")
        if action == "can_subdomain":
            domains = sorted({item.lower() for item in message.get("domains", [])})
            result = []
            for domain in domains:
                result.extend(
                    [
                        {"domain": domain, "type": "parent"},
                        {"domain": f"www.{domain}", "type": "subdomain"},
                    ]
                )
            return {
                "action": "can_subdomain_result",
                "success": True,
                "hasResult": bool(result),
                "domains": result,
                "subdomainCount": len(result),
            }
        if action == "can_port":
            hosts = [
                {
                    **host,
                    "alive": True,
                    "ports": [
                        {"port": 443, "state": "open", "service": "https", "protocol": "tcp"}
                    ],
                }
                for host in message.get("hosts", [])
            ]
            return {
                "action": "can_port_result",
                "success": True,
                "hasResult": bool(hosts),
                "hosts": hosts,
                "portCount": len(hosts),
            }
        raise AppError(400, "INVALID_PRECHECK_ACTION", "不支持的预查动作")


class XiaoyiEngineClient:
    def __init__(self, settings: Settings):
        self.settings = settings

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.settings.xiaoyi_token}"} if self.settings.xiaoyi_token else {}

    async def create_task(self, payload: dict, request_id: str) -> EngineTask:
        body = {**payload, "request_id": request_id}
        if _contains_deprecated_fields(body):
            raise AppError(400, "INVALID_ENGINE_PAYLOAD", "任务参数包含已废弃的预查字段")
        try:
            async with httpx.AsyncClient(timeout=self.settings.engine_timeout_seconds) as client:
                response = await client.post(
                    f"{self.settings.xiaoyi_base_url.rstrip('/')}/api/osCore/chat",
                    json=body,
                    headers=self.headers,
                )
                response.raise_for_status()
                data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise engine_error(exc, "创建任务") from exc
        external_id = str(data.get("taskId") or data.get("task_id") or "")
        if not external_id:
            raise AppError(502, "INVALID_ENGINE_PAYLOAD", "小易未返回任务 ID")
        return parse_engine_task(data, external_id, default_status="PENDING")

    async def get_task(self, external_task_id: str, current_progress: float = 0) -> EngineTask:
        try:
            async with httpx.AsyncClient(timeout=self.settings.engine_timeout_seconds) as client:
                response = await client.get(
                    f"{self.settings.xiaoyi_base_url.rstrip('/')}/api/osCore/task/{external_task_id}",
                    headers=self.headers,
                )
                response.raise_for_status()
                data = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise engine_error(exc, "查询任务") from exc
        return parse_engine_task(data, external_task_id, current_progress)

    async def get_children(self, external_task_id: str) -> list[EngineTask]:
        try:
            async with httpx.AsyncClient(timeout=self.settings.engine_timeout_seconds) as client:
                response = await client.get(
                    f"{self.settings.xiaoyi_base_url.rstrip('/')}/api/osCore/segment-task/{external_task_id}/children",
                    headers=self.headers,
                )
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise engine_error(exc, "查询子任务") from exc
        data = payload.get("data", payload) if isinstance(payload, dict) else payload
        if isinstance(data, dict):
            data = data.get("children", data.get("items", []))
        if not isinstance(data, list):
            raise AppError(502, "INVALID_ENGINE_PAYLOAD", "小易子任务响应格式无效")
        return [parse_engine_task(item, "") for item in data if isinstance(item, dict)]

    async def stop_task(self, external_task_id: str) -> None:
        try:
            async with httpx.AsyncClient(timeout=self.settings.engine_timeout_seconds) as client:
                response = await client.post(
                    f"{self.settings.xiaoyi_base_url.rstrip('/')}/api/osCore/task/{external_task_id}/stop",
                    headers=self.headers,
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise engine_error(exc, "停止任务") from exc

    async def precheck(self, message: dict) -> dict:
        base = self.settings.xiaoyi_base_url.rstrip("/")
        ws_url = base.replace("https://", "wss://").replace("http://", "ws://")
        try:
            async with websockets.connect(
                f"{ws_url}/api/osCore/ws/asset-can",
                additional_headers=self.headers,
                open_timeout=self.settings.engine_timeout_seconds,
            ) as socket:
                async with asyncio.timeout(self.settings.engine_timeout_seconds):
                    await socket.send(json.dumps(message, ensure_ascii=False))
                    while True:
                        data = httpx.Response(200, content=await socket.recv()).json()
                        if data.get("action") in {"can_subdomain_result", "can_port_result", "can_error"}:
                            return data
        except Exception as exc:
            raise AppError(502, "ENGINE_UNAVAILABLE", "小易预查连接失败") from exc


def _contains_deprecated_fields(value: object) -> bool:
    deprecated = {"scan_subdomain", "scan_port", "can_subdomain", "can_port"}
    if isinstance(value, dict):
        return bool(deprecated.intersection(value)) or any(
            _contains_deprecated_fields(item) for item in value.values()
        )
    if isinstance(value, list):
        return any(_contains_deprecated_fields(item) for item in value)
    return False


def get_engine_client(settings: Settings):
    return MockEngineClient() if settings.engine_mode == "mock" else XiaoyiEngineClient(settings)
