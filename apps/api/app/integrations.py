import hashlib
import hmac
import json
from datetime import UTC, datetime
import httpx

async def post_signed(url: str | None, secret: str | None, event: str, payload: dict) -> bool:
    if not url:
        return False
    body = json.dumps({"event": event, "payload": payload}, ensure_ascii=False, separators=(",", ":")).encode()
    signature = hmac.new((secret or "").encode(), body, hashlib.sha256).hexdigest()
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(url, content=body, headers={"content-type": "application/json", "x-platform-signature": signature})
        response.raise_for_status()
    return True

def overdue(data: dict, now: datetime, hours: int) -> bool:
    due = data.get("due_date")
    if not due or data.get("sla_escalated"):
        return False
    try:
        value = datetime.fromisoformat(str(due).replace("Z", "+00:00"))
    except ValueError:
        return False
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value < now
