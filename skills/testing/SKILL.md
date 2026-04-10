# Testing Skill

## Purpose
Enables agents to run automated tests, interpret results, and write structured test reports. Supports Python (pytest) and JavaScript (Jest/Vitest). All commands support `--json` for machine-readable output.

## Commands

### Python — pytest
```bash
# Run all tests with JSON report
cd /workspace && python -m pytest tests/ \
  --json-report \
  --json-report-file=/tmp/pytest-report.json \
  -v \
  --tb=short \
  2>&1

# Read report
cat /tmp/pytest-report.json | jq '{
  passed: .summary.passed,
  failed: .summary.failed,
  errors: .summary.error,
  total: .summary.total,
  failures: [.tests[] | select(.outcome == "failed") | {name: .nodeid, message: .call.longrepr}]
}'
```

### JavaScript — Jest
```bash
# Run Jest with JSON output
cd /workspace && npx jest --json --outputFile=/tmp/jest-report.json 2>&1

# Read report
cat /tmp/jest-report.json | jq '{
  passed: .numPassedTests,
  failed: .numFailedTests,
  total: .numTotalTests,
  failures: [.testResults[] | .assertionResults[] | select(.status == "failed") | {name: .fullName, message: (.failureMessages | join(" "))}]
}'
```

### JavaScript — Vitest
```bash
cd /workspace && npx vitest run --reporter=json > /tmp/vitest-report.json 2>&1
cat /tmp/vitest-report.json | jq '{passed: .numPassedTests, failed: .numFailedTests}'
```

## Exit Code Interpretation
| Exit Code | Meaning |
|-----------|---------|
| 0 | All tests passed |
| 1 | Some tests failed |
| 2 | Test collection error (syntax/import error) |
| 3 | Internal error in test runner |
| 5 (pytest) | No tests collected — check test discovery config |

## Test Report Writing
After running tests, write to `docs/test-reports/{story_id}.md`:

```bash
write_test_report() {
  local story_id=$1
  local status=$2  # pass or fail
  local report_json=$3

  passed=$(echo "$report_json" | jq -r '.passed')
  failed=$(echo "$report_json" | jq -r '.failed')
  total=$(echo "$report_json" | jq -r '.total')

  cat > "docs/test-reports/${story_id}.md" << EOF
---
story_id: ${story_id}
status: ${status}
tested_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)
tests_run: ${total}
tests_passed: ${passed}
tests_failed: ${failed}
---

## Summary
Ran ${total} tests for story ${story_id}. ${passed} passed, ${failed} failed.

## Failed Tests
$(echo "$report_json" | jq -r '.failures[] | "- **\(.name)**: \(.message)"')
EOF
}
```

## Output Format
All test commands return structured JSON:
```json
{
  "story_id": "E1-S2",
  "status": "pass | fail",
  "tests_run": 12,
  "tests_passed": 12,
  "tests_failed": 0,
  "failures": [],
  "report_file": "docs/test-reports/E1-S2.md"
}
```

## Examples

### Example 1: Run tests and emit result
```bash
cd /workspace && python -m pytest tests/ --json-report --json-report-file=/tmp/r.json -q
exit_code=$?
result=$(cat /tmp/r.json | jq '{passed:.summary.passed,failed:.summary.failed,total:.summary.total}')
status=$([ $exit_code -eq 0 ] && echo "pass" || echo "fail")
echo '{"story_id":"E1-S1","status":"'"$status"'","result":'"$result"'}'
```

### Example 2: Check if tests exist before running
```bash
test_count=$(find /workspace/tests -name "test_*.py" -o -name "*_test.py" 2>/dev/null | wc -l)
if [ "$test_count" -eq 0 ]; then
  echo '{"error":"no_tests_found","path":"/workspace/tests","recommendation":"Create test files matching test_*.py pattern"}'
  exit 1
fi
echo '{"tests_found":'"$test_count"'}'
```
