---
name: usage-checkpoint
description: >-
  Three-phase usage guard for long-running orchestrators (ralph-loop, fleet,
  oneshot): at 80% schedule the wakeup timer and continue; at 90% write early
  handover docs if 2+ subagents in flight; at 95% stop spawning and finalize
  handover. Timer set before 100% is the hard invariant. Enforced
  automatically by the usage-guard.py Stop/SubagentStop hook.
metadata:
  type: skill
---

# Usage Checkpoint

Three thresholds. Timer is the safety net — set it early. Handover docs are
the resume artifact — write them before stopping. Hitting 100% is acceptable
as long as the timer and handover exist.

## Automatic enforcement — usage-guard hook

`$CLAUDE_DIR/hooks/usage-guard.py` runs on every `Stop` and `SubagentStop`
event (wired in user `settings.json`). It queries the OAuth usage endpoint
(cached, adaptive TTL, lock-deduped) and nudges the orchestrator once per
phase per rate-limit window per session: amber ≥ 80% (blocks stop once →
"run Phase 1"), prep ≥ 90% (early handover if 2+ subagents in flight), red
≥ 95% (blocks stop once → "run Phase 2"). The hook is the trigger; this
skill is the procedure. Manual check cadence below still applies mid-turn —
the hook only fires at turn/subagent boundaries.

## Check Cadence

Any long-running orchestrator: ralph-loop, fleet captain, attended oneshot.

Check usage:
- **Before dispatching each runnable batch** of parallel subagents (e.g. fleet's
  runnable-DAG set for that scheduling pass) — mandatory.
- **After each batch/DAG returns** (≥ 3 agents, or any DAG completion) — mandatory.
- **Before any task the orchestrator judges as expensive** — judgment call; see
  Overflow Judgment below.
- **At any explicit `/usage-checkpoint` invocation**.

### Usage query (same endpoint `/usage` uses)

```sh
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
TOKEN=$(python3 -c "import json;print(json.load(open('$CLAUDE_DIR/.credentials.json'))['claudeAiOauth']['accessToken'])" 2>/dev/null)
[ -z "$TOKEN" ] && TOKEN=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null | python3 -c "import json,sys;print(json.load(sys.stdin)['claudeAiOauth']['accessToken'])" 2>/dev/null)
curl -s https://api.anthropic.com/api/oauth/usage \
  -H "Authorization: Bearer $TOKEN" \
  -H "anthropic-beta: oauth-2025-04-20"
```

Response fields that matter:
- `five_hour.utilization` — percent of 5h block used (authoritative, no estimation).
- `five_hour.resets_at` — exact ISO timestamp the block resets (no start+5h math).
- `seven_day.utilization` / `seven_day.resets_at` — weekly limit (ccusage never had this).

Gate on **both** windows: `percent = max(five_hour.utilization, seven_day.utilization)`.
If the *weekly* window is the one ≥ 90%, resume time is `seven_day.resets_at`
(days away) — write handover docs and tell the user explicitly; do not chain
5h wakeups against a weekly wall.

Fallbacks:
- HTTP 401 → token expired mid-session; retry once after a few seconds (Claude
  Code refreshes it), then fall back to `npx -y ccusage@latest blocks --active
  --json` (local estimate, 5h window only).
- Multi-account (work/personal via `CLAUDE_CONFIG_DIR`): the credentials file
  under `$CLAUDE_DIR` is tried first so the token matches the active account;
  keychain is the macOS fallback.

Apply the phase that matches.

---

## Phase 1 — Amber: 80–89%

**Schedule the wakeup timer immediately. Then continue working.**

The timer is the safety net. If phases 1 and 2 both fail and the session hits
100%, the timer still fires and the next session can pick up — provided
handover docs exist. Set it now, not later.

### Actions at 80%

1. **Calculate resume time** (do this once; reuse the value in Phase 2).
   Pipe the usage-query response through:

   ```sh
   python3 -c "
   import json,sys
   from datetime import datetime,timezone
   d=json.load(sys.stdin)
   w='seven_day' if d['seven_day']['utilization']>=90 else 'five_hour'
   r=datetime.fromisoformat(d[w]['resets_at'])
   print(max(60,int((r-datetime.now(timezone.utc)).total_seconds())))"
   ```

   Chain wakeups if reset > 1 hour away (runtime clamps to 60–3600s).

2. **Schedule wakeup** with a self-contained resume prompt (see Wake Prompt
   Template below). Even if handover docs don't exist yet, the prompt must
   include the path where they will be written.

3. **Mark amber state** in STATE.md / FLEET_RESUME.md / wherever is canonical:
   ```
   usage_amber: true
   amber_at_percent: <X>
   amber_resets_at: <five_hour.resets_at>
   timer_scheduled: true
   ```

4. **Announce to user** (one line): `Amber: <X>% used, wakeup timer set for
   <reset_time>, continuing.`

5. **Continue working** — dispatch runnable batches normally, apply overflow
   judgment (below).

---

## Phase 1.5 — Prep: 90–94%

**Early handover when parallelism is high. Keep working.**

If 2+ subagents are in flight or expensive batches are queued: write handover
docs NOW (per the context-specific formats below) while work continues — a
parallel batch can burn 5%+ before the next check, blowing straight past red.
Solo/light work: verify the timer is set, continue, nothing else.

Handover docs written here are drafts — Phase 2 finalizes them. Update, don't
rewrite.

---

## Phase 2 — Red: ≥ 95%

**Stop spawning. Write/finalize handover docs. Exit cleanly.**

### Actions at 95%

1. **Finish in-flight agents** — do not interrupt. Accept handovers, record
   results. Do not re-delegate any subagent's work to a new agent.

2. **Stop spawning** — no new batches, no new subagent calls.

3. **Write handover docs** (context-specific, see below).

4. **Update timer** — if the wakeup prompt written at 80% was a placeholder,
   rewrite it now with the real handover doc paths and resume command.

5. **Report to user** (see Report Template below).

### Overflow Judgment (applies from 80% onward)

Before starting any task, ask: "If this task costs as much as the previous
batch, will it push us to 100% before handover docs can be written?"

If yes: **write handover docs first, then attempt the task**. This way, even
if the task hits the limit mid-run, the timer + docs exist and the next session
can resume cleanly.

Signals a task may overflow:
- Previous batch of similar size consumed ≥ 5% each.
- Task requires ≥ 3 parallel agents.
- Task is a large file rewrite or a long research sweep.

---

## Handover Docs — Context-Specific

### Ralph loop

- Checkpoint-commit all dirty files on the current slice branch.
- Update `STATE.md`:
  ```yaml
  paused: true
  paused_at: <task_id of next unstarted task>
  paused_reason: usage_limit
  paused_resets_at: <five_hour.resets_at (or seven_day.resets_at if weekly hit)>
  resume_command: /ralph-loop:ralph-loop "$(cat <PROMPT_PATH>)"
  ```

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

Fill this at 80% (placeholder paths OK), draft handover refs at 90% prep, finalize at 95%:

```
Usage checkpoint resume. Check usage first via the usage-checkpoint skill's
usage query (OAuth endpoint https://api.anthropic.com/api/oauth/usage — same
data as /usage).

If max(five_hour.utilization, seven_day.utilization) ≥ 95%:
  Reschedule wakeup: min(3600, secondsUntilReset from the binding window's
  resets_at). STOP.

Otherwise:
  Resume <ORCHESTRATOR_TYPE> from <HANDOVER_DOC_PATH>.
  Resume command: <RESUME_COMMAND>
  Batch throttle: ≤ 3 parallel agents.
  Overflow judgment: check usage before dispatching each batch.
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

1. Re-check usage (OAuth endpoint). If max(five_hour, seven_day) utilization
   ≥ 95% → reschedule wakeup on the binding window's `resets_at`, stop.
2. Utilization dropped below threshold = window reset = safe.
3. Read handover doc. Cold-start from `paused_at` or first pending slice.
4. Apply batch throttle (≤ 3 parallel default). Apply overflow judgment.
5. Re-enter check cadence normally.

---

## Hard Invariants

- Timer MUST be scheduled at 80%, not later. If 80% is missed and usage is
  discovered at 92%, schedule the timer immediately before anything else.
- Handover docs MUST be written before stopping. If the session hits 100%
  without handover docs, the next session is blind. Use overflow judgment to
  prevent this.
- Never interrupt in-flight agents to save budget — that loses work already paid
  for.
- Hitting 100% is acceptable if: timer is set + handover docs exist.

---

## Interaction with stay-within-limits

`stay-within-limits` uses 95% and generic pause. This skill uses 80%/90%/95% with
orchestrator-specific state persistence, pre-scheduled timer, and overflow
judgment. They compose: use this skill for structured long-running orchestrators;
`stay-within-limits` for ad-hoc parallel work without a STATE.md artifact.
