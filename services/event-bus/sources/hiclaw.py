import asyncio
import json
import logging
import os
import time
from collections.abc import AsyncGenerator

import httpx

logger = logging.getLogger(__name__)

HICLAW_URL = os.environ.get("HICLAW_URL", "http://hiclaw:18088")
HICLAW_ADMIN_USER = os.environ.get("HICLAW_ADMIN_USER", "admin")
HICLAW_ADMIN_PASSWORD = os.environ.get("HICLAW_ADMIN_PASSWORD", "")
POLL_INTERVAL = 1.0  # seconds

MATRIX_TYPE_MAP = {
    "m.room.message": "tool_call",
    "agent.start": "agent_start",
    "agent.task": "tool_call",
    "agent.complete": "task_complete",
    "agent.approval": "approval_needed",
    "agent.error": "error",
}


class HiClawSource:
    """
    Polls HiClaw Matrix room events.
    Authenticates via Matrix password login, then polls /sync for new events.
    Tracks `since` token to avoid re-delivering events.
    """

    def __init__(self):
        self._access_token: str | None = None
        self._since: str | None = None

    async def stream(self) -> AsyncGenerator[dict, None]:
        while True:
            try:
                if not self._access_token:
                    await self._authenticate()

                async with httpx.AsyncClient(timeout=30) as client:
                    params = {"timeout": 5000, "full_state": "false"}
                    if self._since:
                        params["since"] = self._since

                    resp = await client.get(
                        f"{HICLAW_URL}/_matrix/client/v3/sync",
                        params=params,
                        headers={"Authorization": f"Bearer {self._access_token}"},
                    )

                    if resp.status_code == 401:
                        logger.warning("HiClaw token expired — re-authenticating")
                        self._access_token = None
                        await asyncio.sleep(1)
                        continue

                    resp.raise_for_status()
                    data = resp.json()
                    self._since = data.get("next_batch", self._since)

                    for event in self._extract_events(data):
                        yield event

            except httpx.ConnectError:
                logger.warning("HiClaw not reachable at %s — retrying in 5s", HICLAW_URL)
                self._access_token = None
                await asyncio.sleep(5)
                continue
            except Exception as e:
                logger.warning("HiClaw source error: %s — retrying in 5s", e)
                await asyncio.sleep(5)
                continue

            await asyncio.sleep(POLL_INTERVAL)

    async def _authenticate(self):
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{HICLAW_URL}/_matrix/client/v3/login",
                json={
                    "type": "m.login.password",
                    "user": HICLAW_ADMIN_USER,
                    "password": HICLAW_ADMIN_PASSWORD,
                },
            )
            resp.raise_for_status()
            self._access_token = resp.json()["access_token"]
            logger.info("HiClaw authenticated successfully")

    def _extract_events(self, sync_data: dict) -> list[dict]:
        events = []
        rooms = sync_data.get("rooms", {}).get("join", {})
        for room_id, room_data in rooms.items():
            for event in room_data.get("timeline", {}).get("events", []):
                normalized = self._normalize(event, room_id)
                if normalized:
                    events.append(normalized)
        return events

    def _normalize(self, raw: dict, room_id: str) -> dict | None:
        event_type = raw.get("type", "")
        mapped_type = MATRIX_TYPE_MAP.get(event_type)
        if mapped_type is None:
            return None  # skip unrecognised Matrix events

        content = raw.get("content", {})
        return {
            "source": "hiclaw",
            "type": mapped_type,
            "agent": content.get("agent", raw.get("sender", "unknown")),
            "ts": raw.get("origin_server_ts", time.time() * 1000) / 1000,
            "data": {**content, "room_id": room_id, "event_id": raw.get("event_id")},
            "id": raw.get("event_id"),
        }
