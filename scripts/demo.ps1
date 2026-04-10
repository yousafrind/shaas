# demo.ps1 — VC demo sequence for Windows
# Run after verify.ps1 passes

param(
    [string]$Brief = "Build a B2B SaaS for restaurant inventory management"
)

$EventBus = "http://localhost:4001"

function SendCommand($cmd) {
    $body = @{ cmd = $cmd } | ConvertTo-Json
    try {
        $r = Invoke-RestMethod -Uri "$EventBus/command" -Method Post `
            -ContentType "application/json" -Body $body -ErrorAction Stop
        Write-Host "  Sent: $cmd" -ForegroundColor Cyan
    } catch {
        Write-Host "  Warning: command may not have reached OpenHarness" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          Software House SaaS — VC Demo                      ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Brief: `"$Brief`""
Write-Host ""

# Check event bus
try {
    Invoke-RestMethod -Uri "$EventBus/health" -ErrorAction Stop | Out-Null
} catch {
    Write-Host "ERROR: Event bus not reachable at $EventBus" -ForegroundColor Red
    Write-Host "Run: docker compose --env-file .env.local up -d"
    exit 1
}

Write-Host "Step 1: Generating PRD..."
SendCommand "/create-prd `"$Brief`""
Write-Host "  Waiting for PM agent (~30s)..."
Start-Sleep -Seconds 30

Write-Host ""
Write-Host "Step 2: Generating plan..."
SendCommand "/plan"
Write-Host "  Waiting for Architect agent (~15s)..."
Start-Sleep -Seconds 15

Write-Host ""
Write-Host "Step 3: Starting autonomous execution..."
SendCommand "/go"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  Demo running autonomously.                                 ║" -ForegroundColor Green
Write-Host "║                                                             ║" -ForegroundColor Green
Write-Host "║  Watch live:  http://localhost:4000                         ║" -ForegroundColor Green
Write-Host "║  Metrics:     http://localhost:54323                        ║" -ForegroundColor Green
Write-Host "║  MinIO:       http://localhost:9001                         ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Green
