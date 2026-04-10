import asyncio
import logging
import os
from typing import Any

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from sources.openharness import OpenHarnessSource
from sources.hiclaw import HiClawSource
from sources.aio_sandbox import AIOSandboxSource

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

OPENHARNESS_URL = os.environ.get("OPENHARNESS_URL", "http://openharness:3001")

app = FastAPI(title="Event Bus", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"])


class EventBus:
    """
    Aggregates event streams from OpenHarness, HiClaw, and AIO Sandbox.
    Fans out to all connected WebSocket clients.

    Every event shape:
        {
          "source": "openharness" | "hiclaw" | "aio",
          "type":   "agent_start" | "tool_call" | "tool_result" |
                    "approval_needed" | "file_write" | "task_complete" |
                    "token_usage" | "error",
          "agent":  str,
          "ts":     float,
          "data":   dict,
          "id":     str | None
        }
    """

    def __init__(self):
        self.clients: list[WebSocket] = []
        self.sources = [
            OpenHarnessSource(),
            HiClawSource(),
            AIOSandboxSource(),
        ]

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.clients.append(ws)
        logger.info("WebSocket client connected — total: %d", len(self.clients))

    async def disconnect(self, ws: WebSocket):
        if ws in self.clients:
            self.clients.remove(ws)
        logger.info("WebSocket client disconnected — total: %d", len(self.clients))

    async def broadcast(self, event: dict[str, Any]):
        dead: list[WebSocket] = []
        for client in self.clients:
            try:
                await client.send_json(event)
            except Exception:
                dead.append(client)
        for d in dead:
            if d in self.clients:
                self.clients.remove(d)

    async def run(self):
        """Start all source pollers and fan out events."""
        async def poll(source):
            async for event in source.stream():
                await self.broadcast(event)

        # return_exceptions=True: one failed source doesn't kill the others
        await asyncio.gather(
            *[poll(s) for s in self.sources],
            return_exceptions=True,
        )


bus = EventBus()


@app.on_event("startup")
async def startup():
    asyncio.create_task(bus.run())


@app.get("/health")
def health():
    return {
        "status": "ok",
        "clients": len(bus.clients),
        "sources": ["openharness", "hiclaw", "aio"],
    }


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await bus.connect(ws)
    try:
        while True:
            await ws.receive_text()  # keep-alive; clients can also send commands here
    except WebSocketDisconnect:
        await bus.disconnect(ws)


@app.post("/command")
async def forward_command(body: dict):
    """Forward a slash command to OpenHarness."""
    cmd = body.get("cmd", "")
    if not cmd:
        return {"status": "error", "detail": "cmd is required"}

    # POST to OpenHarness command endpoint
    # Assumption: OpenHarness exposes POST /api/command or /command
    # If the path is wrong, check vendor/OpenHarness README and update here
    for path in ["/api/command", "/command"]:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{OPENHARNESS_URL}{path}",
                    json={"cmd": cmd},
                )
                if resp.status_code < 400:
                    return {"status": "ok", "forwarded_to": f"{OPENHARNESS_URL}{path}"}
        except httpx.ConnectError:
            pass
        except Exception as e:
            logger.warning("Command forward to %s%s failed: %s", OPENHARNESS_URL, path, e)

    # If OpenHarness unreachable, broadcast the command as an event so the UI still shows it
    await bus.broadcast({
        "source": "openharness",
        "type": "tool_call",
        "agent": "operator",
        "ts": __import__("time").time(),
        "data": {"cmd": cmd, "status": "queued_no_harness"},
    })
    return {"status": "queued", "note": "OpenHarness not reachable; command broadcast to UI only"}
