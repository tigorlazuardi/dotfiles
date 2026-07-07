---
name: usage-checkpoint
description: >-
  Two-phase usage guard for long-running orchestrators (ralph-loop, fleet,
  oneshot): at 80% schedule the wakeup timer and continue; at 90% stop spawning
  and write handover docs. Target exit ~95% used. Timer set before 100% is the
  hard invariant.
metadata:
  type: skill
---

# Usage Checkpoint

Two thresholds. Timer is the safety net — set it early. Handover docs are the
resume artifact — write them before stopping. Hitting 100% is acceptable as
long as the timer and handover exist.

## Check Cadence

Any long-running orchestrator: ralph-loop, fleet captain, attended oneshot.

Check usage:
- **Before each new wave** of parallel subagents — mandatory.
- **After a large wave finishes** (≥ 3 agents) — mandatory.
- **Before any task the orchestrator judges as expensive** — judgment call; see
  Overflow Judgment below.
- **At any explicit `/usage-checkpoint` invocation**.

```sh
npx -y ccusage@latest blocks --active --json
```

> **Note:** `ccusage` tracks the active 5-hour Anthropic API block; if Pi is routed through a non-Anthropic provider (e.g. a third party OpenRouter route), swap this command for that provider's usage endpoint.

Parse `percentUsed` (or derive `cost / limit`). Apply the phase that matches.

---

## Phase 1 — Amber: 80–89%

**Schedule the wakeup timer immediately. Then continue working.**

The timer is the safety net. If phases 1 and 2 both fail and the session hits
100%, the timer still fires and the next session can pick up — provided
handover docs exist. Set it now, not later.

### Actions at 80%

1. **Calculate resume time** (do this once; reuse the value in Phase 2):

   ```sh
   npx -y ccusage@latest blocks --active --json | \
     node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
     const block=d.blocks?.find(b=>b.isActive);
     if(!block){console.log(3600);process.exit();}
     const resetAt=new Date(block.startTime).getTime()+5*60*60*1000;
     console.log(Math.max(60,Math.floor((resetAt-Date.now())/1000)));"
   ```

   Chain wakeups if reset > 1 hour away (runtime clamps to 60–3600s).

2. **Schedule wakeup** with a self-contained resume prompt (see Wake Prompt
   Template below). Even if handover docs don't exist yet, the prompt must
   include the path where they will be written.

3. **Mark amber state** in the canonical progress file (`.ralph/scratchpad.md` for pi-ralph / `FLEET_RESUME.md` for fleet / `RESUME.md` for one-shot):
   ```
   usage_amber: true
   amber_at_percent: <X>
   amber_block_start: <active block start timestamp>
   timer_scheduled: true
   ```

4. **Announce to user** (one line): `Amber: <X>% used, wakeup timer set for
   <reset_time>, continuing.`

5. **Continue working** — spawn waves normally, apply overflow judgment (below).

---

## Phase 2 — Red: ≥ 90%

**Stop spawning. Write handover docs. Exit cleanly.**

### Actions at 90%

1. **Finish in-flight agents** — do not interrupt. Accept handovers, record
   results. Do not re-delegate any subagent's work to a new agent.

2. **Stop spawning** — no new waves, no new subagent calls.

3. **Write handover docs** (context-specific, see below).

4. **Update timer** — if the wakeup prompt written at 80% was a placeholder,
   rewrite it now with the real handover doc paths and resume command.

5. **Report to user** (see Report Template below).

### Overflow Judgment (applies from 80% onward)

Before starting any task, ask: "If this task costs as much as the previous
wave, will it push us to 100% before handover docs can be written?"

If yes: **write handover docs first, then attempt the task**. This way, even
if the task hits the limit mid-run, the timer + docs exist and the next session
can resume cleanly.

Signals a task may overflow:
- Previous wave of similar size consumed ≥ 5% each.
- Task requires ≥ 3 parallel agents.
- Task is a large file rewrite or a long research sweep.

---

## Handover Docs — Context-Specific

### Ralph loop (pi-ralph, hat model)

- Checkpoint-commit all dirty files on the working branch (a hat's delegated worker should have committed its slice; commit anything loose).
- Persist progress in the loop's disk state `.ralph/scratchpad.md` — mark the current task and append a resume note:
  ```
  <!-- PAUSED: usage_limit -->
  paused_at: <id of next unchecked task>
  paused_block_start: <active block start timestamp>
  ```
- pi-ralph persists its own hat/loop state (`ralph-loop-state`) and restores an unexpired loop on `--resume`; the scratchpad is the durable state carrier across the fresh-session-per-hat boundary, so an accurate scratchpad IS the resume contract.
- Resume: re-open the session with `--resume` (restores the loop), or relaunch `/ralph <preset> --path <spec>` — hat-1 (ingest) re-reads the spec and the scratchpad shows completed vs remaining tasks.

### Fleet captain

- Merge any completed slices into integration branch.
- For each in-progress slice: checkpoint-commit on its branch, write
  `HANDOVER.md` in the slice folder: what's done, what's next, stop reason.
- Write `FLEET_RESUME.md` at plans dir root:
  - List of slice branches + status (done / in-progress / not-started).
  - The fleet command to resume.
  - Any cross-slice dependencies that affect resume order.

### Oneshot orchestrator

- Create or update `RESUME.md` in plans dir (or cwd):
  - What was planned (condensed, ≤ 10 lines).
  - What completed: files changed, commands verified, outputs produced.
  - What remains: ordered task list, clear start point.
  - Open decisions the next session must resolve before continuing.
  - Exact resume command.

---

## Wake Prompt Template

Fill this at 80% (placeholder paths OK) and finalize at 90%:

```
Usage checkpoint resume. Check usage first:
  npx -y ccusage@latest blocks --active --json

If percentUsed ≥ 90% OR block start unchanged from <PREV_BLOCK_START>:
  Reschedule wakeup: min(3600, secondsUntilReset). STOP.

Otherwise:
  Resume <ORCHESTRATOR_TYPE> from <HANDOVER_DOC_PATH>.
  Resume command: <RESUME_COMMAND>
  Wave throttle: ≤ 3 parallel agents.
  Overflow judgment: check usage before each wave.
  Next task: <ONE_LINE_SUMMARY>
```

---

## Report Template

At Phase 2 stop:

```
USAGE CHECKPOINT — stopped at <X>% (5h block) / <Y>% (weekly).
Timer: set at 80%, fires at <RESET_TIME_HUMAN>.
Handover: <HANDOVER_DOC_PATH>
Resume: <RESUME_COMMAND>
Remaining: <N tasks / N slices pending>.
Auto-resumes on timer. Manual resume: <RESUME_COMMAND>
```

---

## On Wake

1. Re-check usage. If ≥ 90% OR block start unchanged → reschedule wakeup, stop.
2. New block start timestamp = new window = safe.
3. Read handover doc. Cold-start from `paused_at` or first pending slice.
4. Apply wave throttle (≤ 3 parallel default). Apply overflow judgment.
5. Re-enter check cadence normally.

---

## Hard Invariants

- Timer MUST be scheduled at 80%, not 90%. If 80% is missed and usage is
  discovered at 92%, schedule the timer immediately before anything else.
- Handover docs MUST be written before stopping. If the session hits 100%
  without handover docs, the next session is blind. Use overflow judgment to
  prevent this.
- Never interrupt in-flight agents to save budget — that loses work already paid
  for.
- Hitting 100% is acceptable if: timer is set + handover docs exist.

---

## Interaction with stay-within-limits

`stay-within-limits` uses 95% and generic pause. This skill uses 80%/90% with
orchestrator-specific state persistence, pre-scheduled timer, and overflow
judgment. They compose: use this skill for structured long-running orchestrators;
`stay-within-limits` for ad-hoc parallel work without a canonical progress artifact (`.ralph/scratchpad.md` / `FLEET_RESUME.md`).
