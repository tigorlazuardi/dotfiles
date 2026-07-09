---
name: ralph-preset
description: >-
  Scaffold a CUSTOM pi-ralph preset (.yml) when no fixed -ingest preset fits a task. Use this in FASE 2
  after the user has picked the "ralph" orchestration level and a spec + design docs already exist, but
  none of the stock -ingest presets (feature-ingest, spec-driven-ingest, refactor-ingest, debug-ingest)
  matches the task's hat flow. Trigger on "make a ralph preset", "custom ralph loop", "author a ralph
  contract", "the built-in presets don't fit this task". Produces a valid preset with an ingest hat-1
  (reads the approved spec, does NOT re-plan) and delegate-aware Builder/Worker/Reviewer hats (spawn
  worker subagents per fault-tolerance tier). This skill authors the CONTRACT only; it does NOT start
  the loop.
---

# Ralph Preset — scaffold a custom `pi-ralph` contract

pi-ralph (samfp) runs an **in-process hat loop**: each iteration the agent wears one role (hat), does
that role's job, publishes an event, and the extension fires the next hat as a fresh turn
(`newSession()` — context resets each iteration; state carries via `.ralph/scratchpad.md` on disk).

A **preset `.yml`** IS the ralph contract. This skill authors a custom one when no fixed preset fits.
You (main agent) author the preset PRE-loop, from the approved spec + design docs. You do NOT run the
loop.

## When to use this skill vs a fixed preset

- **Prefer a fixed `-ingest` preset** (`~/.pi/agent/ralph/presets/*-ingest.yml`): `feature-ingest`,
  `spec-driven-ingest`, `refactor-ingest`, `debug-ingest`. These already read the FASE-1 spec instead
  of re-planning, and their code/review hats already delegate to worker subagents. Default to these.
- **Author a custom preset (this skill)** ONLY when the task's role flow genuinely differs (e.g. a
  data-migration loop needs a Backup → Migrate → Verify → Rollback-check flow that no stock preset
  models). Hybrid rule: fixed by default, custom only when none fits.

## Preconditions

1. The user has already chosen the **ralph** level (FASE 2). If not, stop — the level decision is a
   FASE-1 main-agent recommendation, not this skill's job.
2. A **spec + design docs** already exist (FASE 1 output). The preset's hat-1 ingests them; it never
   authors them. If there's no spec, stop and route back to FASE-1 planning.

## Preset schema (pi-ralph)

```yaml
event_loop:
  starting_event: "<start-event>"          # the event hat-1 triggers on
  completion_promise: "<UPPER_SNAKE>"       # loop stops when this string is emitted on its own line
  max_iterations: 50                        # hard iteration cap
  max_runtime_seconds: 10800                # optional wall-clock cap

hats:
  <hat_key>:
    name: "📋 Display Name"
    description: "one line"
    triggers: ["<event>", ...]              # events that activate this hat
    publishes: ["<event>", ...]             # events this hat may emit
    default_publishes: "<event>"            # fallback if the hat doesn't name one
    max_activations: 1                       # optional; caps how many times this hat runs
    disallowed_tools: ["edit", "write"]     # optional; read-only hats (planner/reviewer)
    instructions: |
      ## HAT MODE
      ...system prompt injected for this iteration...
```

Event wiring: a hat's `publishes` event must appear in another hat's `triggers` (or be terminal). A
terminal hat publishes an event no hat triggers on → loop completes. `completion_promise` on its own
line also completes the loop.

## Authoring rules (mandatory for every custom preset)

### 1. Hat-1 is an INGESTER, never an author
The first hat reads the approved spec + design; it must NOT re-plan or reinterpret. Its instructions
must say, in substance:

> A spec and design docs already exist and are APPROVED. Read the spec + design docs referenced in the
> task (`/ralph <preset> --path <spec>` or named in the prompt). Do NOT re-plan, rewrite the spec, or
> reinterpret requirements — the spec is authoritative and final. Decompose it into an atomic, numbered
> task checklist and write it to `.ralph/scratchpad.md`, one task per acceptance criterion.

Give hat-1 `disallowed_tools: ["edit", "write"]` (read-only; it only writes the scratchpad via the
allowed path — if the scratchpad write needs `write`, scope it narrowly and note it, otherwise use a
tool the hat is allowed).

### 2. Code-writing hats DELEGATE to worker subagents
pi-ralph is in-process, so the `Agent` tool is live. A Builder/Worker/Fixer hat must NOT
hand-write code. Append to its instructions:

> ### Delegate to a worker subagent (fault-tolerance routing)
> Spawn a worker sized to the task's tier and hand it a tight spec:
> - LOW tolerance (auth / secrets / DB migration / schema / public API / money / data-deletion /
>   irreversible) → `<vertical>-frontier-worker` (frontier model).
> - STANDARD or TRIVIAL → `<vertical>-worker` (worker model).
> Spawn with `run_in_background: false` so the hat BLOCKS on the result (its turn needs the outcome
> before publishing). After the worker returns, persist what changed to the scratchpad, then publish.
> Safety ratchet: UPGRADE the tier if riskier than planned, never downgrade.

### 3. Review hats DELEGATE to a reviewer subagent
Append to any review/verify hat's instructions:

> ### Delegate review to a reviewer subagent (fault-tolerance routing)
> Spawn sized to tier: LOW diff (auth / secrets / migration / schema / public API / money) →
> `<vertical>-frontier-reviewer` (frontier model, mandatory for these); STANDARD → `<vertical>-reviewer`
> (worker model). Spawn `run_in_background: false` so you block on the verdict. Fold findings into
> your decision, then publish approved / changes-requested.

### 4. One task per iteration
Builder/Worker hats implement exactly ONE scratchpad task per activation, then publish. This keeps
each fresh-session iteration bounded. The Committer/terminal hat checks the scratchpad and routes back
for the next task or emits `completion_promise`.

### 5. Guardrails always set
Every preset sets `max_iterations` and a `completion_promise`. Add `max_runtime_seconds` for
long loops and `max_activations` on one-shot hats (e.g. the ingester runs once).

## Workflow

1. Confirm preconditions (ralph level chosen; spec exists). Read the spec + design docs.
2. Read the closest fixed `-ingest` preset as a starting shape (`~/.pi/agent/ralph/presets/`). If one
   is close, prefer editing a copy over authoring blank.
3. Design the hat flow: list roles, the event between each, which hat is terminal.
4. Apply authoring rules 1–5. Ingest hat-1, delegate-aware code/review hats, guardrails.
5. Write to `.pi/ralph/presets/<name>.yml` (project-level, committed with the repo) for a
   task-specific preset, or `~/.pi/agent/ralph/presets/<name>.yml` (user-level) for a reusable one.
   Project-level wins on name clash.
6. Validate YAML parses and every `publishes` event is either triggered by another hat or terminal.
7. Preview the preset + the launch command to the user. Get approval.
8. Hand off — do NOT start the loop yourself:
   ```
   /ralph <name> --path <spec-path>
   ```

## This skill is terminal
It authors the contract and stops. Starting `/ralph` is the user's action (or an explicit follow-up),
mirroring the pre-loop / in-loop phase boundary.
