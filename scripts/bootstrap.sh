#!/usr/bin/env bash
# bootstrap.sh — Full setup from scratch
# Run once on a fresh machine. Re-running is safe (idempotent).
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ── Windows detection ─────────────────────────────────────────────
# On Windows, prefer the PowerShell script which handles Windows paths
# and registry correctly. This bash script works fine in Git Bash or WSL2.
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
  echo "[bootstrap] Detected Windows (Git Bash / Cygwin)"
  echo "[bootstrap] Tip: You can also run the native PowerShell version:"
  echo "            powershell -ExecutionPolicy Bypass -File scripts\\setup.ps1"
  echo "[bootstrap] Continuing with bash version..."
  echo ""
fi

log() { echo "[bootstrap] $*"; }
fail() { echo "[bootstrap] FAIL: $*" >&2; exit 1; }

# ── Step 1: Check prerequisites ───────────────────────────────────
log "Step 1: Checking prerequisites…"

DOCKER_VERSION=$(docker version --format '{{.Server.Version}}' 2>/dev/null | cut -d. -f1)
[ "${DOCKER_VERSION:-0}" -ge 24 ] || fail "Docker 24+ required (found: $DOCKER_VERSION)"

docker compose version > /dev/null 2>&1 || fail "docker compose plugin required (got none)"

# Primary model: OpenAI gpt-4o-mini (OPENAI_API_KEY required)
PYTHON_OK=$(python3 -c "import sys; print('ok' if sys.version_info >= (3,11) else 'fail')" 2>/dev/null || echo "fail")
[ "$PYTHON_OK" = "ok" ] || fail "Python 3.11+ required"

NODE_VERSION=$(node --version 2>/dev/null | tr -d 'v' | cut -d. -f1)
[ "${NODE_VERSION:-0}" -ge 20 ] || fail "Node 20+ required (found: $NODE_VERSION)"

git --version > /dev/null 2>&1 || fail "git required"
npm --version > /dev/null 2>&1 || fail "npm required"

log "Step 1: Prerequisites OK"

# ── Step 2: Clone vendor repos ────────────────────────────────────
log "Step 2: Cloning vendor repos…"
mkdir -p vendor && cd vendor

clone_if_missing() {
  local repo=$1 dir=$2
  if [ -d "$dir/.git" ]; then
    log "  $dir already cloned — skipping"
  else
    git clone "$repo" "$dir"
  fi
}

clone_if_missing "https://github.com/HKUDS/OpenHarness.git"    OpenHarness
clone_if_missing "https://github.com/agentscope-ai/HiClaw.git" HiClaw
clone_if_missing "https://github.com/openclaw/openclaw.git"     openclaw
clone_if_missing "https://github.com/HKUDS/CLI-Anything.git"   CLI-Anything

cd "$REPO_ROOT"
log "Step 2: Vendor repos ready"

# ── Step 3: Create OpenHarness Dockerfile if missing ──────────────
log "Step 3: Checking OpenHarness Dockerfile…"
if [ ! -f vendor/OpenHarness/Dockerfile ]; then
  log "  Creating vendor/OpenHarness/Dockerfile…"
  cat > vendor/OpenHarness/Dockerfile << 'EOF'
FROM python:3.11-slim
RUN pip install --no-cache-dir uv
WORKDIR /app
COPY . .
RUN uv sync --extra dev 2>/dev/null || pip install --no-cache-dir -e ".[dev]" || true
EXPOSE 3001
CMD ["uv", "run", "oh", "--output-format", "stream-json"]
EOF
else
  log "  Dockerfile already exists — skipping"
fi
log "Step 3: OpenHarness Dockerfile ready"

# ── Step 4: Create OpenHarness metering hook ──────────────────────
log "Step 4: Writing OpenHarness hooks/hooks.json…"
mkdir -p vendor/OpenHarness/hooks
cat > vendor/OpenHarness/hooks/hooks.json << 'EOF'
{
  "PostToolUse": [
    {
      "matcher": "LLMCall",
      "command": "curl -sf -X POST ${METERING_EMIT_ENDPOINT}/events/token -H 'Content-Type: application/json' -d '{\"agent_id\":\"${AGENT_ID}\",\"agent_name\":\"${AGENT_NAME}\",\"model\":\"${MODEL}\",\"tokens_in\":${TOKENS_IN},\"tokens_out\":${TOKENS_OUT}}'"
    }
  ]
}
EOF
log "Step 4: hooks.json written"

# ── Step 5: Install BMAD spec-gen ─────────────────────────────────
log "Step 5: Installing BMAD…"
if command -v bmad > /dev/null 2>&1; then
  log "  BMAD already installed — skipping"
else
  npx bmad-method@latest install --yes 2>/dev/null || log "  BMAD install skipped (run manually if needed)"
fi
log "Step 5: BMAD done"

# ── Step 6: Supabase setup ────────────────────────────────────────
log "Step 6: Setting up Supabase…"
if ! command -v supabase > /dev/null 2>&1; then
  log "  Installing Supabase CLI…"
  npm install -g supabase
fi

# Init if not already done
if [ ! -f .supabase/config.toml ] && [ ! -f supabase/config.toml ]; then
  supabase init 2>/dev/null || true
fi

# Start Supabase (skip if already running)
if supabase status 2>/dev/null | grep -q "API URL"; then
  log "  Supabase already running"
else
  log "  Starting Supabase (this may take 2-3 minutes on first run)…"
  supabase start
fi

# Extract keys
SUPA_URL=$(supabase status 2>/dev/null | grep "API URL" | awk '{print $NF}' | tr -d '[:space:]')
SUPA_ANON=$(supabase status 2>/dev/null | grep "anon key" | awk '{print $NF}' | tr -d '[:space:]')
SUPA_SERVICE=$(supabase status 2>/dev/null | grep "service_role key" | awk '{print $NF}' | tr -d '[:space:]')

# Write to .env.local if keys are available
if [ -n "$SUPA_URL" ] && [ -f .env.local ]; then
  # Replace or append Supabase keys
  grep -v "^SUPABASE_URL=" .env.local > .env.local.tmp
  grep -v "^SUPABASE_ANON_KEY=" .env.local.tmp > .env.local
  grep -v "^SUPABASE_SERVICE_KEY=" .env.local > .env.local.tmp
  mv .env.local.tmp .env.local

  echo "SUPABASE_URL=${SUPA_URL}" >> .env.local
  echo "SUPABASE_ANON_KEY=${SUPA_ANON}" >> .env.local
  echo "SUPABASE_SERVICE_KEY=${SUPA_SERVICE}" >> .env.local
  log "  Supabase keys written to .env.local"
fi

# Apply migrations
log "  Applying migrations…"
supabase db push 2>/dev/null || supabase migration up 2>/dev/null || log "  Migration push skipped — run 'supabase db push' manually"
log "Step 6: Supabase ready — Studio: http://localhost:54323"

# ── Step 7: Copy .env.local template ─────────────────────────────
log "Step 7: Checking .env.local…"
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  log "  Created .env.local from .env.example"
  log "  !! IMPORTANT: Edit .env.local and fill in ANTHROPIC_API_KEY at minimum !!"
else
  log "  .env.local already exists — skipping"
fi

# ── Step 8: Verify Docker images ──────────────────────────────────
log "Step 8: Pulling Docker images…"

pull_image() {
  local img=$1
  log "  Pulling $img…"
  if docker pull "$img" 2>&1 | grep -q "Error\|not found"; then
    log "  WARNING: Could not pull $img — check image name/registry access"
  fi
}

pull_image "minio/minio:latest"
pull_image "minio/mc:latest"
pull_image "ghcr.io/agent-infra/sandbox:latest"

# HiClaw — warn loudly if missing
log "  Pulling ghcr.io/agentscope-ai/hiclaw-manager:latest…"
if ! docker pull "ghcr.io/agentscope-ai/hiclaw-manager:latest" 2>/dev/null; then
  log "  WARNING: HiClaw image not found — docker compose will fail on this service"
  log "  Check https://github.com/agentscope-ai/HiClaw for correct image name"
fi

# OpenClaw — warn if missing
log "  Pulling ghcr.io/openclaw/openclaw:latest…"
if ! docker pull "ghcr.io/openclaw/openclaw:latest" 2>/dev/null; then
  log "  WARNING: OpenClaw image not found — docker compose will fail on this service"
fi

log "Step 8: Image pull complete"

# ── Step 9: Build custom services ─────────────────────────────────
log "Step 9: Building custom services…"
if [ -f .env.local ]; then
  docker compose --env-file .env.local build event-bus metering ui || log "  Build had errors — check output above"
else
  log "  No .env.local found — skipping build (run after filling .env.local)"
fi
log "Step 9: Build complete"

# ── Done ──────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║              Bootstrap complete!                            ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  1. Edit .env.local — fill in ANTHROPIC_API_KEY             ║"
echo "║  2. Optionally add TELEGRAM_BOT_TOKEN                       ║"
echo "║  3. Run:                                                    ║"
echo "║     docker compose --env-file .env.local up -d              ║"
echo "║  4. Verify:                                                 ║"
echo "║     ./scripts/verify.sh                                     ║"
echo "║  5. Open: http://localhost:4000                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
