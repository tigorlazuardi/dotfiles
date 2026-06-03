# Ralph contract template

Referenced from `skills/ralph-plan/SKILL.md` and `docs/orchestrator-playbook.md`. Load on demand — only when Opus authors a ralph contract, or when a Sonnet ralph-loop session needs the execution rules.

A **ralph contract** lets a fresh Sonnet session execute a complex feature unattended via the ralph-loop plugin. Opus (higher awareness) authors it; Sonnet (lower awareness, autonomous) executes it. The contract compensates for the awareness gap with machine-checkable gates, locked scope, and Opus-gated escalation/abort.

## How ralph-loop actually works (constraints that shape the contract)

- `/ralph-loop "<prompt>" --max-iterations N --completion-promise 'PHRASE'` writes `.claude/ralph-loop.local.md` and feeds **the same prompt back every iteration** when the session tries to exit.
- The loop exits ONLY when: (a) the session outputs `<promise>PHRASE</promise>` with PHRASE matched exactly, OR (b) `iteration >= max_iterations`, OR (c) the state file `.claude/ralph-loop.local.md` is deleted.
- Progress is NOT in the prompt (it never changes). All durable state lives in files: `CONTRACT.md` (fixed) + `RESUME.md` (progress) + git history. The loop re-reads them each iteration.
- The session has Bash, so it CAN delete the state file to exit — that is the abort hatch. The contract must explicitly authorize it under one gated condition, because ralph's default instructions say "never circumvent / never lie to escape."

## CONTRACT.md template

```markdown
# Ralph Contract: <slice title>

**Slice:** <repo>/plans/<scope>/<nnn>-<slice>/
**Executor:** Sonnet orchestrator, autonomous ralph-loop (fresh session)
**Planner:** Opus — contract authored <UTC date>

## 1. Mission
<one line: what this loop must achieve>

## 2. Success criteria (definition of done)
Loop is DONE only when ALL of these hold, each proven by a command that exits 0:
- <criterion> — verify: `<command>`
- <criterion> — verify: `<command>`

Full gate (run ALL, in order, before any promise):
` ``
<combined verify — e.g. test suite + lint + typecheck + build>
` ``

## 3. Completion promise
Phrase: `ALL ACCEPTANCE MET`   (must match the --completion-promise exactly)

Gate — MANDATORY before emitting, no exceptions:
1. Every task in §4 is checked done in RESUME.md.
2. Run every verify command in §2. ALL exit 0.
3. Paste the verify output into your response.
4. ONLY THEN output: `<promise>ALL ACCEPTANCE MET</promise>`

NEVER emit the promise on self-assessment alone.
NEVER emit it to escape a stuck loop — that is a false promise and a contract violation.
If you cannot make the gate green, you are NOT done — iterate or escalate (§6), or abort (§7).

## 4. Tasks
Ordered. Each iteration: execute the next unchecked task. Track state in RESUME.md.

| #   | Action | Files in-scope | Out-of-scope | Done when (verify cmd, exit 0) | Difficulty | Review | escalate_after |
| :-- | :----- | :------------- | :----------- | :----------------------------- | :--------- | :----- | :------------- |
| 001 | <do X> | <paths>        | <paths>      | `<cmd>`                        | easy       | self   | 2             |
| 002 | <do Y> | <paths>        | <paths>      | `<cmd>`                        | hard       | opus   | 2             |

**Review levels:**
- `self` — run the verify command, self-check the diff against the row. No Opus unless verify fails `escalate_after` times.
- `sonnet` — after implementing, re-read the full diff with fresh eyes against acceptance before marking done.
- `opus` — after implementing, spawn an Opus subagent (`/opus-review` pattern) to deep-review the diff BEFORE marking the task done. Mandatory for `opus`-tagged rows.

## 5. Guardrails (do NOT violate)
- Do NOT touch: <paths / modules / files>
- Constraints: <perf budget, API compat, no new deps, security requirement, style>
- Do NOT expand scope beyond this table. New need discovered → record under RESUME.md "Open questions", do NOT silently implement it.
- Do NOT delete or rewrite a file you did not create without surfacing it in RESUME.md first.
- Follow the CLAUDE.md orchestrator/worker split: delegate code writes to `sonnet-implementer`; the loop session orchestrates + reviews.

## 6. Escalation rules
Spawn an Opus subagent (`Agent({ model: "opus", ... })`, cold-context briefing) when ANY:
- Task tagged `review: opus` → Opus reviews its diff before the task is marked done.
- Diff touches auth / secrets / DB migration / schema change / public API → Opus review (inherits CLAUDE.md auto-trigger list).
- The SAME task fails its verify `escalate_after` times (default 2; track `attempts:` in RESUME.md) → Opus DIAGNOSE. Opus returns one of:
  - `SOLVABLE` + a concrete hint → reset that task's `attempts` to 0, apply the hint, continue.
  - `IMPOSSIBLE` + rationale → go to §7 Abort.
Briefing = the task row + the failing verify output + relevant file paths. Batch multiple Opus questions into ONE call — ping-pong is the expensive mode.

## 7. Abort protocol (only authorized exit besides success)
Trigger: Opus DIAGNOSE returned `IMPOSSIBLE`. (Sonnet judgment alone is NOT a valid abort trigger.)
Steps:
1. Write `BLOCKED.md` in the slice folder (template below).
2. Set RESUME.md status: `blocked`.
3. Run: `rm .claude/ralph-loop.local.md`
4. Exit with a short summary pointing at BLOCKED.md.

This OVERRIDES ralph's "never circumvent the loop" default — it is gated by Opus (higher awareness), not a self-escape. Do NOT emit the completion promise to abort (that lies). Do NOT delete the state file for any other reason.

## 8. Iteration discipline (every iteration, in order)
1. Read this CONTRACT.md and RESUME.md first.
2. Idempotency: never redo a task already checked done in RESUME.md.
3. Pick the next unchecked task in §4.
4. Implement it (delegate code writes per CLAUDE.md split).
5. Run the task's verify command:
   - Pass → check the task done in RESUME.md; record files touched + key decisions; reset its `attempts` to 0.
   - Fail → increment that task's `attempts:` in RESUME.md. If `attempts >= escalate_after` → §6 escalation.
6. Checkpoint commit if the user authorized commits (one commit per completed task — keeps each iteration revertable).
7. When every task is done → run the §3 promise gate.

## 9. Backstop
max-iterations: <N>   (default 30; tune to task size). Hard ceiling. If hit, the loop stops on its own; the user reviews RESUME.md + any BLOCKED.md.

## 10. Start command (fresh Sonnet session, dedicated branch)
` ``
git checkout -b ralph/<scope>-<nnn>
/ralph-loop "Autonomous execution. Read plans/<scope>/<nnn>-<slice>/CONTRACT.md and RESUME.md. Execute the next unchecked task per the contract. Honor guardrails, escalation, abort, and the promise gate. Emit the promise ONLY when the §3 gate passes." --max-iterations 30 --completion-promise 'ALL ACCEPTANCE MET'
` ``
```

## BLOCKED.md template

```markdown
# Blocked: <slice title>

**When:** <UTC date>, iteration <N>
**Blocked task:** <task # + action>

## What was tried
- <attempt 1 — what + verify result>
- <attempt 2 — what + verify result>

## Why it is blocked
<the failing verify output / error, root symptom>

## Opus diagnosis
**Verdict:** IMPOSSIBLE
**Rationale:** <Opus's reasoning>

## Suggested next step for the user
<what a human needs to decide / unblock — missing access, spec gap, external dep, etc.>
```

## RESUME.md extension for ralph slices

On top of the standard RESUME.md (see `orchestrator-templates.md`), a ralph slice MUST carry:

```markdown
## Ralph state
- Contract: CONTRACT.md (this slice)
- Loop status: active | blocked | done

## Task progress (with attempt counters)
- [x] 001 done — <result, file:line> — attempts: 0
- [ ] 002 pending — attempts: 1   (1 failed verify; escalate at 2)
```

The `attempts:` counter is the concrete stuck-detection signal that drives §6 — not a vibe. Each iteration updates it.
```

## Authoring checklist (Opus, before emitting)

- Every "done when" is a command that exits 0 — no prose acceptance.
- §2 full gate command actually runs the whole suite.
- Promise phrase in §3 == the `--completion-promise` in §10, exactly.
- Hard / security / migration / public-API tasks tagged `review: opus`.
- Guardrails name concrete do-NOT-touch paths.
- `--max-iterations` set in §10.
- No TBD / placeholder / contradiction left.
