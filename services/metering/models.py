from dataclasses import dataclass, field
from datetime import datetime, UTC
from typing import Literal


@dataclass
class TokenEvent:
    """One LLM call. Written on every agent API response."""
    org_id: str
    agent_id: str
    agent_name: str
    model: str
    tokens_in: int
    tokens_out: int
    cost_usd_est: float
    task_id: str | None = None
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class SeatEvent:
    """Written when a user joins or leaves an org."""
    org_id: str
    user_id: str
    event_type: Literal["invite_accepted", "seat_removed"]
    timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class AgentRunLog:
    """One agent task execution, from spawn to exit."""
    org_id: str
    agent_id: str
    agent_name: str
    task_id: str
    story_id: str | None
    started_at: datetime
    ended_at: datetime | None = None
    exit_code: int | None = None
    tokens_total: int = 0
    cost_usd_est: float = 0.0
    status: Literal["running", "complete", "failed", "rejected"] = "running"
