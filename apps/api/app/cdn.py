"""Fail-closed adapter for the operator-provided cdninfo Linux CLI."""

import asyncio
import json
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .config import Settings


def _first(value: dict, names: tuple[str, ...]) -> Any:
    for name in names:
        if name in value:
            return value[name]
    return None


def parse_cdninfo_result(target: str, payload: dict) -> dict:
    cdn = _first(payload, ("IsCdn", "cdn", "is_cdn", "isCDN"))
    waf = _first(payload, ("IsWaf", "waf", "is_waf", "isWAF"))
    provider = next(
        (
            payload.get(name)
            for name in (
                "CdnCompany",
                "WafCompany",
                "cdn_name",
                "cdnName",
                "provider",
                "waf_name",
                "wafName",
            )
            if payload.get(name)
        ),
        None,
    )
    if waf is True:
        status = "BLOCKED_WAF"
    elif cdn is True:
        status = "BLOCKED_CDN"
    elif cdn is False and waf is False:
        status = "SAFE"
    else:
        status = "UNKNOWN"
    return {
        "host": target,
        "hostType": "ip" if target.replace(".", "").isdigit() else "domain",
        "cdn_status": status,
        "cdn_provider": str(provider) if provider else None,
        "cdn_checked_at": datetime.now(UTC).isoformat(),
        "cdn_evidence": payload,
    }


def _extract_payload(text: str) -> dict:
    value = json.loads(text)
    if isinstance(value, list):
        value = value[0] if value else {}
    if isinstance(value, dict) and isinstance(value.get("data"), list):
        value = value["data"][0] if value["data"] else {}
    if not isinstance(value, dict):
        raise ValueError("cdninfo output must be an object")
    return value


async def assess_target(target: str, settings: Settings) -> dict:
    if not settings.cdninfo_enabled:
        return {
            "host": target,
            "hostType": "ip" if target.replace(".", "").isdigit() else "domain",
            "cdn_status": "UNCHECKED",
        }
    binary = settings.cdninfo_binary.resolve()
    config = settings.cdninfo_config.resolve()
    if not binary.is_file() or not config.is_file():
        return parse_cdninfo_result(target, {"error": "cdninfo is unavailable"})
    with tempfile.TemporaryDirectory() as directory:
        output = Path(directory) / "result.json"
        process = await asyncio.create_subprocess_exec(
            str(binary),
            "-c",
            str(config),
            "-d",
            str(settings.cdninfo_store.resolve()),
            "-I",
            "str",
            "-i",
            target,
            "-O",
            "json",
            "-l",
            "3",
            "-o",
            str(output),
            cwd=str(config.parent),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, _ = await asyncio.wait_for(
                process.communicate(), timeout=settings.cdninfo_timeout_seconds
            )
        except TimeoutError:
            process.kill()
            await process.wait()
            return parse_cdninfo_result(target, {"error": "cdninfo timed out"})
        if process.returncode != 0:
            return parse_cdninfo_result(target, {"error": "cdninfo failed"})
        try:
            raw = output.read_text(encoding="utf-8") if output.is_file() else stdout.decode()
            return parse_cdninfo_result(target, _extract_payload(raw))
        except (OSError, UnicodeError, ValueError, json.JSONDecodeError):
            return parse_cdninfo_result(target, {"error": "invalid cdninfo output"})


async def assess_targets(targets: list[str], settings: Settings) -> list[dict]:
    return [await assess_target(target, settings) for target in targets]
