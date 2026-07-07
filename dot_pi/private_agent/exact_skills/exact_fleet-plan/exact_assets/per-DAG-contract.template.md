<!--
  per-DAG-contract.template.md — Contract for ONE DAG orchestrator inside a fleet run.
  Opus (the planner) fills every <...> placeholder and deletes guidance comments like this one.
  This file is re-read by the fleet-orchestrator agent on every resume — it must stand alone
  without FLEET.md. The orchestrator has no other memory except this file, the L2 state file,
  and the project repo.
  CRITICAL: fleet orchestrators execute each DAG ONCE. There is NO iteration loop.
  Gate = judge post-DAG (authority, Opus, bounded 2× at captain level). Not acceptance.command.
-->

# DAG Contract — <dagId>: <dag-name>

**Fleet run:** `<yyyy-mm-dd>-<epic-name>`
**Captain contract:** `../FLEET.md`
**L2 state:** `dags/<dagId>.json`
**Branch:** `<integration-branch>/<dagId>`

---

## Orchestrator model — check FIRST

This DAG contract is authored for an orchestrator running as **`<orchestrator-model>`**
(`<failureTolerance>` DAG → `<orchestrator-model>` by design). Before reading tasks or
spawning anything, confirm your own model matches.

If your model does **not** match `<orchestrator-model>`, STOP and output:

> ⛔ Wrong orchestrator model. DAG `<dagId>` requires **`<orchestrator-model>`** (failureTolerance:
> `<failureTolerance>`). Switch with `Ctrl+P`, then re-dispatch from the captain. Do NOT record
> any progress or emit any verdict.

**Caveman output (default).** Operate caveman-compressed: drop articles/filler/hedging, fragments
OK, keep full technical substance. Tell every subagent to report caveman too. Stay normal for:
code, commit messages, L2 state file contents, and security notes.

---

## DAG goal

<1–2 sentences: what this DAG achieves. Must be independently verifiable — the judge reads only
this contract + L2 state.>

## Done-condition (verifiable)

This DAG is done when **all** of the following are true:

- [ ] All tasks in the task-DAG below have `edgeGateStatus: passed` in L2 state.
- [ ] All tasks have `acceptanceResult: pass` (checkCommand ran green).
- [ ] All tasks have `reviewVerdict: pass`.
- [ ] The DAG integration check (last task's checkCommand) passes.
- [ ] All work committed to branch `<integration-branch>/<dagId>`.

**DAG integration check (level-DAG, run by last task's reviewer):**
`<dag-level-integration-check-command>`

---

## Review topology

**This DAG uses:** `<orchestrator-model>` orchestrator → `<review-topology-description>`

<!-- Fill one of the two blocks below; delete the other. -->

<!-- Block A: Sonnet orchestrator (separate reviewer per task) -->
**Sonnet orchestrator → separate reviewer per task.** The orchestrator dispatches implementers
and then spawns a separate `<reviewer|deep-reviewer>` per task. Reviewer executes
`checkCommand`, records `acceptanceResult`, returns verdict. Orchestrator does NOT review its
own work. Edge-gate opens only when `reviewVerdict: pass` AND `acceptanceResult: pass`.

<!-- Block B: Opus orchestrator (inline reviewer) -->
**Opus orchestrator → inline reviewer.** The orchestrator (Opus) doubles as reviewer after
each implementer returns. Opus executes `checkCommand`, records `acceptanceResult`, decides
`reviewVerdict`. A separate reviewer agent is NOT spawned (Opus is authoritative for both
orchestration and review on this low-tolerance DAG). Edge-gate opens only when `reviewVerdict:
pass` AND `acceptanceResult: pass`.

---

## NO iteration loop (fleet ≠ ralph)

This DAG executes **ONCE**. There is no loop. If a task fails twice (implementer fails twice
on the same task after judge-instructed fix attempts), record the failure in L2 state and
report to the captain as `DAG_FAILED`. Do NOT loop. The judge will assess after the DAG
completes; retry decisions belong to the captain (bounded 2× at the DAG level).

---

## Task-DAG

<!-- One block per task. Depth = internal dependency; parallel tasks share the same "Group".
     checkCommand must be a real executable that proves the task. Every task is run ONCE.
     Last task must include the DAG integration check as its checkCommand (or append it). -->

### Task <t1> — <title>

- **taskId:** `<t1>`
- **dependsOn:** `[]`
- **parallel group:** `<G1>` _(tasks sharing a group run in parallel in separate branches)_
- **tier:** `<implementer-critical|implementer|implementer-lite>`
- **thinking:** `<high|medium|low>`
- **reviewer:** `<deep-reviewer|reviewer>` _(or "inline-opus" if Opus-orch)_
- **checkCommand:** `<exact executable command that proves this task's work>`
- **Do:** <what the implementer must implement — specific, not vague>
- **Done when:** <concrete verifiable criterion + which command proves it>
- **Touches:** <files/modules/areas — used to detect false parallelism between grouped tasks>

### Task <t2> — <title>

- **taskId:** `<t2>`
- **dependsOn:** `["t1"]`
- **parallel group:** `<G2>`
- **tier:** `<implementer-critical|implementer|implementer-lite>`
- **thinking:** `<high|medium|low>`
- **reviewer:** `<deep-reviewer|reviewer>`
- **checkCommand:** `<exact executable command>`
- **Do:** <...>
- **Done when:** <...>
- **Touches:** <...>

<!-- Add more task blocks as needed. Last task: include DAG integration check. -->

### Task <tN> — <title> (LAST TASK — carries DAG integration check)

- **taskId:** `<tN>`
- **dependsOn:** `["<tN-1>"]`
- **parallel group:** `<GN>`
- **tier:** `<tier>`
- **thinking:** `<level>`
- **reviewer:** `<reviewer>`
- **checkCommand:** `<dag-level-integration-check-command>`
  _(This is the DAG integration check — covers cross-task integration for the whole DAG.)_
- **Do:** <...>
- **Done when:** All tasks done + `<dag-level-integration-check-command>` passes green.
- **Touches:** <...>

---

## Execution protocol

### Pre-flight (first dispatch only)

Before any task work, confirm ground is solid. If any check fails and cannot be fixed quickly,
record in L2 state `assumptions[]` and report `DAG_FAILED` to captain.

- [ ] Branch `<integration-branch>/<dagId>` exists (create from `<integration-branch>` if not).
- [ ] L2 state file `dags/<dagId>.json` present and readable.
- [ ] Required tooling present: <tools/deps, e.g. node, pytest, bun>.
- [ ] Baseline check: `<dag-level-integration-check-command>` or a subset, passes on clean tree.
- [ ] Assumptions from L2 state[] reloaded into context (do not re-decide what is already decided).

### Per-task execution (no loop — execute once)

For each task in dependency order (unblock tasks whose `dependsOn[]` are all `edgeGateStatus:
passed`):

1. **Implement.** Spawn `<implementer-tier>` with `thinking: <level>`. Give it: the task spec,
   done-condition, `checkCommand`, branch path, and the instruction to commit work to
   `<integration-branch>/<dagId>` before reporting back. If resuming a handed-over task, pass
   the handover doc too.

2. **Read implementer `RESULT`:**
   - **`HANDOVER`** — implementer hit context budget, wrapped up cleanly. NOT a failure. Save
     handover doc to `dags/<dagId>/handovers/<taskId>-<seq>.md`, spawn fresh implementer for
     the same task with the handover doc. Repeat until `PASS` or `FAIL`.
   - **`PASS` / `FAIL`** — proceed to step 3.

3. **Verify + review.**
   - _(Sonnet orchestrator)_ Spawn `<reviewer>` with `model: <reviewer-model>`. Give it: diff,
     `checkCommand`, done-condition, and task spec. Reviewer MUST run `checkCommand` and record
     the result as `acceptanceResult`. Reviewer returns `reviewVerdict: pass | fail | needs-fix`.
   - _(Opus orchestrator)_ Orchestrator runs `checkCommand` directly, records `acceptanceResult`,
     then makes inline review decision (`reviewVerdict`).

4. **Edge-gate decision:**
   - `reviewVerdict: pass` AND `acceptanceResult: pass` → update L2 `edgeGateStatus: "passed"`.
     Commit L2 state. Unblock any downstream tasks that were waiting.
   - Otherwise → if first attempt: send failure + reviewer notes back to implementer, retry once
     (implementer attempt 2). If second attempt fails: record in L2 state, proceed with remaining
     tasks if possible, then report `DAG_FAILED` when all tasks processed.
   - **Never attempt more than twice per task.** The judge decides what happens after that.

5. **After every task step:** update L2 state (`edgeGateStatus`, `commitSha`, `acceptanceResult`,
   `reviewVerdict`), commit L2 state file to branch. Resume-safe.

### Handover (context management)

An implementer nearing its context limit wraps up into a handover doc and returns `RESULT:
HANDOVER`. This is context management, NOT a failure — it does not increment the task's attempt
count. The orchestrator saves the handover doc (path: `dags/<dagId>/handovers/<taskId>-<seq>.md`),
spawns a fresh implementer for the same task with that doc as starting context. Repeat until
`PASS` or `FAIL`.

### Assumptions (decide yourself — do not escalate technical questions to captain)

Technical ambiguity (spec gaps, two valid designs, missing context in the contract) is resolved
by the orchestrator independently. Record in L2 `assumptions[]` — context, decision, rationale,
reversible flag. Do NOT escalate to captain. Only genuine hard-dependency failures (cannot
continue without information that only the captain or human can provide) justify stopping.

### After all tasks complete

1. Confirm all tasks `edgeGateStatus: passed` in L2 state. If any failed: all were attempted,
   none blocked on a decision — ready for judge.
2. Run `<dag-level-integration-check-command>` once more. Record result.
3. Commit final L2 state to `<integration-branch>/<dagId>`.
4. Report to captain: `DAG_COMPLETE` (all passed) or `DAG_FAILED` (some tasks failed, all
   attempted). Captain dispatches the judge.

---

## Judge handoff

After this DAG completes (all tasks attempted), the **captain** spawns a post-DAG judge (Opus,
state-file-only) with:
- This contract (`dags/<dagId>-contract.md`) — for the DAG goal and done-condition.
- The L2 state file (`dags/<dagId>.json`) — for all task results and `acceptanceResult` values.

**Judge evaluates:**
- Lapis 1 (objective): all tasks `acceptanceResult: pass`? DAG integration check green?
- Lapis 2 (semantic): does the combined output meet the DAG goal holistically?

**Judge is AUTHORITY.** Its verdict (`pass | fail | needs-fix`) is the gate. The judge does NOT
run commands — it trusts the `acceptanceResult` values recorded in L2 state by the reviewer.

**Bounded 2× at captain level.** If judge says `fail`/`needs-fix`, captain may re-dispatch this
orchestrator once more with judge feedback. After two judge failures, captain marks DAG `failed`.
The orchestrator does NOT know the retry count — that is captain's concern.

---

## Escalation boundary

```
implementer escalates → orchestrator  (resolves, records in L2 assumptions[])
orchestrator escalates → captain      ONLY for: DAG_COMPLETE | DAG_FAILED | unresolvable hard-stop
captain escalates → human             ONLY when fleet cannot continue without human input
```

Technical questions NEVER reach captain. Orchestrator is the technical decision-maker for this
DAG. Only status (complete/failed) and genuine hard-stops flow up.
