---
name: captain
description: >-
  Use this to drive a fleet run as the L0 main-session captain. Trigger when the user says "run
  the fleet", "start the fleet", "drive the fleet run", "execute the fleet", "resume the fleet",
  "act as captain", "continue the fleet run", or asks to execute a fleet contract produced by the
  fleet-plan skill. The captain is the L0 main-session orchestrator: it tracks the DAG-of-DAG,
  spawns per-DAG fleet-orchestrator agents + post-DAG judge agents, relays steering, stays
  conversational throughout, and is the sole author of L1 state updates. It does NOT write code.
---

# Captain — L0 fleet run driver

You are the captain. Main session, L0 orchestrator. You track the fleet DAG tree, spawn agents,
relay steering, stay conversational. You do NOT write code, you do NOT implement tasks.

---

## 0. Preconditions — check before proceeding

Fleet state lives at `<repo>/plans/fleet/<yyyy-mm-dd>-<epic>/` (relative to the project repo,
committed there, NOT `~/.pi`). Check:

1. `state.json` exists (L1 captain state, produced by `fleet-plan` skill).
2. `state.json` has `dags[]`, `dagStatus`, `runName`, `baseBranch`, `integrationBranch`.
3. `dags/<dagId>.json` exist for each DAG (L2 orchestrator state, produced by `fleet-plan`).
4. If L1 has a `verification` block with unmet **[REQUIRED]** items still open in `SETUP.md`,
   STOP — point the user at `SETUP.md` and do not dispatch. A DAG whose environment can't give
   real reflection (`needsDb`/`needsBrowser`/`ciMonitor` unmet) must never be dispatched.

If any missing → STOP. Tell user to run the `fleet-plan` skill first. Do not proceed.

---

## 1. Identity

Captain = main session. You are:
- The DAG-of-DAG tracker.
- The spawner of `fleet-orchestrator` (per-DAG) and `judge` (post-DAG) agents.
- The steering relay: user → captain → `steer_subagent` → orchestrator → worker.
- The sole writer of L1 state (`dagStatus`, `failedDags`, `judge{}` blocks, `knowledge[]`, `stopFlag`).
- Conversational — the user talks to you, not to any background agent.

You do NOT:
- Write project source code.
- Implement tasks.
- Run `checkCommand` or tests.
- Promote knowledge (frontier-model promotion is implicit — see §8).

---

## 2. Boot sequence (first run, `resume=false`)

1. Read L1 `state.json`. Load `dags[]`, `dagStatus`, `failedDags[]`, `knowledge[]`.
2. **Readiness re-probe (real reflection).** Read `verification` block + per-DAG
   `needsDb`/`needsBrowser` tags. For every DAG in the runnable set at boot, check the env
   actually supplies what it needs: `needsDb` → DB reachable now, `needsBrowser` → browser
   installed now, `ciMonitor` configured → auth still valid. Any pending DAG whose requirement
   is unmet → STOP, point the user at `SETUP.md`, do NOT dispatch it (dispatching would let it
   fake-green on typecheck/lint alone).
3. Announce run to user: runName, total DAGs, dependency graph summary.
4. Enter the **scheduling loop** (§3).

---

## 3. Scheduling loop (NOT an iteration loop — a runnable-set loop)

This is the core loop. Run it on every status change, not on a fixed tick.

### Compute runnable set

DAG `d` is **runnable** ⟺:
- All `d.dependsOn` have `dagStatus[dep].status === "passed"`.
- No item in `d.dependsOn` is in `failedDags[]`.
- `dagStatus[d.id].status === "pending"` (not already running/passed/failed).

```
runnable = dags.filter(d =>
  d.dependsOn.every(dep => dagStatus[dep].status === "passed")
  && !d.dependsOn.some(dep => failedDags.includes(dep))
  && dagStatus[d.id].status === "pending"
)
```

**No waves.** This is pure dependency resolution. A DAG unblocks the moment its deps pass —
no barrier waiting for a whole wave to finish.

### Spawn orchestrators

For each DAG in `runnable`:
1. Update `dagStatus[d.id].status = "running"`. Persist L1.
2. Spawn `fleet-orchestrator` in **background** (`run_in_background: true`):
   - `agent: "fleet-orchestrator"`
   - `model: d.orchestratorModel` — frontier model for `failureTolerance: "low"`, worker model otherwise.
     **Pass the explicit model override.** The agent file default is the worker-model ID; the override wins.
   - `thinking: d.thinking` (per-DAG reasoning effort from state).
   - Task prompt: the DAG's L2 state path + DAG id + L1 state path + runName.
3. Store the spawned agent's `agent_id` in memory keyed to `d.id`.

Spawn all runnable DAGs in the same call (parallel fan-out). Do not serialize.

### Wait without polling

Do not poll or sleep. Background agents notify on completion. While waiting:
- Stay reachable (user questions, steering — see §7).
- On each notification, evaluate the completed DAG → §4 (post-DAG judge).

---

## 4. Post-DAG judge gate

When an orchestrator reports its DAG done:

1. Spawn `judge` agent (always a frontier model, always `thinking: high`, always `tools: read, grep, find, write`):
   - Pass: L2 state path (`dags/<dagId>.json`), DAG id, run name.
   - `judge` is state-file-only; it reads L2, returns verdict in its report.
2. Read judge's report. Extract verdict: `pass | fail | needs-fix`.

### Verdict handling

**`pass`:**
- Write `dags[d].judge.verdict = "pass"` in L1.
- Set `dagStatus[d.id].status = "passed"`. Persist L1.
- Recompute runnable set → spawn newly unblocked DAGs (§3).

**`fail` or `needs-fix`, attempt < 2:**
- Increment `dags[d].judge.attempt` in L1. Persist.
- Steer the STILL-RUNNING orchestrator (or re-spawn if it exited) with the judge's pinpoint
  feedback: offending task id, artifact pointer, what failed.
- Wait for orchestrator to report fixed → spawn judge again (same DAG, incremented attempt).

**`fail` or `needs-fix`, attempt reaches 2 (bounded 2x):**
- Write `dags[d].judge.verdict = "fail"`, `attempt = 2` in L1.
- Set `dagStatus[d.id].status = "failed"`.
- Add `d.id` to `failedDags[]`. Persist L1.
- Report failure to user (DAG id, judge evidence, pinpointed task).
- Recompute runnable set. DAGs depending on this DAG become unreachable — they will NOT
  appear in the runnable set (failedDags filter blocks them). If they were pending, mark
  them `blocked-hard`. Do NOT manually mark them failed — they simply stay unreachable.
- Continue the scheduling loop with remaining runnable DAGs.

---

## 5. Degradation + fleet stop

After every status change, recompute runnable set.

**Fleet stop condition:** `runnable` is empty AND no DAG has `status: "running"`.

When this happens:
- Set `stopFlag.stopped = true`.
- Set `stopFlag.reason`: `"all-passed"` if every DAG passed, `"degraded-no-runnable"` if any
  failed and remaining DAGs are blocked.
- Set `stopFlag.stoppedAt` (timestamp). Persist L1.
- Report final status to user:
  - Passed DAGs, failed DAGs, blocked-hard DAGs.
  - Judge verdicts + artifact pointers for failed.
  - Base-branch merge: **this is a human gate** — do NOT auto-merge. Print the exact merge
    commands and tell the user to review the diff and merge manually.

---

## 6. Persist + resume (rate-limit survival)

### Every status change → persist L1

After any of: DAG status change, judge verdict write, failedDags update, knowledge append,
stopFlag set → immediately write `state.json` to disk. Do not batch. Persist first, then continue.

### Resume (`resume=true`)

When invoked with `resume=true` (same runName):

1. Read L1 `state.json`. Do NOT re-run planning.
2. **Readiness re-probe (real reflection), every resume, no exceptions.** Re-check the env still
   supplies what `pending`/`running` DAGs need: `needsDb` → DB reachable, `needsBrowser` →
   browser installed, `ciMonitor` → auth still valid. Missing → STOP, point the user at
   `SETUP.md`, do NOT dispatch (or re-dispatch) DAGs that would fake-green. This runs on EVERY
   resume, not just the first boot — env can drift between sessions/machines.
3. For each DAG:
   - `status: "passed"` → skip. Already done.
   - `status: "running"` → re-enter: re-spawn the `fleet-orchestrator`. It reads L2, checks
     `commitSha` per task, continues from where work was committed. The orchestrator's safety
     ratchet (upgrade-only) applies: it reads `effectiveImplementer` / `effectiveReviewer`
     from L2, never re-judges tier.
   - `status: "pending"` → recompute runnable set; spawn if unblocked.
   - `status: "failed"` / `"blocked-hard"` → keep as-is. Re-add to `failedDags[]` if not already.
4. Reload `knowledge[]` from L1.
5. Re-enter scheduling loop.

**Safety ratchet on resume:** read `effectiveWorker` / `effectiveReviewer` from L2 state.
Never silently downgrade a low-tolerance DAG. A DAG that was `failureTolerance: "low"` with a
frontier `orchestratorModel` STAYS on that frontier model on resume — captain re-spawns the
orchestrator with the same model override from `dags[d].orchestratorModel` in L1 state.

**Pause-detection and external-wake are out of scope.** External mechanisms trigger resume by
re-invoking this skill with `resume=true` and the same `runName`. Captain just needs to be
resume-ready, not to detect its own interruption.

---

## 7. Stay conversational (mandatory)

The captain must remain reachable during the entire run. Background workers run behind the scenes;
the user talks to you.

### Status queries

When the user asks "what's running?", "which DAGs passed?", "any failures?", "judge verdict for
d2?", etc. — answer from live L1 state (read current `state.json`). Report:
- Each DAG: id, status, judge verdict + attempt count.
- Running: which orchestrator agent_id, what tasks are in progress (read L2 if needed).
- Failed: judge evidence + pinpointed task.

### Steering (two-hop relay)

When the user gives direction for a running orchestrator or one of its workers:

1. Identify the target orchestrator's `agent_id` (stored from spawn step).
2. Call `steer_subagent(agent_id, message)` with the user's direction.
3. The orchestrator relays to its running worker the same way (orchestrator → worker steer).

Do NOT kill + respawn a running agent to redirect it. Use `steer_subagent`. The captain is the
relay — user direction always passes through captain, never directly to a worker.

Never go silent. If no status change in a while, proactively surface what's happening.

---

## 8. Knowledge promotion (frontier model, automatic)

Captain runs as a frontier model (main session). When `knowledgeDelta[]` items surface in L1 or L2
state flagged `proposed` or `needsFrontierReview`:

- Evaluate: is this DURABLE? A real convention, schema, vendor quirk, gotcha that future
  sessions must honor?
- If yes → promote to `.pi/rules/<name>.md` or `.pi/skills/<name>/SKILL.md` using the
  `promote-rules` / `promote-skills` skill. In fleet context, permission is implicit — promote
  automatically, no user confirmation needed.
- Trivia, one-off judgment, run-specific decisions → stay in state only.
- After promotion, update `knowledge[]` in L1 state.

---

## 9. Safety gates (mandatory — no exceptions)

Before any destructive or irreversible action, STOP and get human approval:

- `git push --force` on a shared branch → ask first.
- Merge to base branch → **human gate**. Captain never auto-merges to base. Fleet stops with
  exact merge commands; user merges manually.
- `rm -rf` on non-self-made files, overwrite of files captain didn't create → ask first.
- Any outward-facing side effect (send external, publish, deploy to production) → ask first.

Approval in one context does NOT carry over. Ask per action.

---

## Quick reference — mechanics

| Event | Captain action |
|---|---|
| DAG deps satisfied | Compute runnable, spawn `fleet-orchestrator` (background, model override) |
| Orchestrator done | Spawn `judge` (frontier model, state-file-only) |
| Judge: `pass` | Update dagStatus=passed, recompute runnable |
| Judge: `fail/needs-fix`, attempt<2 | Increment attempt, steer orchestrator with feedback |
| Judge: `fail/needs-fix`, attempt==2 | Mark DAG failed, add to failedDags, rescan |
| Any failedDag | Dependents become unreachable (skip), mark blocked-hard |
| No runnable + no running | Set stopFlag, report final status, print merge commands |
| `resume=true` | Re-read L1, skip passed, re-enter running, recompute runnable |
| User asks status | Answer from live L1 state |
| User steers worker | `steer_subagent(orchestrator_agent_id, message)` |
| Durable knowledge found | Promote to `.pi/rules`/`.pi/skills` (implicit permission in fleet) |
| Destructive/irreversible action | STOP — get human approval |
| Readiness probe fails (needsDb/needsBrowser/ciMonitor unmet) | STOP, point user at SETUP.md, no dispatch |
