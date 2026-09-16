"""Render the canonical Markdown report from one persisted task snapshot."""

from __future__ import annotations

import json
from collections import Counter
from collections.abc import Iterable
from importlib.resources import files
from string import Template
from typing import Any

from ..engine import redact_sensitive, redact_sensitive_text

SEVERITY_LABELS = {
    "critical": "严重",
    "high": "高危",
    "medium": "中危",
    "low": "低危",
    "info": "信息",
}


def _text(value: Any, fallback: str = "未提供") -> str:
    if value is None or value == "":
        return fallback
    if isinstance(value, (dict, list)):
        value = json.dumps(redact_sensitive(value), ensure_ascii=False, indent=2)
    return redact_sensitive_text(str(value))


def _table(value: Any) -> str:
    return _text(value).replace("|", "\\|").replace("\r", " ").replace("\n", " ")


def _finding_section(index: int, finding: Any) -> str:
    data = redact_sensitive(getattr(finding, "data_json", {}) or {})
    if not isinstance(data, dict):
        data = {}
    suggestion = data.get("vuln_suggestions") or data.get("suggestion")
    evidence = data.get("evidence") or data.get("proof") or data.get("result")
    severity = SEVERITY_LABELS.get(str(getattr(finding, "severity", "medium")).lower(), "中危")
    return "\n".join(
        [
            f"## {index}. {_text(getattr(finding, 'title', None))}",
            "",
            f"- 风险等级：{severity}",
            f"- 影响资产：{_text(getattr(finding, 'asset_key', None))}",
            "",
            "### 漏洞描述",
            "",
            _text(getattr(finding, "description", None)),
            "",
            "### 验证证据",
            "",
            _text(evidence),
            "",
            "### 修复建议",
            "",
            _text(suggestion),
        ]
    )


def render_report(task: Any, children: Iterable[Any], vulnerabilities: Iterable[Any], tools: list[dict]) -> str:
    """Return a sanitized Markdown report matching the approved reference structure."""
    children = list(children)
    vulnerabilities = list(vulnerabilities)
    counts = Counter(str(getattr(item, "severity", "medium")).lower() for item in vulnerabilities)
    severity_summary = "\n".join(
        [
            "| 严重 | 高危 | 中危 | 低危 | 信息 |",
            "| ---: | ---: | ---: | ---: | ---: |",
            f"| {counts['critical']} | {counts['high']} | {counts['medium']} | {counts['low']} | {counts['info']} |",
        ]
    )
    recommendations = []
    for item in vulnerabilities:
        data = redact_sensitive(getattr(item, "data_json", {}) or {})
        suggestion = data.get("vuln_suggestions") if isinstance(data, dict) else None
        if suggestion:
            recommendations.append(f"- **{_text(getattr(item, 'title', None))}**：{_text(suggestion)}")
    finding_sections = "\n\n".join(
        _finding_section(index, finding) for index, finding in enumerate(vulnerabilities, 1)
    ) or "未收到可确认的结构化漏洞。"
    error = getattr(task, "error_message", None)
    error_summary = f"**未完成原因：** {_text(error)}" if error else ""
    values = {
        "report_title": f"{_text(getattr(task, 'name', None))}渗透测试报告",
        "task_id": _text(getattr(task, "id", None)),
        "external_task_id": _text(getattr(task, "external_task_id", None)),
        "task_name": _table(getattr(task, "name", None)),
        "task_status": _table(getattr(task, "status", None)),
        "task_progress": f"{float(getattr(task, 'progress', 0)):.0f}",
        "child_count": str(len(children)),
        "finding_count": str(len(vulnerabilities)),
        "error_summary": error_summary,
        "severity_summary": severity_summary,
        "recommendation_summary": "\n".join(recommendations) or "- 暂无已回传的专项修复建议。",
        "finding_sections": finding_sections,
    }
    template = Template(files("app.reporting").joinpath("template.md").read_text(encoding="utf-8"))
    return template.safe_substitute(values).strip() + "\n"
