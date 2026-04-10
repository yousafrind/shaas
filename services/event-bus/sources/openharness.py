import asyncio
import json
import logging
import os
import time
from collections.abc import AsyncGenerator

import httpx

logger = logging.getLogger(__name__)

OPENHARNESS_URL = os.environ.get("OPENHARNESS_URL", "http://openharness:3001")

TYPE_MAP = {
    "LLMCall": "token_usage",
    "ToolUse": "tool_call",
    "ToolResult": "tool_result",
    "ApprovalNeeded": "approval_needed",
    "FileWrite": "file_write",
    "AgentStart": "agent_start",
    "TaskComplete": "task_complete",
    "Error": "error",
}


class OpenHarnessSource:
    """
    Streams newline-delimited JSON events from OpenHarness stream-json output.
    OpenHarness --output-format stream-json emits one JSON object per line.
    We parse line-by-line so events arrive in real time (no buffering).
    """

    async def stream(self) -> AsyncGenerator[dict, None]:
        while True:
            try:
                async with httpx.AsyncClient(timeout=None) as client:
                    async with client.stream(
                        "GET",
                        f"{OPENHARNESS_URL}/api/stream",
                        headers={"Accept": "application/x-ndjson"},
                    ) as response:
                        response.raise_for_status()
                        async for line in response.aiter_lines():
                            line = line.strip()
                            if not line:
                                continue
                            try:
                                raw = json.loads(line)
                            except json.JSONDecodeError:
                                logger.debug("OpenHarness: skipping non-JSON line: %s", line[:80])
                                continue

                            yield self._normalize(raw)

            except httpx.ConnectError:
                logger.warning("OpenHarness not reachable at %s — retrying in 5s", OPENHARNESS_URL)
            except httpx.HTTPStatusError as e:
                logger.warning("OpenHarness stream error %s — retrying in 5s", e.response.status_code)
            except Exception as e:
                logger.warning("OpenHarness source error: %s — retrying in 5s", e)

            yield {
                "source": "openharness",
                "type": "error",
                "agent": "openharness-source",
                "ts": time.time(),
                "data": {"reason": "connection_lost", "retrying_in": 5},
            }
            await asyncio.sleep(5)

    def _normalize(self, raw: dict) -> dict:
        raw_type = raw.get("type", "")
        event_type = TYPE_MAP.get(raw_type, raw_type.lower() if raw_type else "unknown")
        return {
            "source": "openharness",
            "type": event_type,
            "agent": raw.get("agent", raw.get("agentId", "unknown")),
            "ts": raw.get("ts", raw.get("timestamp", time.time())),
            "data": raw.get("data", raw),
            "id": raw.get("id"),
        }
