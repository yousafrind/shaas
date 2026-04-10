#!/usr/bin/env bash
# demo.sh — VC demo sequence
# Runs the full pipeline autonomously: PRD → plan → execute
# Prerequisites: docker compose up, all services healthy (run verify.sh first)

set -e

EVENT_BUS="http://localhost:4001"
BRIEF="${1:-Build a B2B SaaS for restaurant inventory management}"

cmd() {
  curl -s -X POST "${EVENT_BUS}/command" \
    -H "Content-Type: application/json" \
    -d "{\"cmd\": \"$1\"}" | grep -q "ok" && echo "  Sent: $1" || echo "  Warning: command may not have reached OpenHarness"
}

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          Software House SaaS — VC Demo                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Brief: \"${BRIEF}\""
echo ""

# Verify event bus is reachable before starting
if ! curl -sf "${EVENT_BUS}/health" > /dev/null 2>&1; then
  echo "ERROR: Event bus not reachable at ${EVENT_BUS}"
  echo "Run: docker compose --env-file .env.local up -d"
  exit 1
fi

echo "Step 1: Generating PRD…"
cmd "/create-prd \"${BRIEF}\""
echo "  Waiting for PM agent to draft PRD (~30-60s)…"
sleep 30

echo ""
echo "Step 2: Generating plan (epics + stories)…"
cmd "/plan"
echo "  Waiting for Architect agent (~15s)…"
sleep 15

echo ""
echo "Step 3: Starting autonomous execution…"
cmd "/go"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Demo running autonomously.                                 ║"
echo "║                                                             ║"
echo "║  Watch live at:  http://localhost:4000                      ║"
echo "║  Metrics at:     http://localhost:54323  (Supabase Studio)  ║"
echo "║  MinIO at:       http://localhost:9001                      ║"
echo "║                                                             ║"
echo "║  Tab 1: PRD should appear in doc pane within 3 minutes      ║"
echo "║  Tab 2: Agent events streaming in activity feed             ║"
echo "║  Studio: token_events rows accumulating in real time        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
