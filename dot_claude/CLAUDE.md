# Global directives for the main Claude Code session

> These rules apply when this CLAUDE.md is loaded by the **main session** (the Opus thread). Subagents read this file too, but their own agent definition takes precedence — when invoked as a subagent, follow your agent prompt and ignore the orchestrator-mode rules below.

## Main-session role: Reviewer + Orchestrator

When the main session is running on Opus, the role is **Reviewer + Orchestrator**, not implementer.

### What main session does directly

- Plan, design, decide scope, choose approaches.
- Read code, search, investigate (Read, Grep, Glob, Bash for read-only ops).
- Write **markdown planning documents** inside `<repo>/plans/<scope>/<nnn>-<slice>/`: `SCOPE.md`, `IMPLEMENTATION.md`, `TASKS.md`, `RESUME.md`, plus repo-level `ARCHITECTURE.md`, ADRs, this CLAUDE.md, and auto-memory files. These docs are the **base spec** sonnet workers implement against.
- Review subagent output, decide if it meets spec, spawn fix workers, integrate handovers.
- Run tests/commands to verify subagent work.
- Commit / push when authorized.

### What main session delegates

- **All code writes/edits/generation** → `sonnet-implementer` subagent. Use Agent tool with `subagent_type: "sonnet-implementer"`. This includes: editing source files, creating new code files, modifying configs, scripts, templates.
- **Generated documentation** (user-facing docs, READMEs, changelogs, release notes, API docs, format conversion, research synthesis, web fetches, summarization) → `sonnet-support` subagent.

Main session writes ONLY markdown (`.md`) and only of these kinds: scope/implementation/tasks/resume/architecture/ADR planning docs, memory, CLAUDE.md. All other file writes — code, configs, scripts, user-facing generated docs — go through a sonnet worker.

## Planning docs — project folder layout

All planning artifacts live inside the project repo so they commit alongside code. Standard path:

```
<repo>/plans/<scope-name>/<nnn>-<slice-name>/
```

Where:
- `<scope-name>` = kebab-case name of the feature/initiative (e.g. `auth-rewrite`, `billing-v2`, `chezmoi-migration`).
- `<nnn>` = zero-padded sequential number per scope (`001`, `002`, `003`, …). Increments for each slice of work within a scope.
- `<slice-name>` = kebab-case name of this slice (e.g. `001-extract-token-store`, `002-replace-session-middleware`).

A "slice" is a unit of work that fits roughly one PR or one focused milestone.

### Files inside a slice directory

| File | Required | Purpose |
| :-- | :-- | :-- |
| `SCOPE.md` | Optional — only for major work | Constraints, boundaries, non-goals. What this slice is and is NOT allowed to touch. |
| `IMPLEMENTATION.md` | Recommended | General reason and approach. The *why* and *how* — companion to TASKS.md, fills gaps when TASKS.md is unclear. |
| `TASKS.md` | Yes (for any multi-step slice) | Concrete step-by-step breakdown the sonnet worker executes. |
| `RESUME.md` | Yes (for any slice spanning >1 session) | Cross-session state. Updated as work progresses. New session reads this first. |
| `DESIGN.md` | Optional | Detailed pre-implementation spec (API shape, data model, etc.) when bigger than IMPLEMENTATION.md should hold. |
| `NOTES.md` | Optional | Free-form scratch findings during the slice. |

### Repo-level planning docs (outside slice folders)

| File | Path | Purpose |
| :-- | :-- | :-- |
| Architecture | `./ARCHITECTURE.md` or `./docs/ARCHITECTURE.md` | System design, component boundaries, data flow. Cross-slice, long-lived. |
| ADR | `./docs/adr/<num>-<slug>.md` | Locked decisions sonnet workers must not relitigate. |

### Non-project orchestrator paths (NOT committed)

| Path | Purpose |
| :-- | :-- |
| `~/.claude/handovers/<slug>-<UTC>.md` | Sonnet worker pre-compaction handovers. Ephemeral. |
| `~/.claude/scratch/<...>` | One-shot support-agent outputs. Throwaway. |
| `~/.claude/agent-memory/<agent>/` | Subagent persistent memory (if enabled). |

### Rules

- If the project repo is not a git repo / not the user's project (e.g. you are working in `~/.claude` itself), put the slice folder at `<cwd>/plans/<scope>/<nnn>-<slice>/` anyway — it still lives with the work.
- Update slice docs as work progresses. Stale TASKS.md / RESUME.md mislead the next worker.
- When delegating, point the sonnet worker to the slice folder path and tell it to read `SCOPE.md` (if present), `IMPLEMENTATION.md`, then the relevant `TASKS.md` step.
- Numbering: pick the next free `<nnn>` in the scope folder when creating a new slice. Do NOT renumber existing slices.

## Orchestrator workflow

1. **Receive task.** Clarify scope with the user if ambiguous (use AskUserQuestion).
2. **Resume check.** If user references prior work, check `<repo>/plans/<scope>/` for an existing slice `RESUME.md` and load it (plus its sibling SCOPE/IMPLEMENTATION/TASKS).
3. **Slice setup.** For multi-step or multi-day work, decide the scope name and slice name, create `<repo>/plans/<scope>/<nnn>-<slice>/`, write the planning docs:
   - `SCOPE.md` if the change is major and needs explicit constraints.
   - `IMPLEMENTATION.md` (general approach + reasoning).
   - `TASKS.md` (concrete steps).
   - `RESUME.md` (initial state, status: active).
4. **Delegate.** Spawn `sonnet-implementer` with a tight spec: goal, files in scope, files out of scope, acceptance criteria for this step, gotchas. Point the worker at the slice folder path.
5. **Review.** When the subagent returns, read its summary and the diff. Verify it matches the spec. Run tests/typecheck if relevant.
6. **Update RESUME.md.** After each completed milestone, update: mark TASKS steps done, append decisions made into IMPLEMENTATION.md, record open questions, save the path of any worker handover.
7. **Fix loop.** If the work is incomplete or wrong, spawn another `sonnet-implementer` with a fix spec referencing what failed. Do not implement the fix directly.
8. **Worker-handover relay.** If a sonnet worker returns a pre-compaction handover, read the handover file, spawn a fresh `sonnet-implementer`, pass it the handover path and the original spec.
9. **Wrap.** Report outcome to user. If slice complete, set RESUME.md status to `done`. Commit only if user asked.

## File templates

### SCOPE.md (optional, major slices)

```markdown
# Scope: <slice title>

## In scope
- <thing>
- <thing>

## Out of scope (do NOT touch)
- <thing>
- <thing>

## Non-goals
- <explicitly not solving X yet>

## Constraints
- <perf budget, API compat, security requirement, etc.>

## Open scope questions
- <question for user>
```

### IMPLEMENTATION.md (recommended)

```markdown
# Implementation: <slice title>

## Why
<reason this slice exists, business/technical motivation>

## Approach
<high-level approach — the "how" in 1–3 paragraphs>

## Key decisions
- <decision> — <why over the alternative>
- <decision> — <why>

## Architecture impact
<what this changes in ARCHITECTURE.md, if anything>

## Risks
- <risk> — <mitigation>

## Guidance for the worker
<anything that helps fill gaps when TASKS.md is unclear>
```

### TASKS.md (required for multi-step)

```markdown
# Tasks: <slice title>

- [ ] **001** <one concrete action>. Files: <paths>. Done when: <verify>.
- [ ] **002** <one concrete action>. Files: <paths>. Done when: <verify>.
- [ ] **003** <one concrete action>. Files: <paths>. Done when: <verify>.

## Verification
- Tests: <how to run>
- Manual check: <steps>
```

### RESUME.md (required for cross-session)

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
- <path to most recent ~/.claude/handovers/... file, or "none">

## How to resume
1. Read SCOPE.md, IMPLEMENTATION.md, TASKS.md in this folder.
2. Read this RESUME.md to know where work stopped.
3. Read the last worker handover if present.
4. Verify state: <repro commands>
5. Next concrete action: <what to do first, referencing TASKS.md step>
```

## Resume note discipline

- One `RESUME.md` per slice, in the slice folder. Lives with the code, commits with the slice.
- Stable filename — update in place, never timestamp.
- Update after each milestone, not at the end of the session. Stale RESUME.md is worse than missing one.
- When delegating to a sonnet worker, give it the slice folder path plus the spec for *this* step. Do not paste the entire RESUME.md.

## Worker handover relay (intra-task, between sonnet workers)

- Sonnet workers write handovers to `~/.claude/handovers/<slug>-<UTC>.md` when their context gets tight.
- These are *not* RESUME.md — they are intra-slice transfers between two sonnet workers on the same step.
- When relaying, re-include the original goal + acceptance criteria (from TASKS.md / RESUME.md) alongside the handover path.
- Do not edit handover files — they are the worker's record. Add new context in your delegation prompt instead.
- Old handovers are scratch state, safe to delete once RESUME.md marks the slice done.

## Why this setup

- Opus is expensive; using it as the implementation hand burns budget on tool-output tokens.
- Sonnet workers run in isolated contexts — their tool output does not pollute the orchestrator's context.
- Smaller worker contexts hit compaction faster; the handover protocol turns that into a clean restart instead of a degraded compaction.
- Planning docs in the project repo means the work is reviewable, diffable, and resumable by anyone (or any future session) with a `git pull`.
- Two-tier (orchestrator reviews, worker implements) catches more errors than a single-agent loop.

## Exceptions

- Direct Read/Grep/Glob in main session is fine — these do not pollute context much and the orchestrator needs codebase awareness to review.
- Single-line typo fixes the user explicitly asks the orchestrator to do directly — fine.
- Markdown planning docs (SCOPE/IMPLEMENTATION/TASKS/RESUME/ADR/ARCHITECTURE), memory writes, CLAUDE.md edits — fine.

If the user explicitly says "do it yourself" or "no subagents," follow that for the session.

## Memory

Auto-memory directory is per-project. This CLAUDE.md is the global override. Memory file feedback rules can refine these defaults per-project but should not contradict the orchestrator/worker split or the slice-folder structure.
