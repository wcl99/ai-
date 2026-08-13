"""Read user-supplied demonstration results without persisting or executing them."""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from functools import lru_cache
from pathlib import Path


DEMO_NAMESPACE = uuid.UUID("50d83186-4ca6-4a8f-b8a7-6f94dcb6ef1d")
VULNERABILITY_FILE = "vulnerabilities_http_139.198.31.136_81.json"
REPORT_FILE = "http_--139.198.31.136_81渗透测试报告.docx"


def demo_uuid(key: str) -> uuid.UUID:
    return uuid.uuid5(DEMO_NAMESPACE, key)


def _safe_file(directory: Path, path: Path) -> Path:
    root = directory.resolve()
    resolved = path.resolve()
    if resolved != root and root not in resolved.parents:
        raise ValueError("Demo report must be inside demo data directory")
    return resolved


def _evidence_time(response: object) -> datetime | None:
    match = re.search(r"(?im)^Date:\s*(.+?)\s*$", str(response or ""))
    if not match:
        return None
    try:
        value = parsedate_to_datetime(match.group(1))
    except (TypeError, ValueError, OverflowError):
        return None
    return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)


@dataclass(frozen=True)
class DemoDataStore:
    asset: dict
    plan: dict
    task: dict
    events: tuple[dict, ...]
    vulnerabilities: tuple[dict, ...]
    report: dict

    @classmethod
    def load(
        cls,
        directory: Path,
        *,
        report_path: Path | None = None,
    ) -> DemoDataStore:
        root = directory.resolve()
        vulnerability_path = root / VULNERABILITY_FILE
        selected_report = _safe_file(root, report_path or root / REPORT_FILE)
        return _load_cached(
            root,
            vulnerability_path.stat().st_mtime_ns,
            selected_report,
            selected_report.stat().st_mtime_ns,
        )

    def filter_vulnerabilities(
        self,
        *,
        severity: str | None = None,
        status: str | None = None,
        keyword: str | None = None,
        asset: str | None = None,
        task_id: uuid.UUID | None = None,
        plan_id: uuid.UUID | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
    ) -> list[dict]:
        needle = keyword.strip().casefold() if keyword else None
        items = []
        for item in self.vulnerabilities:
            if severity and item["severity"] != severity:
                continue
            if status and item["status"] != status:
                continue
            if needle and needle not in f"{item['title']} {item['asset_key']}".casefold():
                continue
            if asset and item["asset_key"] != asset:
                continue
            if task_id and item["task_id"] != task_id:
                continue
            if plan_id and item["plan_id"] != plan_id:
                continue
            if created_from and item["created_at"] < created_from:
                continue
            if created_to and item["created_at"] > created_to:
                continue
            items.append(item)
        return items


@lru_cache(maxsize=4)
def _load_cached(
    directory: Path,
    vulnerability_mtime_ns: int,
    report_path: Path,
    report_mtime_ns: int,
) -> DemoDataStore:
    del vulnerability_mtime_ns, report_mtime_ns
    source = json.loads((directory / VULNERABILITY_FILE).read_text(encoding="utf-8"))
    target = str(source["查询资产地址"]).strip()
    raw_items = source["漏洞列表"]
    if not isinstance(raw_items, list):
        raise ValueError("Demo vulnerability list must be an array")

    evidence_times = [
        value
        for raw in raw_items
        if (value := _evidence_time(raw.get("响应体"))) is not None
    ]
    created_at = min(evidence_times) if evidence_times else datetime.fromtimestamp(
        (directory / VULNERABILITY_FILE).stat().st_mtime, tz=UTC
    ).replace(microsecond=0)
    finished_at = max(evidence_times) if evidence_times else created_at
    plan_id = demo_uuid(f"plan:{target}")
    task_id = demo_uuid(f"task:{target}")
    asset_id = demo_uuid(f"asset:{target}")
    report_id = demo_uuid(f"report:{target}:{report_path.name}")
    task_name = "139.198.31.136:81 安全验证"

    asset = {
        "id": asset_id,
        "plan_id": plan_id,
        "asset_key": target,
        "asset_type": "http",
        "address": target,
        "service": "HTTP",
        "owner": None,
        "authorized": True,
        "data_json": {"source": "demo", "task_id": str(task_id)},
        "created_at": created_at,
        "updated_at": created_at,
    }
    plan = {
        "id": plan_id,
        "name": task_name,
        "test_type": "standard",
        "status": "FINISHED",
        "targets": [target],
    }
    task = {
        "id": task_id,
        "plan_id": plan_id,
        "parent_id": None,
        "external_task_id": None,
        "name": task_name,
        "status": "SUCCEEDED",
        "phase": "FINISHED",
        "progress": 100.0,
        "sync_failures": 0,
        "error_code": None,
        "error_message": None,
        "created_at": created_at,
        "updated_at": finished_at,
        "plan_name": task_name,
        "test_type": "standard",
        "targets": [target],
        "created_by_name": "演示数据",
    }
    events = (
        {
            "id": demo_uuid(f"event:{target}:started"),
            "event_type": "task.started",
            "message": "渗透测试任务已开始",
            "data_json": {"phase": "INIT", "progress": 0},
            "created_at": created_at,
        },
        {
            "id": demo_uuid(f"event:{target}:finished"),
            "event_type": "task.finished",
            "message": f"渗透测试已完成，共发现 {len(raw_items)} 个漏洞",
            "data_json": {"phase": "FINISHED", "progress": 100},
            "created_at": finished_at,
        },
    )

    vulnerabilities = []
    for index, raw in enumerate(raw_items):
        source_id = str(raw.get("漏洞ID", index))
        title = str(raw.get("漏洞名称") or "未命名漏洞").strip()
        vulnerability_id = demo_uuid(f"vulnerability:{target}:{source_id}:{title}")
        evidence_at = _evidence_time(raw.get("响应体"))
        vulnerabilities.append(
            {
                "id": vulnerability_id,
                "plan_id": plan_id,
                "task_id": task_id,
                "asset_key": str(raw.get("资产地址") or target).strip(),
                "title": title,
                "severity": str(raw.get("严重等级") or "unknown").lower(),
                "status": "OPEN",
                "description": str(raw.get("漏洞描述") or "").strip() or None,
                "data_json": {
                    "source_tool": "演示数据导入",
                    "source_vulnerability_id": raw.get("漏洞ID"),
                    "http_url": str(raw.get("漏洞地址") or ""),
                    "payload": str(raw.get("Payload") or ""),
                    "http_request": str(raw.get("请求体") or ""),
                    "http_response": str(raw.get("响应体") or ""),
                    "analysis": str(raw.get("分析过程") or ""),
                    "vuln_suggestions": str(raw.get("修复建议") or ""),
                    "evidence_at": evidence_at.isoformat() if evidence_at else None,
                    "tags": ["渗透测试", "演示数据"],
                },
                "created_at": evidence_at or created_at + timedelta(seconds=index),
                "updated_at": evidence_at or created_at + timedelta(seconds=index),
                "task_name": task_name,
                "tags": ["渗透测试", "演示数据"],
            }
        )

    report = {
        "id": report_id,
        "plan_id": plan_id,
        "task_id": task_id,
        "filename": report_path.name,
        "format": "docx",
        "report_level": "penetration",
        "local_path": str(report_path),
        "external_url": None,
        "status": "READY",
        "first_viewed_at": None,
        "first_viewed_by": None,
        "first_exported_at": None,
        "first_exported_by": None,
        "created_at": finished_at,
        "plan_name": task_name,
        "task_name": task_name,
    }
    return DemoDataStore(asset, plan, task, events, tuple(vulnerabilities), report)
