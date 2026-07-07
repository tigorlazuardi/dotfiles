---
name: workflow-sweep
description: >-
  Scaffold a spec-ingesting orchestration script for Claude Code's NATIVE `Workflow` tool, for
  FASE 2 after the user has explicitly picked the "workflow" orchestration level at the FASE-2
  hard human gate, and a spec + design docs already exist. Use for WIDE, REPETITIVE, SAFE-only
  sweep work — OTel traces everywhere, migrating logs to a new standard, failable error-feedback
  on all UI interactions, a11y sweeps across N components. Trigger on "workflow sweep", "sweep
  the codebase for X", "fan out this instrumentation", "author a workflow script". Produces a
  script whose every agent() prompt bakes the FASE-1 conventions (metric naming, log format,
  error-feedback standard) and whose workers are CAPPED at sonnet/haiku tiers only — NEVER opus,
  no escalate-to-critical path inside the sweep. This skill authors the SCRIPT only; running it
  is a separate explicit step. NEVER use workflow for any low-tolerance surface (auth / secrets /
  DB migration / schema / public-API / money / data-deletion / irreversible).
---

# Workflow Sweep — scaffold a Claude Code `Workflow` tool script

Claude Code ships a **native `Workflow` tool** — code mode for subagents. The main agent writes a
script that fans out `agent()` / `parallel()` / `pipeline()` calls, holding intermediate results in
script variables so the main chat context stays clean, journaled for resume via `resumeFromRunId`.
This is the Claude-side port of pi's `goal-sweep` skill, renamed **Workflow** per
`docs/design/2026-07-03-pi-parity-orchestration.mdx` §2–§3 (authoritative — the pi→Claude
primitive mapping table lives there).

The **orchestration script** IS the workflow contract. This skill authors one from the approved
spec + design docs. You (main agent) author it PRE-run. Running it is a separate, explicit step —
you invoke the `Workflow` tool yourself only after the user approves the previewed script (see
"Difference from pi" below — no separate CLI to hand off to).

## When Workflow is the RIGHT flow (and when it is NOT)

Workflow is **breadth-of-SAFE-work**, not depth, not risk. Use it only when BOTH hold:

- **Shape:** wide, repetitive, independent, same-pattern tasks (instrument N services, add a log
  line to N handlers, add failable error-feedback to N UI interactions, a11y sweep across N
  components).
- **Safety:** the scope touches **NO low-tolerance surface** — no auth / secrets / DB migration /
  schema / public-API / money-payment / data-deletion / irreversible work.

If either fails → this is the WRONG flow:
- Low-tolerance present → route to **fleet or ralph** (never Workflow).
- Heavy inter-dependency between parts → route to **fleet**.
- Single deep sequential slice → **ralph**.

This safety-first split is the CLAUDE.md "Workflow vs Fleet disambiguation" rule (§2 of the design
doc). Confirm it before you scaffold.

## Preconditions

1. The user has already chosen the **workflow** level (FASE 2) at the hard human gate. This choice
   IS the multi-agent opt-in the `Workflow` tool requires. If not chosen yet — stop, the level
   decision is a FASE-1 main-agent recommendation the user must confirm, not this skill's job.
2. A **spec** already exists: `plans/<scope>/SPEC.mdx` (FASE 1 output), optionally with supporting
   `docs/design/<yyyy-mm-dd>-<topic>.mdx`. The script's Discover phase ingests it and every worker
   prompt bakes its conventions; the script never authors the spec. No spec → stop and route back
   to FASE 1.
3. **Safety gate confirmed** — you have confirmed the scope is free of any low-tolerance surface
   (auth / secrets / migration / schema / public-API / money / data-deletion / irreversible). If a
   low-tolerance concern exists, REJECT workflow here and offer ralph/fleet instead.

## Workflow tool primitives (Claude Code native)

```js
export const meta = {
  name: 'otel_trace_sweep',
  description: 'Add OTel spans to every service handler per the approved telemetry spec',
  phases: [{ title: 'Discover' }, { title: 'Apply' }, { title: 'Verify' }],
}

const SPEC = `<paste the approved conventions: span names, attrs, log schema, metric names>`
const APPLY_PROMPT = (file) => `${SPEC}

Apply the above conventions EXACTLY to ${file}. Do not invent span names, attributes, or log
keys — use only those defined above. If ${file} needs a convention not covered by the spec,
STOP and report it (do not guess).`

phase('Discover')
const targets = await agent(
  `Read plans/telemetry-sweep/SPEC.mdx. List every handler file under src/services/ that needs
  instrumentation per the spec. One path per line, nothing else.`,
  { label: 'discover-targets', phase: 'Discover', model: 'sonnet', effort: 'low' },
)

phase('Apply')
const results = await parallel(
  targets.split('\n').filter(Boolean).map((file) => () =>
    agent(APPLY_PROMPT(file), {
      label: `apply-${file}`,
      phase: 'Apply',
      model: 'sonnet',
      agentType: 'sonnet-implementer',
      isolation: 'worktree',
    })),
)

phase('Verify')
return await agent(
  `${SPEC}\n\nFor each of these changes, confirm the spans/attrs/log keys above actually landed
  (grep the diff, don't just trust the summary): ${JSON.stringify(results)}`,
  { label: 'verify-conventions', phase: 'Verify', model: 'sonnet', effort: 'medium' },
)
```

- `agent(prompt, opts)` — spawn one isolated subagent; returns its text (or a validated object with
  `opts.schema`).
- `parallel(thunks)` — run `() => agent(...)` thunks concurrently; results in input order.
- `pipeline(items, ...stages)` — fan items through sequential stages.
- `phase(title)` — group agents in the run view; `log(...)` for script-level notes.
- `budget` — cap on agent count / cost for the run; set it up front for a sweep of known size.
- Agent opts: `label`, `phase`, `schema` (validated structured return), `model` (`sonnet` /
  `haiku` only — see rule 3), `effort`, `isolation` (`"worktree"` for parallel edits), `agentType`
  (binds tools+role, e.g. `sonnet-implementer` / `caveman:cavecrew-builder`).
- **Resume**: runs are journaled; `resumeFromRunId` replays completed steps and continues from the
  first incomplete one — do not hand-roll your own resume bookkeeping.
- **Sandbox**: scripts run in a `vm` with no `Date.now()` / `Math.random()` / filesystem / network
  access outside the tool's own calls — keep scripts deterministic, put all nondeterminism inside
  `agent()` calls, not script logic.

## Authoring rules (mandatory for every workflow script)

### 1. Discovery phase INGESTS the spec, never re-plans
The first agent reads the approved spec (point it at the exact `plans/<scope>/SPEC.mdx` path) and
enumerates the sweep targets. It must NOT reinterpret requirements or invent conventions — the
spec is authoritative.

### 2. Every worker prompt BAKES the FASE-1 conventions
This is the core of the sweep: parallel branches must NOT each improvise their own convention.
Build the worker prompt from a `SPEC` constant + prompt-builder defined once, reused everywhere
(see primitives example above). Workers are forbidden to invent names/keys/attrs not in `SPEC`. If
a target needs something not covered — **STOP and report, don't guess**. Bake this instruction
into every prompt string.

### 3. Worker tier CAPPED
`model` is capped to `'sonnet'` or `'haiku'` only. `agentType` limited to `sonnet-implementer` /
`caveman:cavecrew-builder`, or the default workflow subagent if no custom agentType is needed. **NEVER
`model: 'opus'`.** No escalate-to-critical path inside the sweep — if a branch turns out to need
heavier judgment, that is the escape hatch (rule 4) firing, not a tier bump.

### 4. Escape hatch on low-tolerance discovery
Worker prompts instruct: if a target touches a low-tolerance surface (auth / secrets / migration /
schema / money / data-deletion), STOP that branch, return a flagged result (use `schema` to force a
`{status: 'flagged', reason: ...}` shape if useful), and do NOT modify the file. The main agent
surfaces those flags to the user after the run — they get re-routed to ralph/fleet, never
auto-handled inside the workflow.

### 5. `isolation: 'worktree'` for every parallel edit phase
Any phase where parallel workers edit files uses `isolation: 'worktree'` so concurrent branches
don't clobber each other. Read-only phases (Discover, Verify-by-reading) skip it.

### 6. Verify phase asserts conventions actually landed
Not just "files changed" — the verify prompt must check that spans/log keys/attrs/error-feedback
actually match the spec (grep the diff, or re-read the changed files). When the sweep IS telemetry
work, run the `telemetry-planning` skill's conventions (redaction tiers, explicit histogram
buckets, cardinality) through the verify prompt as acceptance criteria, not an afterthought.

## Workflow (steps for authoring the script)

1. Confirm preconditions (workflow level chosen; spec exists; safety gate confirmed). Read the
   spec + any supporting design docs.
2. Extract the conventions into a `SPEC` constant + prompt-builder(s) (rule 2).
3. Design phases: Discover (ingest spec, enumerate targets) → Apply (parallel, `isolation:
   'worktree'`) → Verify (assert conventions landed).
4. Apply authoring rules 1–6: capped tiers, baked conventions, escape hatch, worktree isolation,
   real verification.
5. Preview the full script + estimated agent count to the user (Discover count × Apply branches +
   Verify). Get explicit approval before running anything.
6. On approval, invoke the `Workflow` tool yourself with the script. This is the one place this
   skill differs from its pi ancestor (see below) — there is no separate `/workflows run` command
   to hand off to.
7. Report results honestly after the run completes: what landed, what the Verify phase confirmed,
   and any escape-hatch flags surfaced by branches that hit low-tolerance surfaces. Route flagged
   items to ralph/fleet — do not silently fix them here.
8. If this sweep is likely to run again (recurring convention migration, periodic a11y audit),
   save the script under `.claude/workflows/` so it can be invoked by name later.

## Difference from pi

Pi's `goal-sweep` skill is **terminal**: it authors the script and stops; the user starts the run
via their own explicit `/workflows run`. In Claude Code there is no equivalent external command —
the `Workflow` tool is invoked by the main agent itself. This skill stays faithful to the
pre-run/in-run boundary by treating "preview + get explicit user approval" (step 5 above) as the
gate: the main agent does NOT call the `Workflow` tool until the user has seen the full script and
signed off. Approval is the boundary; the tool call is just how Claude Code executes it.
