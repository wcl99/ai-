"""Run one short-lived CAMEL-AI requirement analyst and validate its output."""

import asyncio
import json
from typing import Literal

from pydantic import BaseModel, Field, ValidationError, field_validator

from .config import Settings
from .errors import AppError


class RequirementPatch(BaseModel):
    targets: list[str] | None = Field(default=None, max_length=64)
    test_type: Literal["discovery", "standard"] | None = None
    scan_speed: Literal["quick", "standard", "deep"] | None = None
    whitebox_available: bool | None = None

    @field_validator("targets")
    @classmethod
    def normalize_targets(cls, values: list[str] | None) -> list[str] | None:
        if values is None:
            return None
        values = [value.strip() for value in values if value.strip()]
        if not values or any(len(value) > 512 or "\x00" in value for value in values):
            raise ValueError("invalid targets")
        return values


class AgentReply(BaseModel):
    assistant_message: str = Field(min_length=1, max_length=4000)
    requirements: RequirementPatch = Field(default_factory=RequirementPatch)
    ready_to_precheck: bool = False


def parse_agent_reply(content: str) -> AgentReply:
    value = content.strip()
    if value.startswith("```"):
        lines = value.splitlines()
        value = "\n".join(lines[1:-1]).strip()
    try:
        return AgentReply.model_validate(json.loads(value))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise ValueError("模型未返回有效的结构化需求") from exc


SYSTEM_PROMPT = """你是 AI 安服平台的需求分析智能体。你的职责仅是收集和整理扫描计划，不能启动扫描、调用工具或承诺结果。
需要确认：目标资产、测试类型、扫描速度、是否有白盒资料、是否已取得书面授权。不要索要密码、Token、Cookie 或私钥；如用户主动提供，提醒其删除并不要复述。
只输出一个 JSON 对象：
{"assistant_message":"中文回复或下一条追问","requirements":{"targets":null,"test_type":null,"scan_speed":null,"whitebox_available":null},"ready_to_precheck":false}
仅当目标、测试类型和扫描速度都明确时 ready_to_precheck 才能为 true。"""


def _run_agent(settings: Settings, messages: list[dict], state: dict) -> AgentReply:
    if settings.openai_api_key is None or not settings.openai_api_key.get_secret_value():
        raise AppError(503, "AGENT_NOT_CONFIGURED", "需求分析智能体尚未配置")
    try:
        from camel.agents import ChatAgent
        from camel.models import ModelFactory
        from camel.types import ModelPlatformType
    except ImportError as exc:
        raise AppError(503, "AGENT_NOT_INSTALLED", "需求分析智能体依赖尚未安装") from exc

    model = ModelFactory.create(
        model_platform=ModelPlatformType.OPENAI_COMPATIBLE_MODEL,
        model_type=settings.model_type,
        url=settings.openai_api_base_url,
        api_key=settings.openai_api_key.get_secret_value(),
        model_config_dict={"temperature": 0.1},
    )
    transcript = "\n".join(
        f"{item['role']}: {item['content']}" for item in messages[-20:]
    )
    prompt = f"当前结构化状态：{json.dumps(state, ensure_ascii=False)}\n对话：\n{transcript}"
    response = ChatAgent(system_message=SYSTEM_PROMPT, model=model).step(prompt)
    message = getattr(response, "msg", None)
    if message is None:
        values = getattr(response, "msgs", [])
        message = values[0] if values else None
    content = getattr(message, "content", "")
    return parse_agent_reply(content)


async def run_requirement_agent(
    settings: Settings, messages: list[dict], state: dict
) -> AgentReply:
    return await asyncio.to_thread(_run_agent, settings, messages, state)
