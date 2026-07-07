---
name: feature-planning
description: Use when the user asks to plan a feature or multi-part build — "plan this feature", "plan untuk fitur ini", "plan X", any "implement feature" intent. Runs FASE 1 only — spec/design authoring — BEFORE any execution mode (one-shot / ralph / fleet / workflow) is chosen. Ends at the hard human gate: main agent recommends a level, user decides. Do not use for bug/debug intent (see debug mode) or info/research (answer directly).
---

# Feature planning — FASE 1 (spec/design, pre-execution)

You (main agent, **must be Opus**) run FASE 1 only: interview → spec + design docs, committed to the
repo → recommend an orchestration level → **STOP**. You do NOT pick the level, and you do NOT start
FASE 2 (contract/state). The user decides at the hard gate.

If this session is not Opus: say so, ask the user to `/model` to Opus first. Mode/spec judgment here
is an Opus call — do not proceed on another model.

## Step 0 — intent check

This skill is for **"implement a feature"** intent only. Before running FASE 1, classify:

- **Bug / error / stack trace** → NOT this skill. Use debug mode per CLAUDE.md: (1) gather
  repro/env/expected-vs-actual, (2) branch by fix size — small fix → execute directly (main agent
  MAY touch code, the deliberate exception), medium/large → route into FASE 1 below.
- **Info / research / other** → answer directly, no ceremony, not this skill.
- **Implement feature** → continue to Step 1.

## Step 1 — FASE 1 interview (one question per turn, via AskUserQuestion)

Do not batch questions into a wall of text. One question per turn. Cover, in order, only what you
cannot determine yourself by reading the repo (don't ask what you can read):

1. **Goal + verifiable done-condition** — what does "done" look like, how will it be checked.
2. **Repo reality** — read the repo first (existing patterns, conventions, adjacent code). Only
   ask what genuinely isn't discoverable from the codebase.
3. **Scope boundaries** — what's explicitly out of scope / non-goals.
4. **Risk surface** — does anything in scope touch a low-tolerance surface: auth, secrets, DB
   migration, schema, public API, money, data-deletion, irreversible action. This drives the
   later gate recommendation (see Step 3 disambiguation rule).
5. **Decomposition shape** — one coherent change, deep sequential chain, DAG of independent
   slices, or wide/repetitive/independent same-pattern work.
6. **Budget posture** — cost/time tolerance, attended vs unattended.
7. **Attended vs unattended** — will the user be present to steer, or does this need to run and
   checkpoint on its own.

`telemetry-planning` skill **MUST run as part of spec authoring** — invoke it before finalizing
the spec so tracing/logs/metrics are part of the acceptance criteria, not an afterthought.

## Step 2 — output: spec + design docs (NO contract, NO state file)

Write a **mode-neutral** spec to `plans/<scope>/SPEC.mdx` in the project repo. Mode-neutral means:
describe the goal, done-condition, scope, risk surface, and decomposition — do NOT bake in
one-shot/ralph/fleet/workflow-specific structure. Any executor must be able to ingest this spec
unmodified.

- Author `SPEC.mdx` per the `astro-docs-authoring` skill (Decision / Aside / mermaid blocks —
  invoke that skill for the authoring convention).
- Architecture decisions that outlive this scope (not just this feature) → additional
  `docs/src/content/docs/design/<yyyy-mm-dd>-<topic>.mdx` in the repo's Starlight site
  (scaffold via `astro-docs-setup` if absent), same authoring convention.
- Do **not** create a contract file (PROMPT.md, FLEET.md, ralph preset, orchestration script) and
  do **not** create a state file (STATE.md, state.json) in FASE 1. Those are FASE 2 artifacts,
  built only after the gate.

## Step 3 — 🚧 HARD HUMAN GATE (mandatory, cannot be skipped)

After the spec is committed: state **ONE recommended orchestration level** + a one-line reason,
then **STOP**. Do not auto-pick and do not begin FASE 2. The user decides via AskUserQuestion; they
may accept your recommendation or override it. FASE 2 does not begin until the user has explicitly
chosen.

### Flow taxonomy (all four levels — none skipped)

| | One-shot | Ralph | Fleet | Workflow |
|---|---|---|---|---|
| Size | S/M | L (long single slice) | XL / greenfield / multi-DAG | sweep (breadth, not a size) |
| Shape | one coherent change | deep sequential task-DAG | DAG-of-DAG, interdependent | wide, repetitive, independent, same-pattern |
| Low-tolerance OK? | yes (tight review) | yes (full tier routing) | yes (judge-gated) | **NO — SAFE-only, hard rule** |
| Iteration loop | n/a | yes (run-until-pass) | none (judge bounded 2×) | none (verify per node) |
| Contract | none | PROMPT.md + STATE.md | FLEET.md + L1/L2 JSON | JS orchestration script |
| Executor | main session + workers | `/ralph-loop` plugin | `fleet` skill (captain) | native `Workflow` tool |

### Workflow vs Fleet disambiguation (safety-first, hard rule)

Both fan out in parallel, so decide by SAFETY FIRST:

- Any low-tolerance surface in scope (auth / secrets / DB migration / schema / public-API /
  money / data-deletion / irreversible) → **fleet or ralph — never Workflow**.
- No low-tolerance surface, and the work is wide + repetitive + independent same-pattern → **Workflow**.
- Heavy inter-dependency between parts (regardless of safety) → **fleet**.

Use this rule, plus the size/shape signals in the taxonomy table, to form your one-line
recommendation. State it, then stop.

## Step 4 — route (only after the user picks)

Every FASE-2 contract **INGESTS** `SPEC.mdx` — it never re-plans or reinterprets. The spec is
authoritative across all four executors. This is the anti-duplication guarantee.

- **One-shot (S/M)** → main session executes directly, per the effort tier (XS/S/M/L per
  CLAUDE.md), delegating all writes to workers (`sonnet-implementer` / `haiku-implementer`). No
  contract file.
- **Ralph (L)** → invoke `ralph-plan`. It detects `plans/<scope>/SPEC.mdx`, ingests it (skip the
  full interview, ask only about gaps), and derives `PROMPT.md` + `STATE.md` from the spec.
- **Fleet (XL)** → invoke the `fleet` skill. Its Plan phase ingests `SPEC.mdx` and derives
  `FLEET.md` + L1/L2 state — it does not re-plan from scratch.
- **Workflow (sweep)** → invoke the `workflow-sweep` skill. It ingests `SPEC.mdx` and scaffolds
  the orchestration script, capped to non-critical worker tiers, SAFE-only.

This skill's job ends at the gate. Deep slice-level / contract-level interviewing happens inside
whichever executor is chosen next.
