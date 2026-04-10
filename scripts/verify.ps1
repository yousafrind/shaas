# verify.ps1 — Health-check all services on Windows
# Run after: docker compose --env-file .env.local up -d

$pass = 0
$fail = 0

function Check($url, $name) {
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        Write-Host "  OK:   $name" -ForegroundColor Green
        $script:pass++
    } catch {
        Write-Host "  FAIL: $name ($url)" -ForegroundColor Red
        $script:fail++
    }
}

Write-Host ""
Write-Host "Software House SaaS — Service Health Check" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────"

Check "http://localhost:4000"                   "UI                 (localhost:4000)"
Check "http://localhost:4001/health"            "Event Bus          (localhost:4001)"
Check "http://localhost:4002/health"            "Metering           (localhost:4002)"
Check "http://localhost:3001"                   "OpenHarness TUI    (localhost:3001)"
Check "http://localhost:18088"                  "HiClaw Element Web (localhost:18088)"
Check "http://localhost:18001"                  "Higress Console    (localhost:18001)"
Check "http://localhost:8080"                   "AIO Sandbox        (localhost:8080)"
Check "http://localhost:9000/minio/health/live" "MinIO              (localhost:9000)"
Check "http://localhost:54323"                  "Supabase Studio    (localhost:54323)"

Write-Host ""

# Verify OpenClaw is NOT reachable from host
Write-Host -NoNewline "  Checking OpenClaw is internal-only... "
try {
    Invoke-WebRequest -Uri "http://localhost:3080" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop | Out-Null
    Write-Host "SECURITY FAIL: OpenClaw port 3080 is exposed!" -ForegroundColor Red
    $fail++
} catch {
    Write-Host "OK (port 3080 not reachable from host)" -ForegroundColor Green
    $pass++
}

Write-Host ""
Write-Host "─────────────────────────────────────────────"
Write-Host "  Passed: $pass   Failed: $fail"

# Check for hardcoded localhost in service source
Write-Host ""
Write-Host "Security: Checking for hardcoded localhost in service source..."
$hits = Get-ChildItem -Path "services" -Recurse -Include "*.py","*.ts","*.tsx" -ErrorAction SilentlyContinue |
    Select-String -Pattern "localhost" -SimpleMatch |
    Where-Object { $_.Line -notmatch "^\s*//" }

if ($hits.Count -eq 0) {
    Write-Host "  OK:   No hardcoded localhost in services/" -ForegroundColor Green
} else {
    Write-Host "  WARN: Found $($hits.Count) localhost reference(s) in services/ — check manually:" -ForegroundColor Yellow
    $hits | Select-Object -First 10 | ForEach-Object { Write-Host "    $($_.Filename):$($_.LineNumber)  $($_.Line.Trim())" }
}

Write-Host ""
if ($fail -eq 0) {
    Write-Host "All checks passed." -ForegroundColor Green
} else {
    Write-Host "$fail check(s) failed — see above." -ForegroundColor Red
    exit 1
}
