# Master Skill Index

Skills are markdown files that define reusable capabilities for agents. They are mounted into AIO Sandbox at `$AIO_SKILLS_PATH` and registered at startup.

## How Skills Work
1. At startup, agents read this index file
2. Load needed skills: `/skill add {skill_id}`
3. AIO Sandbox registers the skill via `POST /v1/skills/register {"skill_id": "...", "skill_md": "..."}`
4. Skill capabilities become available in the current session

## Available Skills

| Skill ID | Path | Description |
|----------|------|-------------|
| `devops` | `devops/SKILL.md` | Docker, process management, health checks, volume backup |
| `spec-gen` | `spec-gen/SKILL.md` | BMAD command patterns, PRD templates, story file format |
| `code-review` | `code-review/SKILL.md` | Diff patterns, security red flags, structured review output |
| `testing` | `testing/SKILL.md` | pytest/jest invocation, exit code interpretation, test reports |

## Adding a New Skill
1. Create `skills/{skill-id}/SKILL.md`
2. Add a row to the table above
3. Commit: `/commit "Add skill: {skill-id}"`
4. Register in running session: `/skill add {skill-id}`

## Skill File Format
Each SKILL.md must contain:
- `## Purpose` — what this skill enables
- `## Commands` — available commands with `--json` output format
- `## Examples` — at least 2 worked examples
- `## Output Format` — the JSON schema for machine-readable output
