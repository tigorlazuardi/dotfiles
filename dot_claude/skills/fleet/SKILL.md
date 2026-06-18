---
name: fleet
description: Use when the user wants to build a multi-slice feature autonomously via a control-plane "fleet" — a captain (this main session) plans a DAG of slices, then spawns one fleet-orchestrator per slice (which nests implementer + reviewer), merges passing slices into an integration branch, and propagates knowledge between waves. Rate-limit-safe and resumable on a bare "continue". Personal-use, Pro-plan friendly.
---

# Fleet — autonomous multi-slice control plane

You (this main session) are the **fleet-captain**. You do not write slice code yourself. You plan, dispatch orchestrators, persist state, and merge. Everything runs as nested subagents of THIS loop, so an injected `continue` after a rate-limit reset resumes you.

Worker tree: **captain (you)** → `fleet-orchestrator` (one per slice, has Agent tool) → `fleet-implementer` + `fleet-reviewer` (leaves, no Agent tool).

## Captain model guard (first thing, always)

The captain MUST run on **Opus**. If this main session is not Opus, STOP immediately, do not plan or dispatch, and tell the user to `/model` to Opus and re-invoke. A fleet driven by a non-Opus captain is not authorized. (This is an authorized early-exit, not a failure.)

## ALWAYS step 0 — resume check

Before anything else, check for an active run in the current repo:
- Look for `.claude/fleet/active/STATE.md` and `.claude/fleet/active/slices.json`.
- **If present and `status: running`** → this is a RESUME (likely an injected `continue` after a rate-limit). Skip Plan and Gate. Re-read STATE + `git log <integrationBranch>` + `git worktree list`, recompute which slices are still `pending`/`failed`/`conflict`, and jump straight to **Build** for those, respecting deps. Do NOT re-plan, do NOT re-ask the gate.
- **If absent** → fresh run, start at Plan.

This is what makes the zellij continue-injector work: a bare `continue` lands here, finds the active STATE, and resumes idempotently.

## Phase 1 — Plan (interview hard, attended)

Spawn `opus-planner` (read-only). Its job: interview the user until ambiguity is gone, then emit the DAG. Tell it to use AskUserQuestion liberally — **the user is present for planning** even though Build runs unattended. It must NOT finalize while anything is ambiguous. The planner also probes verification capability (CI/test-tooling/DB/monitoring) and returns a `verification` block + per-slice `needsDb`/`needsBrowser` tags + the real-reflection `acceptanceCmd`s (feeds Phase 1.5). (If the planner subagent has no AskUserQuestion tool, it returns its questions as text and the captain relays them to the user via AskUserQuestion, then re-briefs a fresh planner with the answers baked in — subagents can't be resumed mid-run here.)

Planner returns `slices.json`:
```json
{
  "scope": "kebab-name",
  "baseBranch": "main",
  "integrationBranch": "fleet/<kebab-name>",
  "waves": [["auth"], ["billing","dashboard"]],
  "slices": [
    {"id":"auth","intent":"...","acceptanceCmd":"npm test -- auth","lowTolerance":true,"orchestratorModel":"opus","deps":[]},
    {"id":"billing","intent":"...","acceptanceCmd":"npm test -- billing","lowTolerance":true,"orchestratorModel":"opus","deps":["auth"]},
    {"id":"dashboard","intent":"...","acceptanceCmd":"npm test -- dashboard","lowTolerance":false,"orchestratorModel":"sonnet","deps":["auth"]}
  ],
  "seedKnowledge": [{"kind":"rule","name":"api-conventions","scope":"src/**","body":"..."}]
}
```
- `waves` = topological order (planner computes; independent slices share a wave → run parallel). Verify deps are acyclic.
- `orchestratorModel` per slice — planner assigns by **correctness need**, not just tolerance: `opus` for slices needing high correctness / hard judgment (auth, billing, migrations, intricate logic), `sonnet` for mechanical / high-tolerance / easy-to-verify slices. `lowTolerance` (drives the *reviewer* model) and `orchestratorModel` usually align but the planner may set them independently.
- If the planner reports unresolved questions, relay them to the user and re-plan. **Do not proceed to Gate with open questions.**

Write `slices.json` + an initial STATE (status `planned`) to `.claude/fleet/active/`. Persist `seedKnowledge` (see Knowledge below).

## Phase 1.5 — Verification readiness preflight (real reflection, attended)

A slice that only typechecks/lints/unit-tests gives the implementer **fake reflection** — backend code never touches a DB, UI code never renders in a browser, and a green slice can hide broken behavior. Before the Gate, the captain (with the planner) MUST guarantee the run environment can give **real reflection**, and guide the user to provision what's missing. This phase is mandatory; do not skip to Gate without it.

**1. Audit what verification capability exists** (read, don't assume): CI config (does the pipeline actually run tests? integration? is it gated/dormant?), test tooling (vitest projects, is there an integration project? a browser/E2E harness?), DB access (is a connection string in the env? can integration run locally?), and **monitoring** — can the captain read CI results? (`glab`/`gh` authed? token scope?). Probe the real state; report it as a table.

**2. Offer pragmatic options — do not prescribe one.** Setup cost is real; let the user pick by what they already have. Always present alternatives and ask the user's current state first:
- **Real DB for backend slices**: Neon ephemeral branch (if API key) · local container (Podman/Docker `postgres:<min-version>`) · Postgres-as-CI-service (`services:`) · unit-only (weakest). Ask which the run-env supports before choosing.
- **UI slice depth**: Playwright E2E smoke (truest, heaviest — add a wave-0 harness slice) · vitest browser-mode component tests (middle) · build+typecheck (lightest). 
- **CI monitoring**: give the captain read access (token) so it can treat a red pipeline as a blocker after each epic push · or rely on local gate only.
- If CI doesn't run tests at all, or a needed harness is absent → **building it is itself a slice** (wave-0), not an afterthought.

**3. Encode real reflection into every slice's `acceptanceCmd`** — backend (`needsDb`) slices run integration against the real DB; UI (`needsBrowser`) slices run the E2E/component smoke. Tag slices `needsDb`/`needsBrowser`/`needsNeon` so the captain can verify the env supplies each before dispatching. Never let acceptance degrade to typecheck-only for a slice that writes data or renders UI.

**4. Write `SETUP.md`** into `.claude/fleet/active/` — a concrete, copy-paste checklist of the **[REQUIRED]** provisioning only the user can do (credentials, containers, browser deps, CI vars, monitoring token) plus a captain readiness-probe checklist. Freeze the plan at `status: planned`. **Build stays blocked until the required items are green** (captain re-probes on the next `/fleet`/`continue`). If the user chose "set up together now", walk the commands interactively instead.

The planner returns a `verification` block (db mode, ui mode, ciMonitor, runner) alongside the DAG; the captain owns turning it into SETUP.md + the readiness probe. **Real reflection is non-negotiable** — a fleet that can't truly verify its slices must not claim them done.

## Phase 2 — Gate (pre-approve, ONCE, attended)

Show the user the wave plan + which slices are low-tolerance (opus-reviewed). Ask ONE approval via AskUserQuestion: **Go / edit slices / cancel**. On Go, set `status: running`, `approved: true` in STATE and commit the `.claude/fleet/active/` dir.

**Install the resume hook.** So that a bare `continue` (what the zellij injector types after a rate-limit reset) reliably re-enters this skill — even after compaction or a `claude --continue` restart wiped conversation context — write a guard block into `<repoPath>/.claude/CLAUDE.md` (create or append):
```markdown
<!-- FLEET-RESUME-HOOK (auto-managed) -->
ACTIVE FLEET RUN. If `.claude/fleet/active/STATE.md` exists, treat ANY user message
(including a bare "continue") as a fleet resume: invoke the `fleet` skill and run its
step-0 resume path. Do not start unrelated work while a fleet run is active.
<!-- /FLEET-RESUME-HOOK -->
```
Remove this block in Phase 4 when the run finishes. (Alternative the user may prefer: configure the injector to type `/fleet` instead of `continue` — then this hook is optional.)

There is **no mid-run gate** thereafter — Build runs unattended and the injector can resume it. The ONLY thing that re-involves the human is a `blocked`/`conflict` slice (see Build).

## Phase 3 — Build (unattended, resumable)

1. **Integration branch fresh from origin.** Once, at first Build entry:
   ```
   git fetch origin
   git checkout -B <integrationBranch> origin/<baseBranch>
   ```
   (On resume, the branch already exists — do NOT recreate it; just `git checkout <integrationBranch>`.)
2. **Per wave, in order.** For each slice in the wave whose status is `pending`/`failed`, spawn a `fleet-orchestrator` — **all slices of the wave in a single message (multiple Agent tool uses) so they run concurrently.** Spawn each with `model: slice.orchestratorModel` (overrides the agent default). Pass each in the brief: `slice`, `baseBranch`, `integrationBranch`, `repoPath`, the **current accumulated `knowledge[]`**, and `writeKnowledgeDirectly: (slice.orchestratorModel === 'opus')` — true lets an Opus orchestrator persist rule/skill files itself; false makes a Sonnet orchestrator return deltas for the captain to write (see Knowledge below).
3. **Barrier between waves.** Wait for the whole wave to return before starting the next — later waves depend on earlier ones and need their knowledge + merged code.
4. **After each slice returns:**
   - `merged` → mark done, append its `knowledgeDelta`, persist new knowledge files.
   - `failed` → mark failed; if a later slice depends on it, mark those `skipped` and record why.
   - `conflict` or `blocked` → mark BLOCKED, stop dispatching new work, report to the user, and **exit cleanly without claiming success**. Do not auto-resolve, do not force anything.
   - Update `STATE.md` + `slices.json` and checkpoint-commit `.claude/fleet/active/` after every slice. State must always be truthful on disk so resume is correct.
5. **Knowledge propagation.** Before dispatching a wave, inject the accumulated `knowledge[]` into every orchestrator brief. That is how `auth`'s conventions reach `billing`/`dashboard`.

## Phase 4 — Finish

When all slices terminal: write a summary (per-slice status, merged branch, new knowledge files), move `.claude/fleet/active/` → `.claude/fleet/done/<scope>/`, remove the FLEET-RESUME-HOOK block from `<repoPath>/.claude/CLAUDE.md`, and tell the user the integration branch is ready to review / PR. Removing `active/` is what marks the run complete — a later `continue` then finds nothing to resume.

## Knowledge transfer (rules + skills)

Knowledge deltas (`{kind,name,scope,body}`) are persisted so they outlive the run and steer later slices + future work:
- `kind:'rule'` → write `.claude/rules/<name>.md` with frontmatter `paths: [<scope>]` and the body. Path-scoped conventions (API shape, schema, error format).
- `kind:'skill'` → write `.claude/skills/<name>/SKILL.md` (`name` + `description` frontmatter + body). Reusable how-to / intent-triggered knowledge.
- Keep an in-memory `knowledge[]` for the run AND write the files. Inject the array into every orchestrator brief.

**Who writes the files (by orchestrator model):**
- **Opus orchestrator** (`writeKnowledgeDirectly:true`) — encouraged to persist durable/reusable concepts itself, the moment it finds one, WITHOUT waiting for the captain or any user approval. It returns its deltas marked `written:true` + the file path; the captain just records the path and folds it into `knowledge[]`.
- **Sonnet orchestrator** (`writeKnowledgeDirectly:false`) — does NOT write rule/skill files. It returns deltas marked `written:false`; the **captain writes them** (`.claude/rules/` / `.claude/skills/`) after the slice returns. This keeps Sonnet-authored knowledge under an Opus eye before it becomes a binding convention.
- Either way: persisting durable knowledge needs **no user approval** — only durable/reusable concepts qualify (a real convention, schema, gotcha), not one-off slice trivia.
- The captain still owns dedup: if two slices propose the same rule name, merge rather than clobber.

## STATE.md format

```markdown
# Fleet run: <scope>
status: running            # planned | running | blocked | done
approved: true
baseBranch: main
integrationBranch: fleet/<scope>
repoPath: /abs/path

## Slices
- auth      [done]    merged @ <sha>  reviewer: go (opus)
- billing   [pending] deps: auth
- dashboard [failed]  cycles: 2  reason: acceptance red

## Knowledge persisted
- .claude/rules/api-conventions.md
- .claude/rules/auth-flow.md
```

## Hard invariants

- Captain writes only markdown/state/knowledge + git merge/checkout. All slice code goes through orchestrators → implementers.
- NEVER emit a success summary unless every intended slice is `merged` (or explicitly accepted as skipped by the user). A `blocked`/`conflict`/`failed` run reports honestly and stops.
- NEVER force-push / `reset --hard` / drop schema / push to a shared branch without the user. Destructive need from a slice → it returns `blocked` → you surface it, you do not self-authorize.
- Idempotent resume is sacred: disk STATE is the source of truth, every slice checkpoint-commits, re-running a done slice is avoided by reading STATE + git first.
- Real reflection is non-negotiable (Phase 1.5): never dispatch a slice whose acceptance can't actually exercise it. On every Build entry (fresh AND resume), re-probe the env supplies what pending slices need (`needsDb` → DB reachable; `needsBrowser` → browser installed; CI monitor authed). If a required capability is missing, STOP and point the user at SETUP.md — do not dispatch slices that would fake-green. A slice can never be marked `done` on typecheck/lint alone when it writes data or renders UI.
