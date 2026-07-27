"""Synchronize active platform tasks with Xiaoyi without blocking request handlers."""

import asyncio
import logging
import uuid
from pathlib import PurePosixPath
from urllib.parse import urlsplit

from sqlalchemy import select

from .config import Settings
from .db import SessionLocal
from .engine import EngineTask, TERMINAL_STATUSES, get_engine_client, redact_sensitive
from .errors import AppError
from .models import Report, ScanPlan, Task, TaskEvent

logger = logging.getLogger(__name__)
RETRYABLE_ENGINE_CODES = {"ENGINE_UNAVAILABLE"}
ACTIVE_STATUS_RANK = {"QUEUED": 0, "RUNNING": 1}


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
    task.progress = max(task.progress, result.progress)


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


async def sync_children(session, client, parent: Task) -> None:
    try:
        results = await client.get_children(parent.external_task_id)
    except AppError as exc:
        logger.warning("child task sync skipped", extra={"task_id": str(parent.id), "code": exc.code})
        return
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
        child.raw_external = redact_sensitive(result.raw)
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
                        task.error_code = task.error_message = None
                        await sync_report(session, task, result.raw)
                else:
                    result = await client.get_task(task.external_task_id, task.progress)
                    apply_engine_state(task, result)
                    task.raw_external = redact_sensitive(result.raw)
                    task.sync_failures = 0
                    task.error_code = task.error_message = None
                    await sync_report(session, task, result.raw)
                    await sync_children(session, client, task)
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
