<!--
  FLEET.template.md — Fleet captain contract.
  Opus (the planner) fills every <...> placeholder and deletes guidance comments like this one.
  This file is read by the captain SKILL on every resume — it must stand alone. The captain has
  no other memory except this file, state.json, and the project repo.
  Fleet is NOT Ralph: no iteration loop, no acceptance.command run-until-pass, no waves.
  Gate = judge per-DAG (authority, bounded 2×). Pure dependsOn DAG.
-->

# Fleet Contract — <yyyy-mm-dd>-<epic-name>

## Captain model — check FIRST, before anything else

This contract is authored for a captain running as **`<captain-model>`** (Opus authored this;
the captain is typically Sonnet unless the entire epic is low-tolerance). Before reading DAGs or
spawning anything, confirm your own model matches.

If your model id does **not** match `<captain-model>`, STOP immediately and output:

> ⛔ Wrong captain model. This fleet contract requires **`<captain-model>`**. Switch with
> `Ctrl+P`, then restart with the same launch command. Do NOT emit the fleet completion signal.

Only proceed when your model matches `<captain-model>`.

**Caveman output (default).** Operate caveman-compressed: drop articles/filler/pleasantries/
hedging, fragments OK, keep all technical substance. Instruct every spawned orchestrator and
judge to report caveman too. Stay normal for: code, commit messages, state file contents, and
security notes.

---

## Epic goal

<1–3 sentences: what this fleet run achieves. Business outcome + technical deliverable.>

## Done-condition (verifiable)

The fleet is done when **all** of the following are true:

- [ ] All DAGs have `status: passed` in `state.json`.
- [ ] Integration branch `<integration-branch>` is green: `<epic-level-verify-command>`.
- [ ] All L2 state files show every task with `acceptanceResult: pass`.
- [ ] Judge verdict `pass` recorded in L1 `dags[].judge.verdict` for every DAG.
- [ ] Merge-handoff summary written and committed.

The epic-level verify command is: `<epic-level-verify-command>`

Do NOT merge to base branch yourself — that is the human approval gate.

---

## Implementation strategy

<2–6 sentences: the architectural approach, key design decisions Opus made during planning,
the decomposition rationale, why specific DAGs are low-tolerance vs standard, and anything the
captain must NOT do (out-of-scope, systems not to touch, branches not to push).>

**Orchestrator model rationale:**
<For each DAG, one line: "dagId=<id>: <failureTolerance> → <orchestratorModel> because <reason>">

---

## Branch strategy

- **Base branch:** `<base-branch>`
- **Integration branch:** `<integration-branch>` (off `<base-branch>`)
- **Per-DAG branch:** `<integration-branch>/<dagId>` (off `<integration-branch>`)
- **Strategy model:** `<trunk | classic>`
- **Integration mode:** `<auto-push | pr-mr>`
- **After all DAGs pass:** <describe how the human merges integration-branch to base-branch>

---

## DAG-of-DAG overview

<!-- One row per DAG. dependsOn uses DAG ids. -->

| id | description | dependsOn | failureTolerance | orchestratorModel | thinking | judge |
|----|-------------|-----------|-----------------|-------------------|----------|-------|
| <d1> | <short description> | — | <low\|standard\|trivial> | <opus\|sonnet> | <high\|medium\|low> | Opus, bounded 2× |
| <d2> | <short description> | d1 | <low\|standard\|trivial> | <opus\|sonnet> | <high\|medium\|low> | Opus, bounded 2× |
| <d3> | <short description> | d1 | <standard\|trivial> | sonnet | <medium\|low> | Opus, bounded 2× |

**Dependency rules (captain enforces):**
- DAG runnable ⟺ all `dependsOn[]` have `status: passed` AND DAG not in `failedDags[]`.
- Captain recomputes runnable-set every time any DAG status changes.
- No runnable DAG + no running DAG → fleet stops. Set `stopFlag`.
- DAG failed → add to `failedDags[]` → dependents become `blocked-hard`.

---

## Per-DAG summary

<!-- Expand one block per DAG. The captain needs this to dispatch orchestrators correctly. -->

### DAG <d1> — <name>

- **Contract:** `dags/<d1>-contract.md`
- **L2 state:** `dags/<d1>.json`
- **Branch:** `<integration-branch>/<d1>`
- **failureTolerance:** `<low|standard|trivial>`
- **orchestratorModel:** `<opus|sonnet>`
- **thinking:** `<high|medium|low>`
- **Implementer (planned):** `<implementer-critical|implementer|implementer-lite>`
- **Reviewer (planned):** `<deep-reviewer|reviewer>` _(only spawned if Sonnet orchestrator)_
- **Judge:** Opus, state-file-only, authority. Bounded 2× retry.
- **Tasks (count):** <N>
- **Goal:** <one sentence>

### DAG <d2> — <name>

- **Contract:** `dags/<d2>-contract.md`
- **L2 state:** `dags/<d2>.json`
- **Branch:** `<integration-branch>/<d2>`
- **failureTolerance:** `<low|standard|trivial>`
- **orchestratorModel:** `<opus|sonnet>`
- **thinking:** `<high|medium|low>`
- **Implementer (planned):** `<implementer-critical|implementer|implementer-lite>`
- **Reviewer (planned):** `<deep-reviewer|reviewer>`
- **Judge:** Opus, state-file-only, authority. Bounded 2× retry.
- **Tasks (count):** <N>
- **Goal:** <one sentence>

<!-- Add more DAG blocks as needed -->

---

## Captain execution protocol

### Pre-flight (first dispatch only)

Before spawning any orchestrator, confirm ground is solid. If any check fails and cannot be
fixed quickly, record in state.json and set stopFlag.

- [ ] Base branch `<base-branch>` checked out and clean.
- [ ] Baseline green: `<epic-level-verify-command>` passes on clean tree.
- [ ] Required tooling present: <tools/deps>.
- [ ] Integration branch `<integration-branch>` exists (create from `<base-branch>` if not).
- [ ] All L2 state files present in `dags/`.
- [ ] All per-DAG contracts present in `dags/`.

### Runnable-set computation (repeat every status change)

```
runnable = {d | all d.dependsOn are status:passed} \ failedDags
```

Dispatch one `fleet-orchestrator` per runnable DAG (parallel). After dispatch, update L1
`dagStatus[d].status = "running"`.

### After orchestrator completes a DAG

1. Read L2 state `dags/<dagId>.json` — confirm all tasks `acceptanceResult: pass`.
2. Spawn judge (Opus, state-file-only): give it L2 state path + DAG goal from this contract.
3. Judge returns verdict `pass | fail | needs-fix`:
   - `pass` → update L1 `dagStatus[d].status = "passed"`, `judge.verdict = "pass"`.
     Recompute runnable-set. Promote any `knowledgeDelta` from L2 (Opus context, promote
     directly per §Knowledge promotion).
   - `fail` / `needs-fix` → increment `dags[d].judge.attempt`. If `attempt < 2` → re-dispatch
     orchestrator with judge feedback. If `attempt == 2` → mark L1 `dagStatus[d].status =
     "failed"`, add to `failedDags[]`. Recompute runnable-set.
4. Repeat until no runnable DAG remains.

### Fleet completion

When all DAGs are `passed` or `failed` (none `pending` or `running`):

1. Run `<epic-level-verify-command>` on `<integration-branch>`. Must pass.
2. Commit state.json + all L2 state files.
3. Write merge-handoff summary (see below).
4. Push `<integration-branch>`: `git push -u origin <integration-branch>`.
5. Offer PR/MR (never auto-create): `<pr-command-or-url>`.

### Merge-handoff summary (fill before stopping)

- **Outcome:** `<all-passed | partial: N of M DAGs passed, M-N failed>`
- **Epic verify:** `<epic-level-verify-command>` → `<pass|fail>`
- **Failed DAGs:** `<list, or "none">`
- **What changed:** <bullet summary per DAG>
- **Knowledge promoted:** <list of rules/skills promoted, or "none">
- **To merge (human runs):**
  ```
  git checkout <base-branch>
  git merge --no-ff <integration-branch>
  ```

---

## Resume protocol

Fleet is designed for autonomous multi-day runs with rate-limit interruptions. On every resume:

1. Read this file and `state.json`.
2. Skip all DAGs with `status: passed` or `status: failed`.
3. Re-enter DAGs with `status: running` — spawn orchestrator pointing at the existing L2 state
   (orchestrator reads L2 to find completed tasks and continues from the first incomplete task).
4. Dispatch all DAGs with `status: pending` that are now in the runnable-set.
5. Knowledge: reload `state.json.knowledge[]` into context before dispatching any orchestrator.

**State files are the only memory.** Captain has no cross-session memory except `state.json` and
the files committed to the repo. Every decision, every assumption, every verdict is recorded in
state files at the time it's made.

---

## Knowledge promotion

During fleet execution, Opus agents (judge, Opus orchestrators) may encounter durable conventions
worth persisting to `.pi/rules` or `.pi/skills`. Promotion rule:

- **Sonnet agents:** write `knowledgeDelta[]` in L2 state flagged `proposed`. Do not promote
  directly.
- **Opus agents (judge, Opus orchestrator, captain):** when a proposed item enters Opus context
  and is judged durable/reusable, promote directly via `writeKnowledge()` without asking —
  fleet is autonomous, permission is implicit.

After each DAG judge run, captain checks L2 `knowledgeDelta[]` and promotes Opus-reviewed items.
Append to L1 `knowledge[]` for cross-DAG awareness.

---

## Escalation boundaries

- **Technical ambiguity** (spec gaps, two valid designs): orchestrator decides, records in L2
  `assumptions[]`. Does NOT escalate to captain.
- **Hard dependency failure** (judge 2× fail → DAG failed): captain rescans runnable-set,
  marks blocked dependents, continues what it can, eventually sets `stopFlag`.
- **Truly unresolvable** (captain cannot continue without human input): set `stopFlag` with
  reason, commit state, output clear human-readable stop message explaining what is needed.
  Never spin on an unresolvable block.
