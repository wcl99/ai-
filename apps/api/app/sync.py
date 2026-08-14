"""Synchronize active platform tasks with Xiaoyi without blocking request handlers."""

import asyncio
import logging
import uuid
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

from sqlalchemy import select

from .config import Settings
from .db import SessionLocal
from .engine import (
    EngineTask,
    TERMINAL_STATUSES,
    get_engine_client,
    redact_sensitive,
    summarize_tool_failures,
)
from .errors import AppError
from .models import Report, ScanPlan, Task, TaskEvent, Vulnerability
from .result_aggregation import (
    ensure_local_report,
    has_execution_evidence,
    persist_vulnerabilities,
    summarize_tools,
)

logger = logging.getLogger(__name__)
RETRYABLE_ENGINE_CODES = {"ENGINE_UNAVAILABLE"}
ACTIVE_STATUS_RANK = {"QUEUED": 0, "RUNNING": 1}
PHASE_RANK = {
    "INIT": 0,
    "INFO_COLLECTING": 1,
    "SCANNING": 2,
    "EXPLOITING": 3,
    "REPORT_GENERATING": 4,
    "FINISHED": 5,
}


def apply_engine_state(task: Task, result: EngineTask) -> None:
    status = result.status
    phase = result.phase
    if (
        status not in TERMINAL_STATUSES
        and ACTIVE_STATUS_RANK.get(status, -1)
        < ACTIVE_STATUS_RANK.get(task.status, -1)
    ):
        status = task.status
        phase = task.phase
    task.status = status
    task.phase = phase
    task.progress = 100 if status in TERMINAL_STATUSES else max(task.progress, result.progress)


def aggregate_child_progress(parent: Task, children: list[Task]) -> None:
    """Use persisted child state when Xiaoyi's parent progress lags behind."""
    if not children:
        return
    progress = sum(child.progress for child in children) / len(children)
    if parent.status not in TERMINAL_STATUSES:
        progress = min(progress, 99)
    parent.progress = max(parent.progress, progress)
    active_children = [child for child in children if child.status not in TERMINAL_STATUSES]
    phase_children = active_children or (
        children if parent.status in TERMINAL_STATUSES else []
    )
    if not phase_children:
        return
    child_phase = max(phase_children, key=lambda child: PHASE_RANK.get(child.phase, -1)).phase
    if PHASE_RANK.get(child_phase, -1) > PHASE_RANK.get(parent.phase, -1):
        parent.phase = child_phase


def engine_report_url(raw: dict) -> str | None:
    sources = [raw]
    if isinstance(raw.get("data"), dict):
        sources.append(raw["data"])
    for source in sources:
        value = source.get("reportUrl") or source.get("report_url")
        if not value and isinstance(source.get("report"), dict):
            value = source["report"].get("url")
        if not isinstance(value, str) or len(value) > 2000:
            continue
        parsed = urlsplit(value)
        if (
            parsed.scheme in {"http", "https"}
            and parsed.hostname
            and not parsed.username
            and not parsed.password
        ):
            return value
    return None


def is_report_packaging_error(message: str | None) -> bool:
    """Recognize the one Xiaoyi report failure the platform can safely recover."""
    if not message:
        return False
    marker = "zip entry size is too large or invalid"
    normalized = " ".join(message.casefold().split())
    prefix, found, suffix = normalized.partition(marker)
    return bool(found) and not suffix.strip() and ";" not in prefix and "；" not in prefix


async def has_ready_report_fallback(session, task: Task) -> bool:
    report = await session.scalar(
        select(Report).where(
            Report.task_id == task.id,
            Report.status == "READY",
            Report.local_path.is_not(None),
        )
    )
    if report is None or not report.local_path or not Path(report.local_path).is_file():
        return False
    finding_id = await session.scalar(
        select(Vulnerability.id).where(Vulnerability.task_id == task.id).limit(1)
    )
    return finding_id is not None


async def recover_ready_report_fallbacks(session) -> None:
    """Recover ZIP-only report failures after a persisted platform report exists."""
    candidates = list(
        await session.scalars(
            select(Task).where(
                Task.status == "PARTIAL_SUCCEEDED",
                Task.error_message.is_not(None),
            )
        )
    )
    for task in candidates:
        if not is_report_packaging_error(task.error_message):
            continue
        if not await has_ready_report_fallback(session, task):
            continue
        original_reason = task.error_message[:500]
        task.status = "SUCCEEDED"
        task.error_code = None
        task.error_message = None
        session.add(
            TaskEvent(
                task_id=task.id,
                event_type="report_fallback_used",
                message="小易报告打包失败，平台已生成本地报告",
                data_json={
                    "source": "platform",
                    "upstream_error": original_reason,
                },
            )
        )


async def sync_report(session, task: Task, raw: dict) -> None:
    url = engine_report_url(raw)
    if not url:
        return
    report = await session.scalar(select(Report).where(Report.task_id == task.id))
    if report and report.external_url == url:
        return
    parsed = urlsplit(url)
    filename = PurePosixPath(parsed.path).name[-255:] or f"{task.id}.report"
    suffix = PurePosixPath(filename).suffix.lower().lstrip(".")
    report_format = suffix if suffix in {"html", "md", "pdf", "txt"} else "unknown"
    if report is None:
        report = Report(
            org_id=task.org_id,
            plan_id=task.plan_id,
            task_id=task.id,
            filename=filename,
            format=report_format,
        )
        session.add(report)
    report.external_url = url
    report.status = "EXTERNAL"
    session.add(
        TaskEvent(
            task_id=task.id,
            event_type="report_available",
            message="引擎报告元数据已同步",
            data_json={"format": report_format},
        )
    )


async def sync_children(session, client, parent: Task) -> tuple[list[dict], list[str]]:
    all_tools: list[dict] = []
    child_errors: list[str] = []
    synced_children: list[Task] = []
    try:
        results = await client.get_children(parent.external_task_id)
    except AppError as exc:
        logger.warning("child task sync skipped", extra={"task_id": str(parent.id), "code": exc.code})
        return all_tools, child_errors
    existing = {
        item.external_task_id: item
        for item in await session.scalars(select(Task).where(Task.parent_id == parent.id))
    }
    for result in results:
        if not result.external_task_id:
            continue
        child = existing.get(result.external_task_id)
        created = child is None
        if child is None:
            request_id = f"child-{uuid.uuid5(uuid.NAMESPACE_URL, f'{parent.id}:{result.external_task_id}')}"
            child = Task(
                org_id=parent.org_id,
                plan_id=parent.plan_id,
                parent_id=parent.id,
                created_by=parent.created_by,
                request_id=request_id,
                external_task_id=result.external_task_id,
                name=result.name or f"{parent.name} / child",
            )
            session.add(child)
            await session.flush()
            existing[result.external_task_id] = child
        previous = (child.status, child.phase, child.progress)
        apply_engine_state(child, result)
        synced_children.append(child)
        child.raw_external = redact_sensitive(result.raw)
        error_message = result.error_message
        tools: list[dict] = []
        get_tools = getattr(client, "get_tools", None)
        if callable(get_tools):
            try:
                tools = await get_tools(result.external_task_id)
            except AppError:
                pass
        if tools:
            all_tools.extend(tools)
            child.raw_external["platform_tool_summary"] = summarize_tools(tools)
            await persist_vulnerabilities(session, parent, tools)
        if result.status == "FAILED" and not error_message and tools:
            error_message = summarize_tool_failures(tools)
        child.error_message = error_message
        child.error_code = "XIAOYI_TASK_FAILED" if error_message else None
        if error_message:
            child_errors.append(error_message)
        await sync_report(session, child, result.raw)
        if created or previous != (child.status, child.phase, child.progress):
            session.add(
                TaskEvent(
                    task_id=child.id,
                    event_type="child_synced",
                    message=f"{child.status} / {child.phase} / {child.progress:.0f}%",
                    data_json={
                        "status": child.status,
                        "phase": child.phase,
                        "progress": child.progress,
                    },
                )
            )
    aggregate_child_progress(parent, synced_children)
    return all_tools, list(dict.fromkeys(child_errors))


async def sync_once(settings: Settings) -> None:
    client = get_engine_client(settings)
    async with SessionLocal() as session:
        # Terminal tasks are immutable here; only active platform tasks need engine polling.
        tasks = list(
            await session.scalars(
                select(Task).where(Task.status.in_(["QUEUED", "RUNNING", "CANCELLING"]))
            )
        )
        for task in tasks:
            # Isolate each task so one engine failure cannot prevent the others from syncing.
            try:
                previous = (task.status, task.phase, task.progress)
                if task.status == "CANCELLING":
                    if task.external_task_id:
                        await client.stop_task(task.external_task_id)
                    task.status, task.phase = "CANCELLED", "FINISHED"
                    task.sync_failures = 0
                    task.error_code = task.error_message = None
                elif task.external_task_id is None:
                    plan = await session.get(ScanPlan, task.plan_id)
                    if plan is None:
                        task.status = "FAILED"
                        task.error_code = "PLAN_NOT_FOUND"
                    else:
                        result = await client.create_task(plan.snapshot, task.request_id)
                        task.external_task_id = result.external_task_id
                        apply_engine_state(task, result)
                        task.raw_external = redact_sensitive(result.raw)
                        task.sync_failures = 0
                        task.error_message = result.error_message
                        task.error_code = (
                            "XIAOYI_TASK_FAILED" if result.error_message else None
                        )
                        context = plan.snapshot.get("xiaoyi_context")
                        scan_mode = (
                            context.get("scan_mode")
                            if isinstance(context, dict)
                            else None
                        ) or plan.snapshot.get("scan_mode", "standard")
                        session.add(
                            TaskEvent(
                                task_id=task.id,
                                event_type="xiaoyi_task_started",
                                message="小易任务启动成功",
                                data_json={
                                    "external_task_id": result.external_task_id,
                                    "scan_mode": scan_mode,
                                    "status": task.status,
                                    "phase": task.phase,
                                },
                            )
                        )
                        await sync_report(session, task, result.raw)
                else:
                    was_report_retrying = task.error_code == "REPORT_GENERATION_RETRYING"
                    result = await client.get_task(task.external_task_id, task.progress)
                    apply_engine_state(task, result)
                    task.raw_external = redact_sensitive(result.raw)
                    task.sync_failures = 0
                    task.error_message = result.error_message
                    task.error_code = (
                        "XIAOYI_TASK_FAILED" if result.error_message else None
                    )
                    await sync_report(session, task, result.raw)
                    tools, child_errors = await sync_children(session, client, task)
                    if not task.error_message and child_errors:
                        task.error_message = "；".join(child_errors)[:2000]
                        task.error_code = "XIAOYI_TASK_FAILED"
                    if task.status == "FAILED" and has_execution_evidence(tools):
                        task.status = "PARTIAL_SUCCEEDED"
                        task.error_code = "XIAOYI_PARTIAL_RESULT"
                    if task.status in TERMINAL_STATUSES and not engine_report_url(result.raw):
                        children = list(
                            await session.scalars(
                                select(Task).where(Task.parent_id == task.id)
                            )
                        )
                        await ensure_local_report(
                            session, settings, task, children, tools
                        )
                    if (
                        is_report_packaging_error(task.error_message)
                        and not await has_ready_report_fallback(session, task)
                    ):
                        task.status = "RUNNING"
                        task.phase = "REPORT_GENERATING"
                        task.progress = 90
                        task.error_code = "REPORT_GENERATION_RETRYING"
                        task.sync_failures += 1
                        if not was_report_retrying:
                            session.add(
                                TaskEvent(
                                    task_id=task.id,
                                    event_type="report_retry_scheduled",
                                    message="报告生成暂未完成，系统将继续重试",
                                    data_json={"attempt": task.sync_failures},
                                )
                            )
                current = (task.status, task.phase, task.progress)
                if current != previous:
                    session.add(
                        TaskEvent(
                            task_id=task.id,
                            event_type="status_changed",
                            message=f"{task.status} / {task.phase} / {task.progress:.0f}%",
                            data_json={"status": task.status, "phase": task.phase, "progress": task.progress},
                        )
                    )
                if task.status in TERMINAL_STATUSES:
                    task.phase = "FINISHED"
            except AppError as exc:
                task.error_code = exc.code
                task.error_message = exc.message
                if exc.code in RETRYABLE_ENGINE_CODES and task.sync_failures < settings.engine_retry_limit:
                    task.sync_failures += 1
                    session.add(
                        TaskEvent(
                            task_id=task.id,
                            event_type="sync_retry",
                            message=f"引擎暂不可用，将重试（{task.sync_failures}/{settings.engine_retry_limit}）",
                            data_json={"code": exc.code, "attempt": task.sync_failures},
                        )
                    )
                else:
                    task.status = "FAILED"
                    task.phase = "FINISHED"
                    error_details = redact_sensitive(exc.details or {})
                    session.add(
                        TaskEvent(
                            task_id=task.id,
                            event_type="failed",
                            message=exc.message,
                            data_json={"code": exc.code, **error_details},
                        )
                    )
            except Exception:
                logger.exception("task sync failed", extra={"task_id": str(task.id)})
                task.status = "FAILED"
                task.phase = "FINISHED"
                task.error_code = "INTERNAL_SYNC_ERROR"
                task.error_message = "任务同步发生内部错误"
                session.add(
                    TaskEvent(
                        task_id=task.id,
                        event_type="failed",
                        message=task.error_message,
                        data_json={"code": task.error_code},
                    )
                )
        await recover_ready_report_fallbacks(session)
        # Persist normalized task states, reports, child tasks, and events as one iteration.
        await session.commit()


async def sync_forever(settings: Settings, stop: asyncio.Event) -> None:
    # Lifespan owns this loop and supplies the stop event for graceful application shutdown.
    while not stop.is_set():
        try:
            await sync_once(settings)
        except Exception:
            logger.exception("task synchronizer iteration failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=settings.sync_interval_seconds)
        except TimeoutError:
            pass
