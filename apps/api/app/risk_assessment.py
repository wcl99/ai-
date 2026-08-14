"""Assess task findings with a bounded CVSS 3.1 DeepSeek response."""

import asyncio
import json
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from .config import Settings
from .consultation import LocalTokenCounter
from .engine import redact_sensitive
from .errors import AppError

RiskLevel = Literal["严重", "高危", "中危", "低危"]
AssessmentSource = Literal["deepseek", "platform", "unavailable"]


class RiskAssessmentResult(BaseModel):
    score: float | None = Field(default=None, ge=0, le=10)
    level: str = "暂无评分"
    rationale: str
    source: AssessmentSource


class DeepSeekRiskAssessment(BaseModel):
    score: float = Field(ge=0, le=10)
    level: RiskLevel
    rationale: str = Field(min_length=1, max_length=1200)


def _strip_json_fence(content: str) -> str:
    value = content.strip()
    if value.startswith("```"):
        lines = value.splitlines()
        value = "\n".join(lines[1:-1]).strip()
    return value


def parse_assessment(content: str) -> RiskAssessmentResult:
    try:
        parsed = DeepSeekRiskAssessment.model_validate(
            json.loads(_strip_json_fence(content))
        )
    except (json.JSONDecodeError, ValidationError) as exc:
        raise ValueError("DeepSeek 未返回有效的 CVSS 评分") from exc
    return RiskAssessmentResult(
        score=round(parsed.score, 1),
        level=cvss_level(parsed.score),
        rationale=parsed.rationale,
        source="deepseek",
    )


def cvss_level(score: float) -> str:
    if score >= 9:
        return "严重"
    if score >= 7:
        return "高危"
    if score >= 4:
        return "中危"
    if score > 0:
        return "低危"
    return "无风险"


def fallback_assessment() -> RiskAssessmentResult:
    return RiskAssessmentResult(
        score=None,
        level="暂无评分",
        rationale="风险评分服务暂不可用，平台未根据不完整证据估算分数。",
        source="unavailable",
    )


def assessment_prompt(findings: list[dict]) -> str:
    return json.dumps(
        redact_sensitive(findings[:100]), ensure_ascii=False, default=str
    )


SYSTEM_PROMPT = """你是安全运营平台的 CVSS v3.1 风险评估器。只根据输入的漏洞标题、严重等级、资产和描述进行整体任务评分，不得补造不存在的漏洞事实。严格输出一个 JSON 对象，不要 Markdown：
{"score":8.6,"level":"高危","rationale":"说明评分依据"}
score 必须是 0 到 10 的一位小数；level 只能是 严重、高危、中危、低危。评分应参考 CVSS v3.1 的攻击向量、攻击复杂度、权限要求、用户交互、范围、机密性、完整性和可用性影响；证据不足时按保守原则评分并在 rationale 中说明。"""


def _run_agent(settings: Settings, findings: list[dict]) -> RiskAssessmentResult:
    if settings.openai_api_key is None or not settings.openai_api_key.get_secret_value():
        raise AppError(503, "AGENT_NOT_CONFIGURED", "DeepSeek 评分能力尚未配置")
    try:
        from camel.agents import ChatAgent
        from camel.models import ModelFactory
        from camel.types import ModelPlatformType
    except ImportError as exc:
        raise AppError(503, "AGENT_NOT_INSTALLED", "DeepSeek 评分依赖尚未安装") from exc

    model = ModelFactory.create(
        model_platform=ModelPlatformType.OPENAI_COMPATIBLE_MODEL,
        model_type=settings.model_type,
        url=settings.openai_api_base_url,
        api_key=settings.openai_api_key.get_secret_value(),
        token_counter=LocalTokenCounter(),
        model_config_dict={
            "max_tokens": 700,
            "extra_body": {"thinking": {"type": "disabled"}},
        },
        timeout=settings.agent_timeout_seconds,
        max_retries=0,
    )
    prompt = assessment_prompt(findings)
    response = ChatAgent(
        system_message=SYSTEM_PROMPT,
        model=model,
        step_timeout=settings.agent_timeout_seconds,
    ).step(f"待评估的任务漏洞列表：{prompt}")
    message = getattr(response, "msg", None)
    if message is None:
        values = getattr(response, "msgs", [])
        message = values[0] if values else None
    content = getattr(message, "content", "")
    return parse_assessment(content)


async def run_risk_assessment(
    settings: Settings, findings: list[dict]
) -> RiskAssessmentResult:
    return await asyncio.to_thread(_run_agent, settings, findings)
