# Spec Generation Skill

## Purpose
Enables agents to create and manage specifications using BMAD methodology: PRDs, architecture docs, epics, and story files. All output is git-tracked markdown.

## Commands

### Create a PRD
```bash
# Via slash command (interactive)
/create-prd "Build a SaaS for X"

# Via event bus (programmatic)
curl -s -X POST http://localhost:4001/command \
  -H "Content-Type: application/json" \
  -d '{"cmd": "/create-prd \"Build a SaaS for X\""}' \
  | jq .
```

### Generate plan from PRD
```bash
/plan
# Reads most recent docs/prd-*.md
# Outputs docs/architecture-*.md + docs/stories/*.md
```

### Validate a PRD
```bash
/validate-prd docs/prd-{slug}.md
# Returns JSON: {"valid": true/false, "missing_sections": [...], "story_count": N}
```

## PRD Template Structure
```markdown
# {Product Name} — Product Requirements Document

## Vision
{one paragraph}

## Problem
{pain point and target persona}

## Solution
{how it addresses the problem}

## Personas
- **{Name}** ({Role}): {goal}

## User Stories
**US-01 — {title}**
As a {persona}, I can {action} so that {outcome}.
- Acceptance: {criterion 1}
- Acceptance: {criterion 2}
- Acceptance: {criterion 3}

## Non-Functional Requirements
- Performance: {metric}
- Security: {constraint}
- Scalability: {target}

## Technical Constraints
- Stack: {languages, frameworks}
- Integrations: {external services}

## Out of Scope
- {thing 1} — rationale
- {thing 2} — rationale

## Success Metrics
- {KPI 1}: target {value}
- {KPI 2}: target {value}
```

## Story File Format
```yaml
---
id: E{epic_num}-S{story_num}
epic: "{epic title}"
title: "{story title}"
status: ready | in_progress | done | failed
assigned_to: dev-agent
estimated_tokens: 5000
---

## Context
{why this story exists}

## Acceptance Criteria
- [ ] {criterion}

## Technical Notes
{implementation hints}

## Definition of Done
- [ ] Code written and passing tests
- [ ] Committed to workspace
```

## Output Format
All spec-gen commands return JSON when called programmatically:
```json
{
  "command": "/create-prd",
  "status": "complete",
  "output_file": "docs/prd-restaurant-inventory.md",
  "metrics": {
    "sections": 9,
    "user_stories": 7,
    "tokens_used": 3200
  }
}
```

## Examples

### Example 1: Full spec pipeline
```bash
# 1. Create PRD
curl -s -X POST http://localhost:4001/command \
  -d '{"cmd":"/create-prd \"Task management app for remote teams\""}'

# 2. Wait for file_write event showing docs/prd-*.md
# 3. Generate plan
curl -s -X POST http://localhost:4001/command -d '{"cmd":"/plan"}'

# 4. Check stories created
ls docs/stories/ | wc -l  # should be > 0
```

### Example 2: Validate before planning
```bash
# Check PRD has enough stories before spawning architect
story_count=$(grep -c "^\\*\\*US-" docs/prd-*.md | head -1 | cut -d: -f2)
if [ "$story_count" -lt 5 ]; then
  echo '{"error":"insufficient_stories","count":'"$story_count"',"minimum":5}'
  exit 1
fi
echo '{"ok":true,"story_count":'"$story_count"'}'
```
