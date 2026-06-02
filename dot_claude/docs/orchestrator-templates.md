# Orchestrator planning-doc templates

Referenced from `CLAUDE.md`. Load on demand — only when creating a slice folder. Not needed every turn.

## SCOPE.md (optional, major slices)

```markdown
# Scope: <slice title>

## In scope
- <thing>

## Out of scope (do NOT touch)
- <thing>

## Non-goals
- <explicitly not solving X yet>

## Constraints
- <perf budget, API compat, security requirement, etc.>

## Open scope questions
- <question for user>
```

## IMPLEMENTATION.md (recommended)

```markdown
# Implementation: <slice title>

## Why
<reason this slice exists, business/technical motivation>

## Approach
<high-level approach — the "how" in 1–3 paragraphs>

## Key decisions
- <decision> — <why over the alternative>

## Architecture impact
<what this changes in ARCHITECTURE.md, if anything>

## Risks
- <risk> — <mitigation>

## Guidance for the worker
<anything that helps fill gaps when TASKS.md is unclear>
```

## TASKS.md (required for multi-step)

```markdown
# Tasks: <slice title>

- [ ] **001** <one concrete action>. Files: <paths>. Done when: <verify>.
- [ ] **002** <one concrete action>. Files: <paths>. Done when: <verify>.
- [ ] **003** <one concrete action>. Files: <paths>. Done when: <verify>.

## Verification
- Tests: <how to run>
- Manual check: <steps>
```

## RESUME.md (required for cross-session)

```markdown
# Resume: <slice title>

**Slice:** <repo>/plans/<scope>/<nnn>-<slice>/
**Started:** <UTC date>
**Last updated:** <UTC date>
**Status:** active | blocked | done

## Sibling docs
- SCOPE.md: <present | absent>
- IMPLEMENTATION.md: <present | absent>
- TASKS.md: <present | absent>

## Original ask
<verbatim user request, or tight paraphrase>

## Acceptance criteria
- <what "done" means, concrete>
- <test or behavior that proves it>

## Progress
- [x] 001 done — <result, file:line>
- [ ] 002 pending — <what needs to happen>

## Files touched so far
- path:line — <what changed>

## Open questions / blockers
- <question for user, or "none">

## Last worker handover
- <path to most recent $CLAUDE_DIR/handovers/... file, or "none">

## How to resume
1. Read SCOPE.md, IMPLEMENTATION.md, TASKS.md in this folder.
2. Read this RESUME.md to know where work stopped.
3. Read the last worker handover if present.
4. Verify state: <repro commands>
5. Next concrete action: <what to do first, referencing TASKS.md step>
```

## Slice directory file reference

| File | Required | Purpose |
| :-- | :-- | :-- |
| `SCOPE.md` | Optional — only for major work | Constraints, boundaries, non-goals. What this slice is and is NOT allowed to touch. |
| `IMPLEMENTATION.md` | Recommended | General reason and approach. The *why* and *how* — companion to TASKS.md. |
| `TASKS.md` | Yes (multi-step) | Concrete step-by-step breakdown the worker executes. |
| `RESUME.md` | Yes (spans >1 session) | Cross-session state. New session reads this first. |
| `DESIGN.md` | Optional | Detailed pre-impl spec (API shape, data model) when bigger than IMPLEMENTATION.md should hold. |
| `NOTES.md` | Optional | Free-form scratch findings during the slice. |

## Repo-level planning docs (outside slice folders)

| File | Path | Purpose |
| :-- | :-- | :-- |
| Architecture | `./ARCHITECTURE.md` or `./docs/ARCHITECTURE.md` | System design, component boundaries, data flow. Cross-slice, long-lived. |
| ADR | `./docs/adr/<num>-<slug>.md` | Locked decisions workers must not relitigate. |

## Non-project orchestrator paths (NOT committed)

| Path | Purpose |
| :-- | :-- |
| `$CLAUDE_DIR/handovers/<slug>-<UTC>.md` | Worker pre-compaction handovers. Ephemeral. |
| `$CLAUDE_DIR/scratch/<...>` | One-shot support-agent outputs. Throwaway. |
| `$CLAUDE_DIR/agent-memory/<agent>/` | Subagent persistent memory (if enabled). |
