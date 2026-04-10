# setup.ps1 - Windows 11 + Docker Desktop setup script
# Run from the repo root in PowerShell (as regular user, not admin)
# Prerequisite: Docker Desktop must be running before running this script
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
#
# Optional flags:
#   -SkipVendor   : skip cloning vendor repos
#   -SkipSupabase : skip Supabase start and migration
#   -SkipImages   : skip docker pull

param(
    [switch]$SkipVendor,
    [switch]$SkipSupabase,
    [switch]$SkipImages
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Log($msg)  { Write-Host "[setup] $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  OK:   $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  WARN: $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "  FAIL: $msg" -ForegroundColor Red; exit 1 }

# ------------------------------------------------------------------
# Step 1: Check prerequisites
# ------------------------------------------------------------------
Log "Step 1: Checking prerequisites..."

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail "Docker not found. Install Docker Desktop: https://www.docker.com/products/docker-desktop"
}
$dockerInfo = docker info 2>&1
if ($dockerInfo -notmatch "Server Version") {
    Fail "Docker Desktop is not running. Start it from the system tray and retry."
}
Ok "Docker Desktop running"

$nodeVer = node --version 2>&1
if ($nodeVer -notmatch "v(\d+)" -or [int]$Matches[1] -lt 20) {
    Fail "Node 20+ required. Install from https://nodejs.org  (found: $nodeVer)"
}
Ok "Node $nodeVer"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Fail "Git not found. Install from https://git-scm.com"
}
Ok "Git available"

# ------------------------------------------------------------------
# Step 2: Clone vendor repos
# ------------------------------------------------------------------
if ($SkipVendor) {
    Log "Step 2: Skipping vendor clone (flag set)"
} else {
    Log "Step 2: Cloning vendor repos..."
    New-Item -ItemType Directory -Force -Path "vendor" | Out-Null

    $repos = @(
        [PSCustomObject]@{ Url = "https://github.com/HKUDS/OpenHarness.git";    Dir = "vendor\OpenHarness" },
        [PSCustomObject]@{ Url = "https://github.com/agentscope-ai/HiClaw.git"; Dir = "vendor\HiClaw" },
        [PSCustomObject]@{ Url = "https://github.com/openclaw/openclaw.git";     Dir = "vendor\openclaw" },
        [PSCustomObject]@{ Url = "https://github.com/HKUDS/CLI-Anything.git";   Dir = "vendor\CLI-Anything" }
    )

    foreach ($r in $repos) {
        if (Test-Path "$($r.Dir)\.git") {
            Ok "$($r.Dir) already cloned"
        } else {
            Log "  Cloning $($r.Url)..."
            git clone $r.Url $r.Dir
        }
    }
    Ok "Vendor repos ready"
}

# ------------------------------------------------------------------
# Step 3: Create OpenHarness Dockerfile if missing
# ------------------------------------------------------------------
Log "Step 3: Checking OpenHarness Dockerfile..."
$ohDockerfile = "vendor\OpenHarness\Dockerfile"

if (-not (Test-Path $ohDockerfile)) {
    Log "  Creating $ohDockerfile..."
    # Note: here-string closing marker must be at column 0
    $dockerfileContent = @'
FROM python:3.11-slim
RUN pip install --no-cache-dir uv
WORKDIR /app
COPY . .
RUN uv sync --extra dev || pip install --no-cache-dir -e ".[dev]" || true
EXPOSE 3001
CMD ["uv", "run", "oh", "--output-format", "stream-json"]
'@
    $dockerfileContent | Set-Content -Path $ohDockerfile -Encoding UTF8
    Ok "Dockerfile created"
} else {
    Ok "Dockerfile already exists"
}

# ------------------------------------------------------------------
# Step 4: Write OpenHarness metering hook
# ------------------------------------------------------------------
Log "Step 4: Writing OpenHarness hooks\hooks.json..."
New-Item -ItemType Directory -Force -Path "vendor\OpenHarness\hooks" | Out-Null

$hooksContent = @'
{
  "PostToolUse": [
    {
      "matcher": "LLMCall",
      "command": "curl -sf -X POST ${METERING_EMIT_ENDPOINT}/events/token -H \"Content-Type: application/json\" -d \"{\\\"agent_id\\\":\\\"${AGENT_ID}\\\",\\\"agent_name\\\":\\\"${AGENT_NAME}\\\",\\\"model\\\":\\\"${MODEL}\\\",\\\"tokens_in\\\":${TOKENS_IN},\\\"tokens_out\\\":${TOKENS_OUT}}\""
    }
  ]
}
'@
$hooksContent | Set-Content -Path "vendor\OpenHarness\hooks\hooks.json" -Encoding UTF8
Ok "hooks.json written"

# ------------------------------------------------------------------
# Step 5: Supabase setup
# ------------------------------------------------------------------
if ($SkipSupabase) {
    Log "Step 5: Skipping Supabase (flag set)"
} else {
    Log "Step 5: Setting up Supabase..."

    if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
        Log "  Installing Supabase CLI via npm..."
        npm install -g supabase
    }
    Ok "Supabase CLI available"

    # Init if needed
    if (-not (Test-Path "supabase\config.toml") -and -not (Test-Path ".supabase\config.toml")) {
        supabase init 2>&1 | Out-Null
    }

    # Start Supabase
    $supaStatus = supabase status 2>&1 | Out-String
    if ($supaStatus -match "API URL") {
        Ok "Supabase already running"
    } else {
        Log "  Starting Supabase (takes 2-3 min on first run)..."
        supabase start
        $supaStatus = supabase status 2>&1 | Out-String
    }

    # Extract keys
    $apiUrl     = if ($supaStatus -match "API URL:\s+(\S+)")         { $Matches[1] } else { "" }
    $anonKey    = if ($supaStatus -match "anon key:\s+(\S+)")        { $Matches[1] } else { "" }
    $serviceKey = if ($supaStatus -match "service_role key:\s+(\S+)"){ $Matches[1] } else { "" }
    $studioUrl  = if ($supaStatus -match "Studio URL:\s+(\S+)")      { $Matches[1] } else { "http://localhost:54323" }

    if ($apiUrl -and (Test-Path ".env.local")) {
        $env = Get-Content ".env.local" -Raw
        $env = $env -replace "(?m)^SUPABASE_URL=.*",         "SUPABASE_URL=$apiUrl"
        $env = $env -replace "(?m)^SUPABASE_ANON_KEY=.*",    "SUPABASE_ANON_KEY=$anonKey"
        $env = $env -replace "(?m)^SUPABASE_SERVICE_KEY=.*", "SUPABASE_SERVICE_KEY=$serviceKey"
        [System.IO.File]::WriteAllText("$RepoRoot\.env.local", $env)
        Ok "Supabase keys written to .env.local"
    }

    Log "  Applying migrations..."
    supabase db push 2>&1 | Out-Null
    Ok "Migrations applied. Studio: $studioUrl"
}

# ------------------------------------------------------------------
# Step 6: Create .env.local
# ------------------------------------------------------------------
Log "Step 6: Checking .env.local..."
if (-not (Test-Path ".env.local")) {
    Copy-Item ".env.example" ".env.local"
    Ok "Created .env.local from .env.example"
    Warn "Edit .env.local and set OPENAI_API_KEY=sk-... before running docker compose"
} else {
    Ok ".env.local already exists"
}

# ------------------------------------------------------------------
# Step 7: Pull Docker images
# ------------------------------------------------------------------
if ($SkipImages) {
    Log "Step 7: Skipping image pull (flag set)"
} else {
    Log "Step 7: Pulling Docker images..."

    $images = @(
        "minio/minio:latest",
        "minio/mc:latest",
        "ghcr.io/agent-infra/sandbox:latest"
    )
    foreach ($img in $images) {
        Log "  Pulling $img..."
        docker pull $img
        if ($LASTEXITCODE -ne 0) { Warn "Could not pull $img" }
    }

    Log "  Pulling HiClaw manager image..."
    docker pull ghcr.io/agentscope-ai/hiclaw-manager:latest 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Warn "HiClaw image not found. Check https://github.com/agentscope-ai/HiClaw for the correct image name."
    }

    Log "  Pulling OpenClaw image..."
    docker pull ghcr.io/openclaw/openclaw:latest 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Warn "OpenClaw image not found" }

    Ok "Image pull complete"
}

# ------------------------------------------------------------------
# Step 8: Build custom services
# ------------------------------------------------------------------
Log "Step 8: Building custom services..."
if (Test-Path ".env.local") {
    docker compose --env-file .env.local build event-bus metering ui
    if ($LASTEXITCODE -ne 0) { Warn "Build had errors - check output above" }
    Ok "Custom services built"
} else {
    Warn "No .env.local found - run again after creating it"
}

# ------------------------------------------------------------------
# Done
# ------------------------------------------------------------------
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host ""
Write-Host "  1. Edit .env.local  ->  set OPENAI_API_KEY=sk-..." -ForegroundColor White
Write-Host ""
Write-Host "  2. Start the stack:" -ForegroundColor White
Write-Host "     docker compose --env-file .env.local up -d" -ForegroundColor Yellow
Write-Host ""
Write-Host "  3. Verify:" -ForegroundColor White
Write-Host "     powershell -ExecutionPolicy Bypass -File scripts\verify.ps1" -ForegroundColor Yellow
Write-Host ""
Write-Host "  4. Open: http://localhost:4000" -ForegroundColor Yellow
Write-Host ""
