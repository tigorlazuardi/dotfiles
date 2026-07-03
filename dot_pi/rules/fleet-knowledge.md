---
description: Fleet knowledge-transfer + resume mechanics — seedKnowledge/knowledgeDelta capture flow, repo-level persistence via support worker, snapshot propagation, tiered writeDirectly, two-level resume state schema, and the testing-toolchain-before-Build captain contract.
paths:
  - workflows/src/control_plane.js
  - workflows/src/slice_orchestrator.js
  - workflows/saved/fleet.json
  - workflows/saved/slice_orchestrator.json
---

# Fleet knowledge-transfer conventions

When editing the fleet workflow source, preserve these invariants.

## Testing tools must be clear and usable (captain contract)

A fleet slice's acceptance is `slice.acceptance` — an EXACT command that proves the slice works (e.g. `pnpm test path/to.spec`, `go test ./...`, `pytest -k foo`). The whole pass/fail signal depends on that command actually existing and running. So before fleet builds:

**The captain must guarantee the testing tools are clear and usable.** Concretely, before approving the Gate / dispatching Build:
- Confirm the repo has a working, runnable test (and build/lint where relevant) toolchain, and that each slice's `acceptance` command resolves to a real, invocable command — not a guess.
- If testing tooling is MISSING or unusable (no test runner, no config, no CI command, framework not installed), the captain **must RECOMMEND a testing toolchain to the user** — propose a concrete stack appropriate to the language/framework (e.g. Vitest+RTL for the React stack, `go test` for Go, pytest for Python), state why, and get the user's pick. Then **bootstrap it FIRST** — as its own setup step or a dedicated setup DAG (no dependencies, runs first) that installs/configures the chosen runner and lands a smoke test — before any feature slice runs. Do not silently pick a framework, and do not let feature slices each improvise their own ad-hoc verification.
- Capture the chosen test/build/lint commands as `seedKnowledge` (a rule) so every slice uses the same invocation.

Why: `slice_orchestrator` tells the impl agent "run the acceptance check, it MUST pass" and falls back to "run the project test/build/lint and report" when `acceptance` is blank. If the toolchain does not exist, that fallback produces a fake or improvised signal and `passed` becomes meaningless. Bootstrapping testing up front makes every slice's acceptance trustworthy and consistent.

This is a captain/planning-time responsibility (settled during /grill-me + Plan), NOT something a background slice discovers mid-run — the planner can flag missing tooling via `needsClarification`, but the preferred outcome is an explicit bootstrap slice in the DAG.

### Real reflection is non-negotiable (fake vs real)

A toolchain that only typechecks/lints/unit-tests gives **fake reflection** — backend code never touches a real DB, UI code never renders in a browser, and a green slice can hide broken behavior. **Real reflection** means the acceptance command actually exercises the real dependency the task touches:
- A task that writes/reads data (`needsDb: true`) must run against a real DB (ephemeral cloud branch, local container, or CI service) — never fall back to unit-only mocks as its acceptance.
- A task that renders UI (`needsBrowser: true`) must run an E2E or component-browser-mode check — never fall back to build+typecheck alone.
- No task's `acceptance`/`checkCommand` may degrade to typecheck-only or lint-only when the task writes data or renders UI. If it does, `passed` is meaningless even though the command ran green.
- If a needed harness (integration DB, browser/E2E) is absent, building it is itself a dedicated setup DAG (no dependencies, runs first) — not an afterthought.
- Missing/insufficient provisioning is recorded in `SETUP.md` (copy-paste checklist of `[REQUIRED]` items only the user can do). **Build stays blocked until SETUP.md is green.**
- The captain re-probes readiness (`needsDb`/`needsBrowser`/`ciMonitor` still satisfied) on **every boot and resume**, not just once at Gate — env can drift between sessions/machines.

## Schema

Every knowledge item conforms to `DELTA_SCHEMA`:
```
{ kind: 'rule' | 'skill', name: string, scope: string, body: string }
```
- `rule.scope` = glob list (becomes `paths:` frontmatter in `.agents/rules/<name>.md`).
- `skill.scope` = the intent/trigger sentence (becomes `description:` frontmatter in `.agents/skills/<name>/SKILL.md`).
- `name` = kebab-case, used as the filename/dirname stem.

## Capture flow (fleet automatic path)

Fleet writes rules/skills IMPLICITLY — no per-write user permission, because the run is autonomous and already gated. (Outside fleet, normal sessions need explicit permission via `/promote-rules` / `/promote-skills`; that lives in AGENTS.md “Knowledge transfer”.) The fleet path:
1. Planner returns `seedKnowledge[]` upfront (conventions discovered while planning).
2. Each slice's implementer + reviewer return `knowledgeDelta[]` (new conventions discovered while building/reviewing).
3. Between waves, the control plane appends every new delta into the shared `knowledge[]` array, persists items as files, and injects the accumulated array into the NEXT wave's slice prompts.
4. Writer is the `support` worker — append-merges to existing files, never overwrites.

Trivia filter applies (see below): only DURABLE concepts get persisted; one-off slice details stay in the diff.

## Persistence

Fleet always persists to **repo-level** `.agents/rules/` + `.agents/skills/` (committed, team-shared, cross-harness). Never user-level `~/.pi/agent/` from fleet. Persist via the `writeKnowledge(items, tag)` helper. The writer spawns a `support` agent with explicit "do NOT overwrite; merge if file exists; write valid frontmatter" instructions. Never write knowledge files inline with `bash` — always go through the helper so the merge/frontmatter contract is honored.

## Propagation

`knowledge[]` is the single accumulator in `control_plane.js`. Every wave dispatches with `knowledge.slice()` (a snapshot, not a reference) and slices inject it into both impl + review prompts via `knowledgeBlock`. Do not pass the array by reference into a sub-workflow — the snapshot is what guarantees a slice sees only the knowledge available WHEN IT STARTED.

## Tiered write

`slice.writeDirectly` controls when persistence happens:
- `true` → slice_orchestrator writes mid-slice after impl AND after review.
- `false` → control plane batches the write at end-of-wave.

Default rule: `writeDirectly = slice.lowTolerance === true`. Low-tolerance slices get deep-reviewer gate at review time, so mid-slice writes are safe and propagate faster. Routine slices batch.

Slices that wrote mid-slice MUST return `writtenItems: [name1, name2, ...]` so the control plane can deduplicate the batch write.

## Cross-machine resume — KNOWN GAP (not yet implemented)

AGENTS.md advertises cross-machine resume via `plans/fleet/<runName>/state.json` (write state after every phase, commit it, resume with `/fleet runName=<runName>` or `args.resume = true`). **The saved `workflows/saved/fleet.json` script does NOT do this** — it persists no `state.json` and has no resume branch. So today a fleet run cannot resume; an interrupted run restarts from Plan.

Until implemented, do not claim resume works. To close the gap, the control plane must: write `plans/fleet/<runName>/state.json` after Plan, Gate, Setup, and each Build wave; commit it; on start, if `args.resume` or an unfinished state file exists, skip completed phases and continue from the last persisted wave.

### Two state levels (resume design)

Resume involves TWO distinct state levels, different scope, different owner:

**Level 1 — control-plane / captain state** (`plans/fleet/<runName>/state.json`). Cross-slice state owned by the fleet control plane and tracked by the captain across turns. Captures: `baseBranch`, `integrationBranch`, the slice DAG + computed waves, accumulated `knowledge[]`, which phases are done (Plan/Gate/Setup/wave-N), and per-slice status (`pending` / `running` / `passed` / `failed` / `merged` / `conflicted`). This is what a "continue" reads to know which wave to resume, which slices to skip, rebuild, or re-merge.

**Level 2 — slice-orchestrator state** (per slice, inside that slice's worktree). Internal progress of ONE slice: impl done? review done? branch name? Today `slice_orchestrator` only RETURNS its final result (`passed`, `branch`, `verdict`, `knowledgeDelta`) to the control plane — it persists NO internal progress to disk.

**Current reality: NEITHER level persists to disk** (`grep state.json` = 0 in both `fleet.json` and `slice_orchestrator.json`). A rate-limit interruption loses all in-memory state and a half-done slice (impl done, review pending) is rebuilt from scratch.

**Decision: BOTH levels are required.** A slice_orchestrator can run for HOURS (large impl + deep review). With Level 1 only, a rate-limit at hour 3 throws away the whole slice and rebuilds from zero — unacceptable. So Level 2 is not optional: each slice must persist its own progress so a resumed slice continues from its last completed step (e.g. impl done + committed → resume at review, do not re-impl).

Level 2 state (per slice, e.g. `plans/fleet/<runName>/slices/<sliceId>.json` or a file inside the slice worktree) must capture at least: current step (`impl` / `review` / `knowledge-write` / `done`), the slice branch name, whether impl committed its work (and the commit sha), the review verdict if reached, and any `knowledgeDelta` already produced. On resume the slice_orchestrator reads this and skips completed steps.

CRITICAL constraint — partial work must survive on the BRANCH, not just in a state file. A multi-hour impl that dies mid-step loses its in-progress edits unless they were COMMITTED to the slice branch. So the impl step must commit incrementally (commit-on-meaningful-progress) into the slice worktree branch; the Level 2 state file records the last good commit sha. Resume = checkout that branch at that commit + continue. A state file pointing at work that was never committed is useless — the edits died with the in-memory session. This is the real blocker to "continue" for long slices and must be designed together with Level 2.

Interplay: Level 1 marks a slice `running` when dispatched and only flips it to `passed`/`failed` on the slice's final return. If interrupted, the slice stays `running` in Level 1; on resume the control plane re-enters that slice's orchestrator, which then uses its Level 2 file to resume mid-slice rather than restart.

### "continue" semantics the user wants (target behavior)

The user wants: hit a rate limit (or any interruption), then say **"continue"** and have fleet resume from the **latest persisted state**, not restart from Plan. For that to work, two things are required — the SECOND is the missing piece:

1. **Captain-level resume entry point.** When the user says "continue", the captain re-invokes `/fleet runName=<sameRunName> args.resume=true`. The captain must remember/track the active `runName` so it can pass the same one.
2. **Disk-persisted run state (MISSING).** A workflow run is in-memory for its turn; if the process dies or a rate limit breaks the turn, the in-memory run is GONE. Resume is only possible by reading state back from disk. So `state.json` MUST capture enough to reconstruct: `baseBranch`, `integrationBranch`, the full slice DAG + computed waves, `knowledge[]` accumulated so far, and a per-wave/per-slice status (`pending` / `running` / `passed` / `failed` / `merged` / `conflicted`). On resume the control plane loads it, skips Plan+Gate+already-done waves, and continues at the first unfinished wave.

State granularity to honor on resume:
- Completed-and-merged slices: do NOT rebuild — already on the integration branch.
- Passed-but-unmerged / conflicted: re-attempt merge only, do not rebuild.
- Failed or never-started slices in the current/next wave: rebuild.
- `knowledge[]` must be reloaded from state (or re-read from `.agents/rules`/`.agents/skills`) so resumed waves still inherit it.

Write state AFTER each phase boundary AND after each slice status change within a wave, so a mid-wave rate-limit loses at most the in-flight slices, not the whole wave. Commit it if cross-machine resume is wanted; a local-only resume just needs the file on disk.

## Trivia filter

Persist only durable concepts: real conventions, schemas, vendor quirks, gotchas other slices must honor. One-off slice details (a variable rename, a tweak to one file) stay in the diff, not in `.agents/rules`/`.agents/skills`. When unsure, do not write — the next manual `/promote-rules` capture costs less than scrubbing a wrong rule from git.
