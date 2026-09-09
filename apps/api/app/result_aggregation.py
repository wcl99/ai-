"""Persist useful Xiaoyi evidence and build the platform's fallback report."""

import asyncio
from importlib.resources import files
from pathlib import Path

from sqlalchemy import select

from .config import Settings
from .engine import decode_tool_payload, redact_sensitive, summarize_tool_failures
from .models import Report, Task, TaskEvent, Vulnerability
from .reporting.convert import ReportConversionError, ReportConverter
from .reporting.render import render_report
from .services import safe_report_path

SEVERITY_MAP = {
    "严重": "critical",
    "高危": "high",
    "中危": "medium",
    "低危": "low",
    "信息": "info",
}


def _bounded_value(value, depth: int = 0):
    if depth > 8:
        return "[truncated]"
    if isinstance(value, str):
        return value[:4000]
    if isinstance(value, dict):
        return {
            str(key)[:120]: _bounded_value(child, depth + 1)
            for key, child in list(value.items())[:100]
        }
    if isinstance(value, list):
        return [_bounded_value(child, depth + 1) for child in value[:100]]
    return value


def _walk_vulnerability_info(value, depth: int = 0):
    if depth > 8:
        return
    if isinstance(value, dict):
        info = value.get("vuln_info")
        if isinstance(info, dict):
            yield info
        for child in value.values():
            if isinstance(child, (dict, list)):
                yield from _walk_vulnerability_info(child, depth + 1)
    elif isinstance(value, list):
        for child in value[:100]:
            yield from _walk_vulnerability_info(child, depth + 1)


def extract_vulnerabilities(tools: list[dict]) -> list[dict]:
    """Extract only explicit vuln_info objects; never infer findings from prose."""
    findings: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for tool in tools:
        payload = decode_tool_payload(tool.get("result"))
        for raw_info in _walk_vulnerability_info(payload):
            info = _bounded_value(redact_sensitive(raw_info))
            title = str(info.get("vuln_name") or info.get("name") or "").strip()
            if not title:
                continue
            asset_key = str(
                info.get("http_url")
                or info.get("url")
                or info.get("target")
                or ""
            ).strip()
            key = (title, asset_key)
            if key in seen:
                continue
            seen.add(key)
            raw_severity = str(
                info.get("vuln_level") or info.get("severity") or "medium"
            ).strip()
            severity = SEVERITY_MAP.get(raw_severity, raw_severity.lower())
            if severity not in {"critical", "high", "medium", "low", "info"}:
                severity = "medium"
            data = dict(info)
            data["source_tool"] = str(tool.get("toolName") or "xiaoyi")[:120]
            findings.append(
                {
                    "title": title[:300],
                    "severity": severity,
                    "description": str(
                        info.get("vuln_description") or info.get("description") or ""
                    )[:10000],
                    "asset_key": asset_key[:512] or None,
                    "data_json": data,
                }
            )
    return findings


def summarize_tools(tools: list[dict]) -> list[dict]:
    summaries: list[dict] = []
    for tool in tools[:200]:
        item = {
            "tool_name": str(tool.get("toolName") or tool.get("name") or "tool")[:120],
            "phase": str(tool.get("phase") or "")[:64],
            "success": tool.get("success") is True,
        }
        if tool.get("success") is False:
            item["error"] = summarize_tool_failures([tool])
        summaries.append(item)
    return summaries


async def persist_vulnerabilities(session, task: Task, tools: list[dict]) -> list[dict]:
    findings = extract_vulnerabilities(tools)
    existing = list(
        await session.scalars(
            select(Vulnerability).where(Vulnerability.task_id == task.id)
        )
    )
    existing_keys = {(item.title, item.asset_key or "") for item in existing}
    for finding in findings:
        key = (finding["title"], finding["asset_key"] or "")
        if key in existing_keys:
            continue
        session.add(
            Vulnerability(
                org_id=task.org_id,
                plan_id=task.plan_id,
                task_id=task.id,
                asset_key=finding["asset_key"],
                title=finding["title"],
                severity=finding["severity"],
                description=finding["description"],
                data_json=finding["data_json"],
            )
        )
        existing_keys.add(key)
    await session.flush()
    return findings


def has_execution_evidence(tools: list[dict]) -> bool:
    return any(item.get("success") is True for item in tools)


def _render_report(
    task: Task,
    children: list[Task],
    vulnerabilities: list[Vulnerability],
    tools: list[dict],
) -> str:
    lines = [
        f"# {task.name} 安全测试报告",
        "",
        "## 执行摘要",
        "",
        f"- 平台任务：`{task.id}`",
        f"- 小易任务：`{task.external_task_id or '-'}`",
        f"- 最终状态：`{task.status}`",
        f"- 执行进度：{task.progress:.0f}%",
        f"- 已确认漏洞：{len(vulnerabilities)}",
        f"- 工具结果：{len(tools)}（成功 {sum(item.get('success') is True for item in tools)}，失败 {sum(item.get('success') is False for item in tools)}）",
    ]
    if task.error_message:
        lines.extend([f"- 未完成原因：{task.error_message}"])
    lines.extend(["", "## 子任务", ""])
    for child in children:
        detail = f"；{child.error_message}" if child.error_message else ""
        lines.append(f"- {child.name}：{child.status}，进度 {child.progress:.0f}%{detail}")
    if not children:
        lines.append("- 无子任务记录")
    lines.extend(["", "## 漏洞明细", ""])
    if not vulnerabilities:
        lines.append("本次已回传结果中没有可确认的结构化漏洞。")
    for index, vulnerability in enumerate(vulnerabilities, 1):
        lines.extend(
            [
                f"### {index}. {vulnerability.title}",
                "",
                f"- 风险等级：{vulnerability.severity}",
                f"- 影响资产：{vulnerability.asset_key or '未提供'}",
                "",
                vulnerability.description or "未提供漏洞描述。",
                "",
            ]
        )
        suggestion = vulnerability.data_json.get("vuln_suggestions")
        if suggestion:
            lines.extend(["**修复建议**", "", str(suggestion), ""])
    lines.extend(["## 工具执行摘要", ""])
    for item in summarize_tools(tools):
        status = "成功" if item["success"] else "失败"
        detail = f"：{item.get('error')}" if item.get("error") else ""
        lines.append(f"- {item['tool_name']}（{item['phase'] or '未标注阶段'}）：{status}{detail}")
    lines.extend(
        [
            "",
            "## 说明",
            "",
            "本报告由平台依据小易返回的结构化工具结果生成。未返回或执行失败的步骤不会被推断为成功，也不会生成未经证据确认的漏洞。",
            "",
        ]
    )
    return "\n".join(lines)


async def ensure_local_report(
    session,
    settings: Settings,
    task: Task,
    children: list[Task],
    tools: list[dict],
) -> Report | None:
    if not tools:
        return None
    existing_reports = list(
        await session.scalars(
            select(Report).where(
                Report.task_id == task.id,
                Report.local_path.is_not(None),
                Report.format.in_(("md", "docx", "pdf")),
            )
        )
    )
    existing_by_format = {report.format: report for report in existing_reports}
    if all(item in existing_by_format for item in ("md", "docx", "pdf")):
        return existing_by_format["md"]
    vulnerabilities = list(
        await session.scalars(
            select(Vulnerability)
            .where(Vulnerability.task_id == task.id)
            .order_by(Vulnerability.created_at)
        )
    )
    filename = f"{task.id}.md"
    path = safe_report_path(Path(settings.report_dir) / str(task.org_id), filename)
    path.parent.mkdir(parents=True, exist_ok=True)
    report = existing_by_format.get("md")
    if report is not None:
        return await _ensure_binary_reports(
            session, task, report, path, existing_by_format
        )
    temporary = path.with_suffix(".md.tmp")
    temporary.write_text(render_report(task, children, vulnerabilities, tools), encoding="utf-8")
    temporary.replace(path)
    report = Report(
        org_id=task.org_id,
        plan_id=task.plan_id,
        task_id=task.id,
        filename=filename,
        format="md",
        report_level="partial" if task.status == "PARTIAL_SUCCEEDED" else "standard",
        local_path=str(path),
        status="READY",
    )
    session.add(report)
    session.add(
        TaskEvent(
            task_id=task.id,
            event_type="report_available",
            message="平台已根据小易执行结果生成本地报告",
            data_json={"format": "md", "source": "platform"},
        )
    )
    await session.flush()
    return await _ensure_binary_reports(session, task, report, path, existing_by_format)


async def _ensure_binary_reports(
    session,
    task: Task,
    markdown_report: Report,
    markdown_path: Path,
    existing_by_format: dict[str, Report],
) -> Report:
    missing = [item for item in ("docx", "pdf") if item not in existing_by_format]
    if not missing:
        return markdown_report
    reference_doc = Path(files("app.reporting").joinpath("reference.docx"))
    converter = ReportConverter(reference_doc=reference_doc)
    try:
        outputs = await asyncio.to_thread(
            converter.convert,
            markdown_path,
            markdown_path.parent,
            str(task.id),
        )
    except ReportConversionError as exc:
        docx_output = markdown_path.with_suffix(".docx")
        if "docx" in missing and docx_output.is_file():
            session.add(
                Report(
                    org_id=task.org_id,
                    plan_id=task.plan_id,
                    task_id=task.id,
                    filename=docx_output.name,
                    format="docx",
                    report_level=(
                        "partial" if task.status == "PARTIAL_SUCCEEDED" else "standard"
                    ),
                    local_path=str(docx_output),
                    status="READY",
                )
            )
            session.add(
                TaskEvent(
                    task_id=task.id,
                    event_type="report_available",
                    message="平台 DOCX 报告已生成",
                    data_json={"format": "docx", "source": "platform"},
                )
            )
        session.add(
            TaskEvent(
                task_id=task.id,
                event_type="report_generation_failed",
                message=str(exc)[:1000],
                data_json={"formats": missing, "source": "platform"},
            )
        )
        await session.flush()
        return markdown_report

    level = "partial" if task.status == "PARTIAL_SUCCEEDED" else "standard"
    for report_format in missing:
        output = outputs.get(report_format)
        if output is None:
            continue
        session.add(
            Report(
                org_id=task.org_id,
                plan_id=task.plan_id,
                task_id=task.id,
                filename=output.name,
                format=report_format,
                report_level=level,
                local_path=str(output),
                status="READY",
            )
        )
        session.add(
            TaskEvent(
                task_id=task.id,
                event_type="report_available",
                message=f"平台 {report_format.upper()} 报告已生成",
                data_json={"format": report_format, "source": "platform"},
            )
        )
    await session.flush()
    return markdown_report
