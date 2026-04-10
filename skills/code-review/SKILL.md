# Code Review Skill

## Purpose
Enables agents to review code changes for quality, security, and correctness. Produces structured JSON review objects. All output supports `--json` for machine consumption.

## Security Red Flags
Automatically flag any code containing:
- Hardcoded credentials: API keys, passwords, tokens in source (patterns: `sk-`, `Bearer `, `password =`, `secret =`)
- `localhost` hardcoded in service source code (allowed only in scripts/verify.sh)
- SQL string concatenation (injection risk): `"SELECT " + userInput`
- `eval()` calls with user input
- `os.system()` or `subprocess` with unsanitised input
- Missing authentication on API endpoints
- Secrets in environment variable names that get logged
- `console.log` or `print()` that might output sensitive data

## Commands

### Review a file
```bash
# Review single file for issues
review_file() {
  local file=$1
  # Check for hardcoded secrets
  grep -nE "(sk-ant-|sk-[a-zA-Z0-9]{20,}|password\s*=\s*['\"][^'\"]+['\"]|Bearer [a-zA-Z0-9])" "$file" \
    | jq -Rn '[inputs | {line: (split(":")[0]|tonumber), issue: "hardcoded_secret", content: (split(":")[1:]|join(":"))}]'
}
```

### Generate diff
```bash
# Unified diff between two versions
diff -u old_file.py new_file.py | jq -Rs '{diff: .}'

# Or using git
git diff HEAD -- path/to/file | jq -Rs '{diff: .}'
```

### Full review
```bash
# Review all changed files in workspace
git diff --name-only HEAD | while read f; do
  issues=$(grep -nE "(localhost|hardcoded|TODO|FIXME|sk-ant-)" "$f" 2>/dev/null | wc -l)
  echo '{"file":"'"$f"'","issue_count":'"$issues"'}'
done | jq -s '{"files": .}'
```

## Output Format
Reviews return a structured JSON object:
```json
{
  "review_id": "uuid",
  "file": "path/to/file.py",
  "status": "pass | warn | fail",
  "issues": [
    {
      "line": 42,
      "severity": "critical | warn | info",
      "type": "hardcoded_secret | localhost_ref | injection_risk | missing_auth | style",
      "message": "human-readable description",
      "snippet": "the offending code"
    }
  ],
  "summary": "one sentence summary"
}
```

## Examples

### Example 1: Check for localhost in service source
```bash
grep -rn "localhost" services/ --include="*.py" --include="*.ts" --include="*.tsx" \
  | jq -Rs '
    split("\n") |
    map(select(length > 0)) |
    map(split(":") | {file: .[0], line: .[1], content: (.[2:]|join(":"))}) |
    {
      "check": "no_localhost_in_source",
      "violations": .,
      "passed": (length == 0)
    }
  '
```

### Example 2: Security scan before commit
```bash
scan_result=$(grep -rn \
  -e "sk-ant-" \
  -e "password\s*=" \
  -e "secret\s*=" \
  services/ agents/ --include="*.py" --include="*.ts" 2>/dev/null | wc -l)

echo '{"security_scan":"complete","violations":'"$scan_result"',"passed":'"$([ $scan_result -eq 0 ] && echo true || echo false)"'}'
```
