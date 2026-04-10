import os
import uuid
from datetime import datetime, UTC

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client

from rates import estimate_cost

# ── Supabase client ────────────────────────────────────────────────
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
DEFAULT_ORG_ID = os.environ.get("ORG_ID", "default")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI(title="Metering Service", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"])


# ── Request models ─────────────────────────────────────────────────

class TokenEventRequest(BaseModel):
    agent_id: str
    agent_name: str
    model: str
    tokens_in: int
    tokens_out: int
    cost_usd_est: float | None = None
    task_id: str | None = None
    org_id: str | None = None


class SeatEventRequest(BaseModel):
    user_id: str
    event_type: str  # invite_accepted | seat_removed
    org_id: str | None = None


class AgentRunStartRequest(BaseModel):
    agent_id: str
    agent_name: str
    task_id: str
    story_id: str | None = None
    org_id: str | None = None


class AgentRunEndRequest(BaseModel):
    run_id: str
    exit_code: int | None = None
    tokens_total: int = 0
    cost_usd_est: float = 0.0
    status: str = "complete"  # complete | failed | rejected


# ── Helpers ────────────────────────────────────────────────────────

def _resolve_org(org_id: str | None) -> str:
    """Use provided org_id or fall back to the default Phase 0 org."""
    if org_id:
        return org_id
    # Phase 0 default org UUID (inserted in migration 001)
    return "00000000-0000-0000-0000-000000000001"


# ── Endpoints ──────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/events/token")
def record_token_event(req: TokenEventRequest):
    """Record one LLM call. Auto-computes cost if not provided."""
    cost = req.cost_usd_est
    if cost is None:
        cost = estimate_cost(req.model, req.tokens_in, req.tokens_out)

    row = {
        "org_id": _resolve_org(req.org_id),
        "agent_id": req.agent_id,
        "agent_name": req.agent_name,
        "model": req.model,
        "tokens_in": req.tokens_in,
        "tokens_out": req.tokens_out,
        "cost_usd_est": cost,
        "task_id": req.task_id,
        "created_at": datetime.now(UTC).isoformat(),
    }
    result = supabase.table("token_events").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to insert token event")
    return {"status": "ok", "id": result.data[0]["id"]}


@app.post("/events/seat")
def record_seat_event(req: SeatEventRequest):
    """Record a seat join or leave event."""
    if req.event_type not in ("invite_accepted", "seat_removed"):
        raise HTTPException(status_code=400, detail="Invalid event_type")

    row = {
        "org_id": _resolve_org(req.org_id),
        "user_id": req.user_id,
        "event_type": req.event_type,
        "created_at": datetime.now(UTC).isoformat(),
    }
    result = supabase.table("seat_events").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to insert seat event")
    return {"status": "ok", "id": result.data[0]["id"]}


@app.post("/events/agent-run/start")
def start_agent_run(req: AgentRunStartRequest):
    """Create an agent_run_logs row when an agent task begins."""
    run_id = str(uuid.uuid4())
    row = {
        "id": run_id,
        "org_id": _resolve_org(req.org_id),
        "agent_id": req.agent_id,
        "agent_name": req.agent_name,
        "task_id": req.task_id,
        "story_id": req.story_id,
        "started_at": datetime.now(UTC).isoformat(),
        "status": "running",
    }
    result = supabase.table("agent_run_logs").insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create run log")
    return {"status": "ok", "run_id": run_id}


@app.post("/events/agent-run/end")
def end_agent_run(req: AgentRunEndRequest):
    """Update an agent_run_logs row when a task completes."""
    update = {
        "ended_at": datetime.now(UTC).isoformat(),
        "exit_code": req.exit_code,
        "tokens_total": req.tokens_total,
        "cost_usd_est": req.cost_usd_est,
        "status": req.status,
    }
    result = (
        supabase.table("agent_run_logs")
        .update(update)
        .eq("id", req.run_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"status": "ok"}


@app.get("/summary")
def get_summary(org_id: str | None = None):
    """Return today's usage summary for an org."""
    resolved = _resolve_org(org_id)

    # Token summary from view
    tokens_result = (
        supabase.table("daily_token_summary")
        .select("total_tokens,total_cost_usd,call_count")
        .eq("org_id", resolved)
        .execute()
    )
    today_rows = tokens_result.data or []
    tokens_today = sum(r.get("total_tokens", 0) or 0 for r in today_rows)
    cost_est = sum(float(r.get("total_cost_usd", 0) or 0) for r in today_rows)

    # Active seats
    seats_result = (
        supabase.table("active_seats")
        .select("seat_count")
        .eq("org_id", resolved)
        .execute()
    )
    seats = seats_result.data[0]["seat_count"] if seats_result.data else 0

    # Runs today
    runs_result = (
        supabase.table("agent_run_logs")
        .select("id", count="exact")
        .eq("org_id", resolved)
        .execute()
    )
    runs_today = runs_result.count or 0

    return {
        "org_id": resolved,
        "seats": seats,
        "tokens_today": tokens_today,
        "runs_today": runs_today,
        "cost_est": round(cost_est, 6),
    }
