import asyncio
import json
import logging
import os
import time
from collections.abc import AsyncGenerator

import websockets
from websockets.exceptions import ConnectionClosed, WebSocketException

logger = logging.getLogger(__name__)

AIO_SANDBOX_URL = os.environ.get("AIO_SANDBOX_URL", "http://aio-sandbox:8080")

AIO_TYPE_MAP = {
    "file_change": "file_write",
    "file_write": "file_write",
    "shell_output": "tool_result",
    "shell_start": "tool_call",
    "shell_complete": "task_complete",
}


def _http_to_ws(url: str) -> str:
    """Convert http:// base URL to ws:// WebSocket URL."""
    return url.replace("http://", "ws://").replace("https://", "wss://")


class AIOSandboxSource:
    """
    Connects to AIO Sandbox WebSocket event stream at /v1/events.
    Reconnects with exponential backoff on disconnect.
    """

    async def stream(self) -> AsyncGenerator[dict, None]:
        ws_url = f"{_http_to_ws(AIO_SANDBOX_URL)}/v1/events"
        backoff = 1.0

        while True:
            try:
                logger.info("Connecting to AIO Sandbox at %s", ws_url)
                async with websockets.connect(ws_url, ping_interval=20, ping_timeout=10) as ws:
                    backoff = 1.0  # reset on successful connection
                    logger.info("AIO Sandbox WebSocket connected")
                    async for message in ws:
                        try:
                            raw = json.loads(message)
                        except json.JSONDecodeError:
                            logger.debug("AIO: skipping non-JSON message")
                            continue
                        yield self._normalize(raw)

            except ConnectionClosed as e:
                logger.warning("AIO Sandbox WebSocket closed: %s — reconnecting in %.0fs", e, backoff)
            except WebSocketException as e:
                logger.warning("AIO Sandbox WebSocket error: %s — reconnecting in %.0fs", e, backoff)
            except OSError as e:
                logger.warning("AIO Sandbox not reachable: %s — reconnecting in %.0fs", e, backoff)
            except Exception as e:
                logger.warning("AIO Sandbox unexpected error: %s — reconnecting in %.0fs", e, backoff)

            yield {
                "source": "aio",
                "type": "error",
                "agent": "aio-sandbox",
                "ts": time.time(),
                "data": {"reason": "connection_lost", "retrying_in": backoff},
            }

            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30.0)  # exponential backoff, max 30s

    def _normalize(self, raw: dict) -> dict:
        raw_type = raw.get("type", "")
        event_type = AIO_TYPE_MAP.get(raw_type, raw_type or "unknown")
        return {
            "source": "aio",
            "type": event_type,
            "agent": raw.get("agent", "aio-sandbox"),
            "ts": raw.get("ts", raw.get("timestamp", time.time())),
            "data": raw.get("data", raw),
            "id": raw.get("id"),
        }
