---
name: fleet
description: Use when the user wants to build an XL / greenfield / multi-DAG feature autonomously via a control-plane "fleet" — a captain (this main session) tracks a DAG-of-DAG, spawns one fleet-orchestrator per runnable DAG (which nests implementer + reviewer per task), gates each DAG with a post-DAG fleet-judge, merges passing DAGs into an integration branch, and propagates knowledge between DAGs. Rate-limit-safe and resumable on a bare "continue". Personal-use, Pro-plan friendly.
---

# Fleet — autonomous DAG-of-DAG control plane

You (this main session) are the **fleet-captain**. You do not write DAG code yourself. You plan
(or ingest a plan), dispatch orchestrators, persist state, gate with judges, and merge. Everything
runs as nested subagents of THIS loop, so an injected `continue` after a rate-limit reset resumes
you.

Worker tree: **captain (you)** → `fleet-orchestrator` (one per runnable DAG, background, `model:
dag.orchestratorModel`, has Agent tool) → `fleet-implementer` + `fleet-reviewer` (leaves, no Agent
tool, per task) · **captain** → `fleet-judge` (one per completed DAG, always `model: opus`, leaf,
state-file-only).

This is a **pure DAG**, not waves. There is no wave barrier anywhere in this flow — a DAG unblocks
the moment its dependencies pass, no matter what else is still running.

[Communication: respond in caveman ultra mode per global CLAUDE.md. Code/commits/security normal. Persist every response.]

## State persistence across machines

All fleet state lives in `plans/fleet/<yyyy-mm-dd>-<epic>/` inside the repo — **committed to
git**. Any machine that does `git pull` can resume the run. Never put fleet state in `.claude/`
(gitignored on most setups) or in temp dirs. The `plans/` tree is the source of truth; disk state
drives idempotent resume.

```
<repo>/plans/fleet/<yyyy-mm-dd>-<epic>/
  FLEET.md              # captain contract — ingests the FASE-1 spec, self-contained
  state.json            # L1: dags[] (dependsOn, failureTolerance, orchestratorModel, thinking,
                         #     assignment, judge{verdict,attempt}), dagStatus, failedDags[],
                         #     knowledge[], stopFlag, verification block, status, approved
  SETUP.md              # Phase 1.5 output (kept from current fleet)
  dags/
    <dagId>-contract.md # per-DAG contract (stands alone; NO loop language)
    <dagId>.json         # L2: tasks[] (dependsOn, implementer, reviewer, thinking,
                         #     edgeGateStatus, commitSha, checkCommand, acceptanceResult,
                         #     reviewVerdict), assignment ratchet, knowledgeDelta[]
```

Template masters for the two JSON files live at `~/.claude/templates/fleet-captain.state.template.json`
and `~/.claude/templates/fleet-dag.state.template.json`. Planning copies + instantiates them into
the project repo, stripping `_doc`/`_example`/`_*` annotation keys.

## Captain model guard (first thing, always)

The captain MUST run on **Opus**. If this main session is not Opus, STOP immediately, do not plan
or dispatch, and tell the user to `/model` to Opus and re-invoke. A fleet driven by a non-Opus
captain is not authorized. (This is an authorized early-exit, not a failure.)

## ALWAYS step 0 — resume check

Before anything else, check for an active run in the current repo:
- Glob `plans/fleet/*/state.json`. Find any file where `status: "running"`. The parent dir is
  `plans/fleet/<yyyy-mm-dd>-<epic>/`.
- **If found** → this is a RESUME (likely an injected `continue` after a rate-limit or a
  cross-machine handoff after `git pull`). Skip Plan and Gate. Re-read `state.json` + `git log
  <integrationBranch>` + `git worktree list`, recompute the runnable set for DAGs still
  `pending`/`running`/`failed`, and jump straight to **Build** (§ Scheduling loop). Do NOT
  re-plan, do NOT re-ask the gate.
- **If absent** → fresh run, start at Plan.

This is what makes the zellij continue-injector work: a bare `continue` lands here, finds the
running `state.json`, and resumes idempotently.

## Phase 1 — Plan (ingest the spec; fill gaps only)

**Spec-first, always.** Fleet Phase 1 does NOT run a from-scratch interview. It INGESTS the
FASE-1 spec at `plans/<scope>/SPEC.mdx` (+ any supporting `docs/design/<yyyy-mm-dd>-<topic>.mdx`).
The spec is authoritative — never re-plan, never reinterpret it.

- **No spec exists at `plans/<scope>/SPEC.mdx`?** STOP. Do not bootstrap a spec here. Route the
  user to the `feature-planning` skill (FASE 1) first. Fleet Phase 1 is gap-filling + decomposition,
  not spec authoring.
- **Spec exists** → spawn `opus-planner` (read-only) to fill gaps and decompose the spec into
  DAGs. Its job is NOT to re-interview from zero — it reads the spec, asks only about what the
  spec left ambiguous (via AskUserQuestion, one question per turn, the user is present for
  planning even though Build runs unattended), and produces the DAG-of-DAG decomposition. It must
  NOT finalize while anything material is still ambiguous. It also probes verification capability
  (CI/test-tooling/DB/monitoring) and returns a `verification` block + per-DAG `needsDb`/
  `needsBrowser` tags + real executable `checkCommand`s per task (feeds Phase 1.5).

**Two-axis routing, set once by the planner, never re-derived:**
- **Axis 1 — `orchestratorModel` ← `failureTolerance`** (per DAG): `low` (auth/secrets/migration/
  schema/public-API/money/data-deletion/irreversible) → `orchestratorModel: opus` +
  `implementer-critical` + `deep-reviewer` (Opus doubles as reviewer inline). `standard`/`trivial`
  → `orchestratorModel: sonnet` + `implementer`/`implementer-lite` + separate `reviewer` per task.
- **Axis 2 — `thinking`** (per DAG and per task): reasoning effort mapped by complexity —
  `high`/`medium`/`low`.
- **Safety ratchet (upgrade-only):** `planned*` and `effective*` both persisted in `assignment`.
  An orchestrator may raise effective tier ≥ planned, never lower it. Resume always reads
  `effective*` — no silent-downgrade, no re-judgment.
- **Isolate low-tolerance work into small dedicated DAGs** — the cost lever. Don't tag a whole
  large epic `failureTolerance: low`; re-decompose instead.

**Decomposition rules the planner must satisfy:**
- Two graphs: DAG-level (`dags[].dependsOn`) and, inside each DAG, a task-level graph
  (`tasks[].dependsOn`). **Both must be acyclic** — verify before writing any file.
- Cap intra-DAG task parallelism at 4. Beyond 4, split into sequential groups within the DAG.
- **Every task needs a real, executable `checkCommand`** — no "verify by reading." If none exists
  yet, invent one with the user.
- **The last task of each DAG carries the DAG-level integration check** as its `checkCommand` (or
  an appended step) — proves the whole DAG's output integrates, not just each task in isolation.

**Detect trunk-based development.** Check for a project skill or `.claude/rules/` file that
declares trunk-based development (TBD). Also have the planner probe: is there a GitLab/GitHub
branch protection requiring PRs, or does the team push directly to `main`/`master`? Set
`branchStrategy.trunkBased: true` in `state.json` if TBD is confirmed. This changes the merge
target in Build (see below).

**Resolve the integration branch start point.** For non-TBD runs the `integrationBranch` is cut
from `origin/<baseBranch>`. If the start point is **ambiguous** — `baseBranch` itself unclear
(multiple long-lived branches, no obvious default; or an existing `integrationBranch` with a
different base than expected) — **the captain MUST ask the user** (AskUserQuestion) before writing
`state.json`. Do not guess. Record the resolved `baseBranch`. (TBD mode has no integration branch,
so this only applies when `trunkBased: false`.)

The planner outputs, per §Step 4/6 of the pi `fleet-plan` mechanics adapted here:
- **`FLEET.md`** — the captain contract, self-contained, ingests the spec: epic goal,
  done-condition, DAG-of-DAG overview table, per-DAG summary (id, dependsOn, failureTolerance,
  orchestratorModel, thinking, judge setup), branch strategy, resume note, knowledge-promotion
  note. Author in the Astro/Starlight MDX dialect (see `astro-docs-authoring`); plain
  markdown is fine otherwise.
- **Per-DAG contracts** — `dags/<dagId>-contract.md`, one per DAG, standalone (the orchestrator
  re-reads it on every resume with no other memory): DAG goal, full task list (id, dependsOn,
  tier, thinking, checkCommand, done-condition), edge-gate rule, review topology, **NO loop
  language**, escalation boundary, judge handoff.
- **`state.json`** (L1) and **`dags/<dagId>.json`** (L2, one per DAG) — instantiated from the
  templates at `~/.claude/templates/`, `status: "planned"`, `approved: false`, all DAGs
  `dagStatus: pending`, all tasks `edgeGateStatus: open` / `acceptanceResult: null` /
  `reviewVerdict: null` / `commitSha: null`.

If the planner reports unresolved questions, relay them to the user and re-plan. **Do not proceed
to Gate with open questions.** Write and commit the whole `plans/fleet/<yyyy-mm-dd>-<epic>/` dir so
state is on origin immediately. Persist `seedKnowledge` into `knowledge[]`.

## Phase 1.5 — Verification readiness preflight (real reflection, attended)

A DAG that only typechecks/lints/unit-tests gives the implementer **fake reflection** — backend
code never touches a DB, UI code never renders in a browser, and a green DAG can hide broken
behavior. Before the Gate, the captain (with the planner) MUST guarantee the run environment can
give **real reflection**, and guide the user to provision what's missing. This phase is
mandatory; do not skip to Gate without it.

**1. Audit what verification capability exists** (read, don't assume): CI config (does the
pipeline actually run tests? integration? is it gated/dormant?), test tooling (vitest projects, is
there an integration project? a browser/E2E harness?), DB access (is a connection string in the
env? can integration run locally?), and **monitoring** — can the captain read CI results?
(`glab`/`gh` authed? token scope?). Probe the real state; report it as a table.

**2. Offer pragmatic options — do not prescribe one.** Setup cost is real; let the user pick by
what they already have. Always present alternatives and ask the user's current state first:
- **Real DB for backend DAGs/tasks**: Neon ephemeral branch (if API key) · local container
  (Podman/Docker `postgres:<min-version>`) · Postgres-as-CI-service (`services:`) · unit-only
  (weakest). Ask which the run-env supports before choosing.
- **UI DAG/task depth**: Playwright E2E smoke (truest, heaviest — add a dedicated harness DAG
  with no dependents) · vitest browser-mode component tests (middle) · build+typecheck (lightest).
- **CI monitoring**: give the captain read access (token) so it can treat a red pipeline as a
  blocker after each DAG merge · or rely on local gate only.
- If CI doesn't run tests at all, or a needed harness is absent → **building it is itself a DAG**
  (no dependents needed on it upfront), not an afterthought.

**3. Encode real reflection into every task's `checkCommand`** — backend (`needsDb`) DAGs run
integration against the real DB; UI (`needsBrowser`) DAGs run the E2E/component smoke. Tags now
live per-DAG (and may override per-task) so the captain can verify the env supplies each before
dispatching. Never let a task's `checkCommand` degrade to typecheck-only for a task that writes
data or renders UI.

**4. Write `SETUP.md`** into `plans/fleet/<yyyy-mm-dd>-<epic>/` — a concrete, copy-paste checklist
of the **[REQUIRED]** provisioning only the user can do (credentials, containers, browser deps, CI
vars, monitoring token) plus a captain readiness-probe checklist. Freeze the plan at `status:
"planned"`. **Build stays blocked until the required items are green** (captain re-probes on the
next `/fleet`/`continue`, and again on every subsequent Build entry). If the user chose "set up
together now", walk the commands interactively instead.

The planner returns a `verification` block (db mode, ui mode, ciMonitor, runner) alongside the
DAG-of-DAG; the captain owns turning it into `SETUP.md` + the readiness probe. **Real reflection
is non-negotiable** — a fleet that can't truly verify its DAGs must not claim them done.

## Phase 2 — Gate (pre-approve, ONCE, attended)

The review artifact is the **committed `FLEET.md` + the FASE-1 `SPEC.mdx`** — no separate
visual-plan step, no `visualPlanUrl` field. Tell the user to read both, then ask ONE approval via
AskUserQuestion: **Go / edit DAGs / cancel**. If the planner left any open questions, relay them to
the user before asking for approval — do not gate with open questions outstanding.

On Go, set `status: "running"`, `approved: true` in `state.json`, commit and **push**
`plans/fleet/<yyyy-mm-dd>-<epic>/` so any machine sees the running state immediately.

**Install the resume hook.** So that a bare `continue` (what the zellij injector types after a
rate-limit reset) reliably re-enters this skill — even after compaction or a `claude --continue`
restart wiped conversation context — write a guard block into `<repoPath>/.claude/CLAUDE.md`
(create or append):
```markdown
<!-- FLEET-RESUME-HOOK (auto-managed) -->
ACTIVE FLEET RUN. If any `plans/fleet/*/state.json` has `status: "running"`, treat ANY user
message (including a bare "continue") as a fleet resume: invoke the `fleet` skill and run its
step-0 resume path. Do not start unrelated work while a fleet run is active.
<!-- /FLEET-RESUME-HOOK -->
```
Remove this block in Phase 4 when the run finishes. (Alternative the user may prefer: configure
the injector to type `/fleet` instead of `continue` — then this hook is optional.)

There is **no mid-run gate** thereafter — Build runs unattended and the injector can resume it.
The only thing that re-involves the human is a `blocked`/`conflict` DAG, or a DAG reaching
`failed` (bounded judge retries exhausted) — see Build.

## Phase 3 — Build (scheduling loop, NOT waves — unattended, resumable)

**Usage guard is automatic — the `usage-limit-wakeup` hook.** Build is the long-running unattended
phase, but the captain does NOT invoke a usage skill manually. The global `usage-limit-wakeup`
Stop/UserPromptSubmit hook fires every turn and, when session usage ≥70% or weekly ≥80%, arms a
one-shot `CronCreate` wakeup at the limit reset (+1 min) that re-injects a resume prompt into this
session. Because L1 state is persisted immediately (never batched), that post-reset wakeup is all
that is needed to self-resume after a rate-limit: on fire the captain re-reads `state.json` + git
and continues. The timer-before-100% invariant is thus satisfied automatically. The captain's only
obligation is to keep state current (persist L1 immediately) so the wakeup resumes cleanly.

**Trunk-based vs integration-branch mode** (read `branchStrategy.trunkBased` from `state.json`):
- **Standard mode** (`trunkBased: false`): captain maintains a dedicated `integrationBranch`.
  DAGs merge into it. After each DAG passes, captain pushes `integrationBranch` to origin.
- **Trunk-based mode** (`trunkBased: true`): no integration branch. Captain merges passing DAGs
  directly into `baseBranch` and pushes `origin/<baseBranch>` after each DAG passes — this
  triggers CI/CD and attempts a development deploy. Captain must `git pull --rebase
  origin/<baseBranch>` before each merge to stay current.

### Branch setup (first Build entry only)
- Standard: `git fetch origin && git checkout -B <integrationBranch> origin/<baseBranch>`. If
  `baseBranch` was unresolved/ambiguous at plan time and no answer is recorded in `state.json`,
  STOP and ask the user before creating the branch — never cut the integration branch from a
  guessed base.
- Trunk: `git fetch origin && git checkout <baseBranch> && git pull --rebase origin/<baseBranch>`
- On resume: branch already exists — do NOT recreate. Standard: `git checkout
  <integrationBranch>`. Trunk: `git pull --rebase origin/<baseBranch>`.

### Scheduling loop (replaces waves)

This is the core loop. Run it on every status change, not on a fixed tick.

**Compute the runnable set.** DAG `d` is runnable ⟺:
- All `d.dependsOn` have `dagStatus[dep].status === "passed"`.
- No item in `d.dependsOn` is in `failedDags[]`.
- `dagStatus[d.id].status === "pending"`.

**No waves.** This is pure dependency resolution. A DAG unblocks the moment its deps pass — no
barrier waiting for a whole batch to finish.

**Spawn orchestrators.** For each DAG in the runnable set:
1. Update `dagStatus[d.id].status = "running"`. Persist L1 (immediately, not batched) — this is
   also what keeps the `usage-limit-wakeup` hook's post-reset resume clean (see Phase 3 intro).
2. Spawn `fleet-orchestrator` in **background** (`run_in_background: true`):
   - `model: d.orchestratorModel` — Opus for `failureTolerance: "low"`, Sonnet otherwise. Pass
     the explicit model override — the agent file default is Opus but the state-driven override
     always wins.
   - `thinking: d.thinking` (per-DAG reasoning effort from state).
   - Task prompt: `dagId`, the DAG's L2 state path + contract path, L1 state path, `runName`,
     `baseBranch`, `integrationBranch` (or `baseBranch` if trunk), `trunkBased`, `repoPath`, the
     **current accumulated `knowledge[]`**, and `writeKnowledgeDirectly: (d.orchestratorModel ===
     'opus')`. Bake in the caveman directive.
3. Store the spawned agent's id in memory keyed to `d.id`.

Spawn **all** runnable DAGs in the same message (multiple Agent tool uses) — parallel fan-out, do
not serialize.

**Wait without polling.** Do not poll or sleep. Background agents notify on completion. While
waiting, stay reachable (user questions, steering — see §Captain conversational). Usage is handled
automatically by the `usage-limit-wakeup` hook — no manual re-check as each DAG returns.

### Post-DAG judge gate

When an orchestrator reports its DAG done:

1. Spawn `fleet-judge` (always `model: opus`, always `thinking: high`, tools: Read/Grep/Glob
   only): pass L2 state path (`dags/<dagId>.json`), the per-DAG contract path (for the DAG goal),
   `dagId`, `runName`, current `attempt`. The judge is state-file-only — it never executes
   commands, it reads L2 and trusts the recorded `acceptanceResult`s.
2. Read the judge's report. Extract `verdict`: `pass | fail | needs-fix`, `pinpointedTaskId`,
   `evidence`.

**Verdict handling:**
- **`pass`** → write `dags[d].judge.verdict = "pass"` in L1; `dagStatus[d.id].status = "passed"`.
  Persist L1. Recompute the runnable set → spawn newly unblocked DAGs.
- **`fail`/`needs-fix`, attempt < 2** → increment `dags[d].judge.attempt` in L1, persist. Relay
  the judge's pinpoint feedback (offending `taskId`, evidence) to the STILL-RUNNING orchestrator
  via `SendMessage` (or respawn if it exited). Wait for the orchestrator to report the pinpointed
  fix done, then spawn the judge again (same DAG, incremented attempt).
- **`fail`/`needs-fix`, attempt reaches 2 (bounded 2×)** → write `dags[d].judge.verdict =
  "fail"`, `attempt = 2` in L1. Set `dagStatus[d.id].status = "failed"`. Add `d.id` to
  `failedDags[]`. Persist L1. Report failure to user (DAG id, judge evidence, pinpointed task).
  Recompute the runnable set — DAGs depending on this one become unreachable (the `failedDags`
  filter blocks them); if they were `pending`, mark them `blocked-hard`. Do NOT manually mark them
  `failed` — they simply stay unreachable. Continue the scheduling loop with the remaining
  runnable DAGs.

**No run-until-pass loop anywhere in this flow.** Retry exists only as the judge's bounded second
attempt. A DAG executes its task-DAG once; the judge gates it, at most twice.

### Merge, on judge pass

Once a DAG's judge verdict is `pass`, relay that pass to the orchestrator (`SendMessage`) so it
merges its DAG branch into `integrationBranch` (or `baseBranch` if trunk). After merge:
- Standard: `git push origin <integrationBranch>`.
- Trunk: `git push origin <baseBranch>` — triggers CI/CD for a development deploy attempt.
Update `state.json` + append the DAG's `knowledgeDelta`, persist new knowledge files. Commit and
**push** `plans/fleet/<yyyy-mm-dd>-<epic>/` after every DAG so any machine sees current state.

### Fleet stop condition

After every status change, recompute the runnable set. **Fleet stops when the runnable set is
empty AND no DAG has `status: "running"`.**

When this happens:
- Set `stopFlag.stopped = true`.
- `stopFlag.reason`: `"all-passed"` if every DAG passed, `"degraded-no-runnable"` if any failed
  and remaining DAGs are blocked.
- Set `stopFlag.stoppedAt`. Persist L1.
- Report final status to the user honestly: passed DAGs, failed DAGs, blocked-hard DAGs, judge
  verdicts + evidence for failed DAGs.
- **Base-branch merge is a human gate** — do NOT auto-merge. Print the exact merge commands and
  tell the user to review the diff and merge manually.

## Phase 4 — Finish

When all DAGs are terminal (or the fleet stops per above): write a summary (per-DAG status,
merged branch/push result, new knowledge files) into `plans/fleet/<yyyy-mm-dd>-<epic>/SUMMARY.md`.
Set `status: "done"` in `state.json` (only if every intended DAG passed — otherwise leave `status`
reflecting the honest stop, e.g. `"blocked"`). Commit and push
`plans/fleet/<yyyy-mm-dd>-<epic>/`. Remove the FLEET-RESUME-HOOK block from
`<repoPath>/.claude/CLAUDE.md`. Tell the user the run is complete (or exactly what's blocked).

**No folder move.** `plans/fleet/<yyyy-mm-dd>-<epic>/` stays where it is — `status: "done"` (or
`"blocked"`) is the completion marker. The step-0 resume check filters by `status: "running"` so a
finished run is never picked up again. Historical runs remain in `plans/fleet/` as committed
artifacts.

## Captain conversational + steering (mandatory, throughout)

The captain must remain reachable for the entire run. Background workers run behind the scenes;
the user talks to you.

**Status queries.** When the user asks "what's running?", "which DAGs passed?", "any failures?",
"judge verdict for d2?" — answer from live L1 state (read the current `state.json`, no need to ask
a worker). Report: each DAG's id/status/judge verdict/attempt count; running DAGs' orchestrator
agent id + in-progress tasks (read L2 if needed); failed DAGs' judge evidence + pinpointed task.

**Steering (two-hop relay).** When the user gives direction for a running orchestrator or one of
its workers: identify the target orchestrator's agent id (stored at spawn time), relay via
`SendMessage(agent_id, message)`. The orchestrator relays to its running worker the same way
(orchestrator → worker). **Never kill+respawn a running agent to redirect it** — always
`SendMessage`. The captain is the relay; user direction always passes through the captain, never
directly to a worker.

Never go silent. If there's no status change in a while, proactively surface what's happening.

## Resume (`resume=true`, i.e. step-0 found `status: "running"`)

1. Read L1 `state.json`. Do NOT re-run planning.
2. For each DAG:
   - `status: "passed"` → skip. Already done.
   - `status: "running"` → re-enter: re-spawn (or `SendMessage` if still alive) the
     `fleet-orchestrator` with the same `model` override from `dags[d].orchestratorModel`. It
     reads L2, checks `commitSha` per task, continues from where work was committed. Safety
     ratchet applies: it reads `effectiveImplementer`/`effectiveReviewer` from L2, never
     re-judges tier, never silently downgrades a `low` DAG off Opus.
   - `status: "pending"` → recompute the runnable set; spawn if unblocked.
   - `status: "failed"` / `"blocked-hard"` → keep as-is. Re-add to `failedDags[]` if not already
     present.
3. Reload `knowledge[]` from L1.
4. Re-enter the scheduling loop.

**Pause-detection and external-wake are out of scope.** External mechanisms trigger resume by
re-invoking this skill (or a bare `continue` via the FLEET-RESUME-HOOK) — the captain just needs
to be resume-ready, not to detect its own interruption.

## Knowledge transfer (rules + skills) — tier, not role

Knowledge deltas (`{kind,name,scope,body}`) are persisted so they outlive the run and steer later
DAGs + future work:
- `kind:'rule'` → write `.claude/rules/<name>.md` with frontmatter `paths: [<scope>]` and the
  body. Path-scoped conventions (API shape, schema, error format).
- `kind:'skill'` → write `.claude/skills/<name>/SKILL.md` (`name` + `description` frontmatter +
  body). Reusable how-to / intent-triggered knowledge.
- Keep an in-memory `knowledge[]` for the run AND write the files. Inject the array into every
  orchestrator brief.

**Who writes the files is a function of model tier, not of which role holds the knowledge** (an
Opus orchestrator, an Opus judge, or the Opus captain itself are all equally eligible to promote —
it is not "only the captain" or "only orchestrators"):
- **Opus** (any role — orchestrator, judge, captain) — encouraged to persist a durable/reusable
  concept itself, the moment it finds one, WITHOUT waiting for approval
  (`writeKnowledgeDirectly: true`). It returns its deltas marked `written:true` + the file path;
  the captain just records the path and folds it into `knowledge[]`.
- **Sonnet** (any role) — does NOT write rule/skill files (`writeKnowledgeDirectly: false`). It
  returns deltas marked `written:false`; the **captain (Opus) writes them** after the delta
  surfaces. This keeps Sonnet-authored knowledge under an Opus eye before it becomes a binding
  convention.
- Either way: persisting durable knowledge needs **no user approval** — only durable/reusable
  concepts qualify (a real convention, schema, gotcha), not one-off DAG/task trivia.
- The captain still owns dedup: if two DAGs propose the same rule name, merge rather than clobber.

## Two-layer validation (bake into every review)

- **Layer 1 — objective, at the per-task edge-gate.** `fleet-reviewer` (or the Opus orchestrator
  doubling as reviewer inline, for `low`-tolerance DAGs) MUST RUN the task's `checkCommand` itself
  and record `acceptanceResult` in L2 — never inferred from reading code. A Sonnet orchestrator
  spawns a separate `fleet-reviewer` per task; an Opus orchestrator reviews inline.
  `reviewVerdict: pass` REQUIRES `acceptanceResult: pass`.
- **Layer 2 — semantic, at `fleet-judge`.** The judge reads L2 only — task descriptions,
  `acceptanceResult`, `reviewVerdict`, `commitSha`, `artifactPointer` — and the per-DAG contract
  for the goal. It never executes commands; it trusts the recorded `acceptanceResult` values. It
  judges holistic integration vs the DAG goal and returns `pass | fail | needs-fix` +
  `pinpointedTaskId` + `evidence`.

## Hard invariants

- Captain writes only markdown/state/knowledge + git merge/push/checkout. All DAG code goes
  through orchestrators → implementers.
- NEVER emit a success summary unless every intended DAG is `passed` (or explicitly accepted as
  skipped by the user). A `blocked`/`conflict`/`failed`/`blocked-hard` run reports honestly and
  stops.
- NEVER force-push / `reset --hard` / drop schema without the user. Trunk-based push to
  `baseBranch` is authorized by the Gate approval — that is the only push to a shared branch the
  captain may do autonomously. Merge to base branch is otherwise always a human gate.
- Idempotent resume is sacred: disk state is the source of truth, every task checkpoint-commits,
  re-running a passed DAG is avoided by reading `state.json` + git first.
- Usage guard is automatic (Phase 3): the global `usage-limit-wakeup` hook arms a one-shot
  post-reset `CronCreate` wakeup whenever usage runs high — no manual skill invocation. A scheduled
  wakeup before 100% is the hard invariant, satisfied by the hook; the captain's job is only to keep
  L1 state current (persist immediately) so a rate-limited captain self-resumes cleanly when it fires.
- Real reflection is non-negotiable (Phase 1.5): never dispatch a DAG whose tasks' acceptance
  can't actually exercise them. On every Build entry (fresh AND resume), re-probe the env supplies
  what pending DAGs need (`needsDb` → DB reachable; `needsBrowser` → browser installed; CI monitor
  authed). If a required capability is missing, STOP and point the user at `SETUP.md` — do not
  dispatch DAGs that would fake-green. A task can never be marked `acceptanceResult: pass` on
  typecheck/lint alone when it writes data or renders UI.
- No run-until-pass iteration loop inside fleet — retry exists only as the judge's bounded second
  attempt (§Post-DAG judge gate). If you find yourself writing "loop until go," you're building
  ralph, not fleet — stop and re-check which skill applies.
