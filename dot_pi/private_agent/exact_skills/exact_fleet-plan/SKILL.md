---
name: fleet-plan
description: >-
  Use this to author a Fleet captain contract — the FLEET.md plus per-DAG contracts plus
  instantiated state files (L1 captain + L2 per-DAG) — that a captain SKILL will execute as
  a DAG-of-DAG autonomous build. Trigger this whenever the user wants to "plan a fleet",
  "make a fleet plan / fleet contract", set up an XL or greenfield multi-DAG autonomous
  build, prepare an epic for the captain, drive fleet with DAG orchestration plus judge gates
  plus cost-aware model routing, or asks how to orchestrate a major feature with multiple
  parallel DAGs and per-DAG judge gates. Also triggers on "fleet run", "captain contract",
  "DAG-of-DAG plan", "multi-DAG epic", "greenfield plan with autonomous agents".
  This skill is Opus-only by design: a good fleet contract requires deep architectural
  questioning before any planning begins, which Opus does best. It stops early and hands
  back to the user if the current model is not Opus.
---

# Fleet Plan — author a captain contract for the fleet captain SKILL

This skill produces the artifacts the fleet captain needs to run an XL or greenfield epic
autonomously as a DAG-of-DAG: one captain contract (FLEET.md), one per-DAG contract per DAG
orchestrator, and two levels of state files (L1 captain state + L2 per-DAG state). You (Opus)
are the planner; you do **not** run the fleet. You interview the user, decompose the epic into
DAGs and tasks, assign model routing, wire the dependency graph, and write fully self-contained
contracts with executable truth signals per task.

## Why Opus plans and cheaper sessions orchestrate

A fleet contract fans out into hours of autonomous work across many agents with minimal human
oversight. Every ambiguity left in the plan gets amplified across DAGs and retries — far more
expensive than the planning tokens. So we spend Opus once, up front, to interview hard and
remove ambiguity — then let Sonnet orchestrators drive DAGs and Opus judges gate them. The goal
is **maximum benefit at chosen cost**: suppress expensive tokens where they don't buy correctness,
spend them where they prevent expensive mistakes.

## Fleet vs Ralph — critical differences (bake into every decision)

| Aspect | Fleet | Ralph |
|---|---|---|
| Scope | XL / major / almost always greenfield | L / feature / long implementation |
| Structure | DAG-of-DAG (captain → per-DAG orchestrator → tasks) | single slice, task-DAG |
| Iteration loop | **NONE** — execute once, gate with judge | **present** — acceptance.command run-until-pass |
| Gate | **Judge per-DAG (authority, bounded 2x)** | acceptance.command + judge advisory |
| Human in loop | no — autonomous, resume-driven | yes — human usually present |
| "Retry" | judge decision (bounded 2x → DAG failed) | loop iterate until acceptance passes |
| Wave | **GONE** — pure `dependsOn` DAG | not applicable |

Never write "loop until acceptance passes" or reference waves in any fleet artifact.

---

## Step 0 — Opus gate (do this first, before anything else)

Look at the model identity in your system context. If the model id does **not** start with
`claude-opus`, STOP immediately. Do not interview, do not write files. Output exactly this and end:

> ⛔ `/fleet-plan` needs Opus. You're on a different model. Switch to an Opus model (e.g. `Ctrl+P`
> → Opus) and run `/fleet-plan` again. Opus is required because a good fleet contract comes from
> asking many hard architectural questions before planning, and that's where Opus earns its keep.

Only continue past this point when you have confirmed you are Opus.

---

## Step 1 — Interview (ask a lot; one question at a time)

Fleet is almost always greenfield — there is no existing code to fall back on, so every gap in
the interview becomes a design decision made by an unsupervised Sonnet orchestrator under time
pressure. Do not rush. Drive a real dialogue, one question per turn, until you could hand the
contract to a stranger and trust the outcome. Cover at minimum:

- **Goal & done-condition.** What does "the epic is finished" mean in verifiable terms? What
  command or script proves the whole thing works end-to-end? If no objective check exists yet,
  invent one with the user — fleet without a truth signal is unsafe.
- **Repo reality.** Branch to base off, build/test/lint commands, how long they take, what's
  currently green, languages/frameworks, monorepo vs polyrepo. Read the repo to confirm rather
  than trusting memory.
- **Scope boundaries.** What is explicitly out of scope? What must NOT be touched? Which services
  or systems are off-limits?
- **Risk surface.** Which areas are dangerous (auth, migrations, payments, secrets, data deletion,
  public APIs, schema changes, irreversible ops)? These drive `failureTolerance` and
  `orchestratorModel` per DAG.
- **Decomposition into DAGs.** Can the epic be split into independent DAGs that can each run
  (and be judged) on their own? What are the cross-DAG dependencies? Prefer clean DAG boundaries
  that let low-tolerance work live in small dedicated DAGs (the cost lever).
- **Task breakdown per DAG.** For each DAG: what tasks does it contain, in what order, with
  what internal dependencies? Can tasks within a DAG run in parallel?
- **Budget posture.** Rough time/cost ceiling. How aggressively to prefer Sonnet orchestrators
  vs Opus? (Greenfield usually has more unknowns → more low-tolerance DAGs → more Opus usage.)
- **Resume / rate-limit expectations.** Is this multi-day? Will sessions be interrupted? State
  files go in the project repo for cross-machine resume.
- **Verification capability (real reflection).** Does CI config actually RUN tests (not just
  lint), or is the pipeline dormant/gated off? Does an integration test harness exist? Is a real
  DB reachable (connection string, local container, ephemeral cloud branch)? Is there a
  browser/E2E harness for UI work? Can the captain monitor CI results itself (`gh`/`glab` authed,
  token scope)? Read the repo to confirm — don't assume. Feeds Step 4.5.

Use the repo and any available docs tools to come prepared. Don't make the user tell you what
you can read yourself. For greenfield: be especially thorough on architecture questions — the
contracts are the architecture.

---

## Step 2 — DAG decomposition + dependency graph

Build two graphs:

**Graph 1 — DAG-level (captain's graph):** Each node is a DAG (major workstream). Edges are
`dependsOn[]` — a DAG can only start when all its dependencies have `status: passed`. No waves,
no barrier sync. Captain computes the runnable-set dynamically: DAG `d` is runnable ⟺ all
`d.dependsOn[]` have `status: passed` AND `d` is not in `failedDags[]`. When no DAG is runnable
and none is running, fleet stops.

**Graph 2 — task-level (per-DAG orchestrator's graph):** Each DAG contains a task-DAG — tasks
with `dependsOn[]` internal to that DAG. A downstream task is `blocked` until its upstream's
edge-gate is `passed`.

Rules for good decomposition:
- **Isolate low-tolerance work** into its own small DAG(s). This gives it an Opus orchestrator
  without Opus-orchestrating the entire epic (the main cost lever).
- **DAG boundaries = integration boundaries.** After a DAG passes its judge, its output should
  be self-contained and committable.
- **Cap task parallelism at 4** within a DAG. Beyond 4, split into sequential groups within
  the DAG's task-DAG.
- **Acyclic.** Verify both graphs are acyclic before writing any file.

---

## Step 3 — Two-axis model routing

Set both axes **per DAG** and **per task**, write them into the state files. Both axes are
determined by you (Opus planner) at planning time — deterministic, persisted, never re-derived.

### Axis 1 — orchestratorModel ← failureTolerance (per DAG)

Assign `failureTolerance` to each DAG based on its risk surface:

- **`low`** — auth, secrets, migrations, schema changes, money/payments, public-API contracts,
  data deletion, any irreversible operation. → `orchestratorModel: "opus"`. Keep these DAGs
  intentionally small (cost lever).
- **`standard`** — routine feature work, bounded changes, easy to verify. → `orchestratorModel:
  "sonnet"`.
- **`trivial`** — purely mechanical, scaffolding, config, docs. → `orchestratorModel: "sonnet"`.

**Safety ratchet (upgrade-only):** tier order is `implementer-lite < implementer <
implementer-critical` and `reviewer < deep-reviewer`. Orchestrator may raise the effective tier
≥ planned; never lower it. Resume reads the effective tier — no silent-downgrade, no
re-judgment.

**Default assignment mapping** (planner sets `planned*`; write into L1 `dags[].assignment`):
- `low` → `implementer-critical` + `deep-reviewer`
- `standard` → `implementer` + `reviewer`
- `trivial` → `implementer-lite` + `reviewer`

### Axis 2 — thinking level (per task and per DAG)

Set `thinking` per DAG (DAG-wide default) and per task (task override). Map by complexity:
- `high` — novel algorithms, security-critical logic, complex state machines, cross-cutting design
- `medium` — feature implementation with some design decisions, integration work
- `low` — mechanical changes, scaffolding, straightforward CRUD, test additions

### Review topology (follows from failureTolerance)

- **Opus orchestrator** (low-tolerance DAG) → orchestrator doubles as reviewer inline. Opus is
  authoritative for both orchestration and review. The judge post-DAG still runs.
- **Sonnet orchestrator** (standard/trivial DAG) → separate reviewer per task (Sonnet cannot
  review its own work for low-tolerance edges). Reviewer is spawned by the orchestrator.

**Large epic → split by orchestratorModel (the main cost lever).** Don't Opus-orchestrate the
whole thing. Isolate low-tolerance work into small dedicated DAGs under Opus, let the mechanical
remainder run as Sonnet-orchestrated DAGs. If you're about to tag a whole large epic as
`failureTolerance: low`, re-decompose instead.

State your routing choices and one-line reasons in FLEET.md's Implementation Strategy section.

---

## Step 4 — The deliverables

You must produce these artifacts (five always, plus SETUP.md when provisioning is required —
see Step 4.5). Leave no `<...>` placeholder unfilled.

### Deliverable (a) — FLEET.md captain contract

Build from `assets/FLEET.template.md`. Location: `plans/fleet/<yyyy-mm-dd>-<epic>/FLEET.md`
in the **project repo** (not `~/.pi`). Must be fully self-contained — the captain re-reads it
on every resume and has no other memory. Covers: epic goal, done-condition, DAG-of-DAG overview
table, per-DAG summary (id, dependsOn, failureTolerance, orchestratorModel, thinking, judge
setup), branch strategy, resume note, knowledge-promotion note.

### Deliverable (b) — per-DAG contract for each DAG orchestrator

Build from `assets/per-DAG-contract.template.md`. One file per DAG. Location:
`plans/fleet/<yyyy-mm-dd>-<epic>/dags/<dagId>-contract.md`. The orchestrator re-reads its
contract each time it resumes; it must stand alone without FLEET.md. Covers: DAG goal, task-DAG
(full task list with id, dependsOn, tier, thinking, checkCommand, done-condition), edge-gate
rule (review pass requires green `acceptanceResult`), review topology (Sonnet-orch → separate
reviewer; Opus-orch → inline), NO loop reminder, escalation boundary, judge handoff.

### Deliverable (c) — captain state.json (L1)

Instantiate from `templates/fleet-captain.state.template.json` (in the pi config repo at
`~/.pi/agent/templates/fleet-captain.state.template.json`). Location in project repo:
`plans/fleet/<yyyy-mm-dd>-<epic>/state.json`. Fill:
- `runName`, `baseBranch`, `integrationBranch`, `branchStrategy`
- `verification` block (from Step 4.5): `dbMode`, `uiMode`, `ciMonitor`, `runner`
- `dags[]` — every DAG with `dependsOn`, `failureTolerance`, `orchestratorModel`, `thinking`,
  `assignment` (planned* + effective* both set to the mapping above), and `needsDb`/
  `needsBrowser` booleans (per-DAG default; a task may override)
- `dagStatus` — one entry per DAG, all `status: "pending"`, `level2` pointer set
- `failedDags: []`, `stopFlag.stopped: false`
- `phases` — all `"pending"` (filled by captain at runtime)
- Remove `_doc`, `_example`, and `_*` annotation keys before writing the final file.

### Deliverable (d) — per-DAG state.json (L2)

Instantiate from `templates/fleet-slice.state.template.json`. One file per DAG. Location:
`plans/fleet/<yyyy-mm-dd>-<epic>/dags/<dagId>.json`. Fill:
- `dagId`, `branch` (e.g. `fleet/<epic>/<dagId>`)
- `assignment` — mirror the DAG's effective* from L1
- `tasks[]` — every task with `taskId`, `dependsOn`, `implementer`, `reviewer`, `thinking`,
  and `checkCommand`. Set `edgeGateStatus: "open"`, `acceptanceResult: null`, `reviewVerdict:
  null`, `commitSha: null` for all tasks.
- Remove `_doc`, `_example`, and `_*` annotation keys before writing the final file.

### Deliverable (e) — checkCommand per task + DAG integration check

Every task in every DAG must have a real, executable `checkCommand` — a command that proves
that specific task's work is correct (unit tests scoped to the task, a lint check, a build
target, a script). No "manual inspection" or "verify by reading." If no suitable command exists
yet, invent one with the user.

Additionally, the **last task in each DAG** must carry the **level-DAG integration check** as
its `checkCommand` (or as an appended step) — a command that proves the whole DAG's output
integrates correctly (e.g. a cross-module integration test, an end-to-end smoke test for that
workstream). The judge reads `acceptanceResult` values — it does not run commands — so the
executor must provide a green signal before the judge evaluates.

### Deliverable (f) — SETUP.md (conditional)

Produced by Step 4.5. Location: `plans/fleet/<yyyy-mm-dd>-<epic>/SETUP.md`. A copy-paste
checklist of **[REQUIRED]** provisioning only the user can do, plus the captain's
readiness-probe checklist (what it re-checks on every boot/resume). **Only when provisioning is
required** — if the audit in Step 4.5 found verification capability already sufficient, skip
this file and instead note "no provisioning required" in FLEET.md.

---

## Step 4.5 — Verification readiness preflight (real reflection)

A DAG that only typechecks/lints/unit-tests gives its implementer **fake reflection** — backend
code never touches a real DB, UI code never renders in a browser, and a green DAG can hide broken
behavior. Before the Gate, guarantee the run environment can give **real reflection**, and guide
the user to provision what's missing. Mandatory; do not skip to Step 5 without it.

**1. Audit what verification capability exists** (read, don't assume). Report as a table:

| Capability | Present? | Detail |
|---|---|---|
| CI actually runs tests | ? | pipeline config path, gated or dormant? |
| Integration test harness | ? | project/config name, or none |
| DB reachable | ? | connection string / local container / none |
| Browser/E2E harness | ? | Playwright/Cypress/etc, or none |
| CI monitoring | ? | `gh`/`glab` authed? token scope? |

**2. Offer pragmatic options — do not prescribe one.** Present alternatives, ask the user's
current state first:
- **Real DB for backend DAGs/tasks**: ephemeral cloud branch (Neon/PlanetScale, if API key) ·
  local container (Podman/Docker) · Postgres-as-CI-service (`services:`) · unit-only (weakest).
- **UI DAG/task depth**: E2E smoke (Playwright, truest, heaviest) · component browser-mode tests
  (middle) · build+typecheck (lightest).
- **CI monitoring**: give the captain read access (token) so it can treat a red pipeline as a
  blocker · or local-only (no remote monitoring).
- If a needed harness is absent (no integration DB, no browser harness), **building it is itself
  a dedicated setup DAG (no dependencies, runs first)** — not an afterthought bolted onto a
  feature DAG.

**3. Encode real reflection into every task's `checkCommand`.** Tag DAGs `needsDb`/
`needsBrowser` (may override per task) so the captain can verify the env supplies each before
dispatching. A task that writes data or renders UI must NEVER have its `checkCommand` degrade to
typecheck/lint-only.

**4. Write `SETUP.md`** into `plans/fleet/<yyyy-mm-dd>-<epic>/` — a copy-paste checklist of
**[REQUIRED]** provisioning only the user can do (credentials, containers, browser deps, CI vars,
monitoring token) plus a captain readiness-probe checklist. **Build stays blocked until the
required items are green** — the captain re-probes readiness on every boot and resume (see
`captain` skill §0/§2/§6), not just once at Gate.

If no provisioning is required (verification capability already sufficient), skip writing
SETUP.md and record "no provisioning required" in FLEET.md instead.

---

## Step 5 — Judge gate (no loop)

Each DAG is gated by a post-DAG judge. Understand this well and bake it into every contract:

- **Judge = Opus, state-file-only, authority.** The judge reads the L2 state file (`dags/<dagId>.json`)
  and evaluates: all tasks' `acceptanceResult` (objective lapis-1) + integration/goal holistically
  (semantic lapis-2). The judge never executes commands; it trusts the `acceptanceResult` values
  recorded by the reviewer/orchestrator.
- **Verdict options:** `pass` | `fail` | `needs-fix`. `pass` → captain marks DAG `passed` and
  unlocks dependents. `fail`/`needs-fix` → orchestrator gets one more attempt (bounded 2×).
- **Bounded 2×.** After two judge failures, captain marks DAG `failed` and adds it to
  `failedDags[]`. Captain then rescans: DAGs that don't depend on the failed DAG continue;
  DAGs that do are marked `blocked-hard`. When no runnable DAG remains, fleet stops.
- **Contrast with Ralph:** Ralph loops until `acceptance.command` passes (human in the loop, no
  bound). Fleet executes each DAG ONCE (no loop), then the judge decides — a hard architectural
  boundary. Never write iteration loop logic into a fleet orchestrator contract.

---

## Step 6 — State file locations

All state files go **relative to the project repo** (not `~/.pi`), committed to that repo for
cross-machine resume:

```
<repo>/plans/fleet/<yyyy-mm-dd>-<epic>/
  FLEET.md                          # captain contract (Deliverable a)
  state.json                        # L1 captain state (Deliverable c)
  SETUP.md                          # verification-readiness checklist (Deliverable f, conditional)
  dags/
    <dagId>-contract.md             # per-DAG contract (Deliverable b, one per DAG)
    <dagId>.json                    # L2 orchestrator state (Deliverable d, one per DAG)
```

The `~/.pi/agent/templates/` directory holds the template masters — planner copies and
instantiates them into `<repo>/plans/fleet/...`. The project repo is the single source of truth
for all runtime state; `~/.pi` is for meta-config only.

---

## Step 7 — Self-review the contracts before handoff

Re-read every file with fresh eyes and fix inline:

- **No placeholders.** Zero `<...>` or TODO left — every slot filled, including `checkCommand`
  per task, `branchStrategy`, `orchestratorModel` per DAG, integration branches.
- **Every task verifiable.** Each `checkCommand` is a real executable that proves the task. No
  vibe-checks.
- **Both graphs acyclic.** DAG-level `dependsOn` acyclic. Task-level `dependsOn` within each
  DAG acyclic.
- **Judge gate defined.** Every DAG has a `judge` block in L1 state, verdict `null`, attempt `0`.
- **orchestratorModel set per DAG.** Every DAG has an explicit `orchestratorModel` matching its
  `failureTolerance` (low→opus, else sonnet).
- **Last task carries DAG integration check.** Each DAG's final task has an integration-level
  `checkCommand`.
- **No loop language.** No "retry until passes", no "acceptance command loop", no waves.
- **L2 state matches contract.** Every task in `<dagId>-contract.md` has a corresponding entry
  in `<dagId>.json` with the same `taskId` and `checkCommand`.
- **Real reflection, not fake.** Every data-writing or UI-rendering task has a `checkCommand`
  that actually exercises that behavior (real DB / real render) — never typecheck-only or
  lint-only for those tasks.
- **Verification tags consistent.** L1 `verification` block is filled (`dbMode`, `uiMode`,
  `ciMonitor`, `runner`); per-DAG `needsDb`/`needsBrowser` tags match what their tasks'
  `checkCommand`s actually require.

Fix anything found; no need to re-review after fixing.

---

## Step 8 — Caveman output + subagents

**Caveman by default.** Fleet contracts must instruct the captain and every spawned orchestrator
to operate caveman-compressed: drop articles/filler/pleasantries/hedging, fragments OK, keep
full technical substance. Narration is the cheapest token to cut and subagent reports flow back
into the captain's context across many turns. Code, commit messages, state file contents, and
security notes stay normal.

**Subagents reused.** Fleet reuses existing agent files: `implementer` ×3
(lite/std/critical), `reviewer` ×2 (std/deep), `scout`, `planner`, `support`. New agent files:
`fleet-orchestrator` (per-DAG, nested, `tools: Agent`, fresh context), `judge` (Opus,
state-file-only). The captain skill drives the captain loop. Verify all referenced agent files
exist before writing the contracts; if missing, tell the user.

**Implementers don't compact — they hand over.** An implementer nearing its context limit wraps
up at a clean point into a handover doc and returns `RESULT: HANDOVER`; the orchestrator spawns
a fresh implementer to continue. This is not a failed attempt. Write it into each per-DAG
contract.

---

## Step 9 — Terminal handoff (this skill does not run the fleet)

This skill is terminal. After writing all five deliverables and passing self-review, end by
printing a copy-paste handoff. Remind the user that `/clear` wipes the visible transcript.

```
✅ Fleet contract ready: plans/fleet/<yyyy-mm-dd>-<epic>/

Artifacts:
  FLEET.md              — captain contract
  state.json            — L1 captain state (all DAGs: pending)
  dags/<id>-contract.md — per-DAG contract (one per DAG)
  dags/<id>.json        — L2 orchestrator state (one per DAG)

Next:
1) Copy this block (/clear erases the chat).
2) Commit the plans/ directory to the project repo (cross-machine resume).
3) Switch model to Sonnet for scout/review, or keep Opus for the captain session.
4) Launch the captain skill:
   /captain plans/fleet/<yyyy-mm-dd>-<epic>/state.json

The captain reads FLEET.md + state.json, computes the runnable-set, and dispatches
DAG orchestrators. It does NOT loop — each DAG executes once, then the judge gates it.
```

If there are DAG ordering constraints the user must know about (e.g. "deploy DAG depends on
migrate DAG — do not attempt to run them in parallel"), call them out explicitly.
