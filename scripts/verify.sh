#!/usr/bin/env bash
# verify.sh — Health-check all services
# Run after: docker compose --env-file .env.local up -d

set -e
PASS=0
FAIL=0

check() {
  local url=$1 name=$2
  if curl -sf "$url" > /dev/null 2>&1; then
    echo "  OK:   $name"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $name ($url)"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "Software House SaaS — Service Health Check"
echo "─────────────────────────────────────────────"

check "http://localhost:4000"                      "UI                 (localhost:4000)"
check "http://localhost:4001/health"               "Event Bus          (localhost:4001)"
check "http://localhost:4002/health"               "Metering           (localhost:4002)"
check "http://localhost:3001"                      "OpenHarness TUI    (localhost:3001)"
check "http://localhost:18088"                     "HiClaw Element Web (localhost:18088)"
check "http://localhost:18001"                     "Higress Console    (localhost:18001)"
check "http://localhost:8080"                      "AIO Sandbox        (localhost:8080)"
check "http://localhost:9000/minio/health/live"    "MinIO              (localhost:9000)"
check "http://localhost:54323"                     "Supabase Studio    (localhost:54323)"

echo ""

# Verify OpenClaw is NOT externally accessible (should fail / timeout)
echo -n "  Checking OpenClaw is internal-only… "
if curl -s --connect-timeout 2 "http://localhost:3080" > /dev/null 2>&1; then
  echo "SECURITY FAIL: OpenClaw port 3080 is exposed to host!"
  FAIL=$((FAIL + 1))
else
  echo "OK (port 3080 not reachable from host)"
  PASS=$((PASS + 1))
fi

echo ""
echo "─────────────────────────────────────────────"
echo "  Passed: $PASS   Failed: $FAIL"

# Security check — no localhost in service source code
echo ""
echo "Security: Checking for hardcoded localhost in service source…"
LOCALHOST_HITS=$(grep -r "localhost" services/ --include="*.py" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "//.*localhost" | wc -l)
if [ "$LOCALHOST_HITS" -eq 0 ]; then
  echo "  OK:   No hardcoded localhost in services/"
else
  echo "  WARN: Found $LOCALHOST_HITS localhost references in services/ — check manually:"
  grep -r "localhost" services/ --include="*.py" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "//.*localhost" | head -10
fi

echo ""
[ "$FAIL" -eq 0 ] && echo "All checks passed." || echo "$FAIL check(s) failed — see above."
exit $FAIL
