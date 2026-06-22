<!--
  RALPH_PROGRESS.template.md — Ralph Loop resume ledger.
  Opus seeds it; the Sonnet orchestrator updates and commits it after every task so the slice can
  resume after a crash, power loss, or accidental stop. This is the single source of truth for
  progress — the contract (RALPH.md) is what to do, this is how far we've gotten.
-->

# Ralph State — <scope>/<nnn>-<slice-name>

- **status:** `planning | in-progress | completed | aborted`
- **orchestrator_model:** `<orchestrator-model>`
- **base-branch:** `<base-branch>`
- **integration-branch:** `<integration-branch>`
- **verify-command:** `<command that proves green>`
- **install-cmd:** `<deps install per worktree>`
- **parallel-cap:** `4`
- **last-updated:** `<UTC timestamp>` (iteration `<n>`)
- **last-progress-iteration:** `<iteration a task last reached done>` (no-progress guard: +3 → circuit-breaker)

## Task ledger

<!-- Keep one row per task. attempts resets to 0 after a CONTINUE decision. -->

| task-id | batch | tier | reviewer | worktree | status | attempts | notes |
|---------|-------|------|----------|----------|--------|----------|-------|
| <id>    | B1    | <S/M/L> | <sonnet/opus> | <path or —> | todo | 0 | |

`status` ∈ `todo | doing | done | failed`.

## Progress log (heartbeat — one line per iteration)

<!-- Orchestrator appends each iteration; human can tail this. -->

- `iteration <n>` · <what advanced>

## Decision log (circuit-breaker)

<!-- Append one entry each time the Opus circuit-breaker is invoked. -->

- `<timestamp>` · task `<id>` · **DECISION:** `<CONTINUE|ABORT>` · **REASON:** `<...>` ·
  **GUIDANCE:** `<...>`

## Merge-handoff summary (filled at the end)

<!-- The orchestrator writes this before emitting the completion promise. -->

- **Outcome:** `<completed | aborted: reason>`
- **Cost tally:** `<iterations used> iters · <opus calls> opus calls · <n>/<total> tasks done`
- **What changed:** <bullet summary>
- **How verified:** <command + result>
- **Follow-ups / known gaps:** <...>
- **To merge (human runs this):**
  ```
  git checkout <base-branch>
  git merge --no-ff <integration-branch>
  ```
