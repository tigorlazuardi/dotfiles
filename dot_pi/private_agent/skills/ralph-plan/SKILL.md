---
name: ralph-plan
description: >-
  Use this to author a Ralph Loop contract — the RALPH.md plus resume state — that a Sonnet
  orchestrator (Sonnet by default, Opus for a low-correctness-tolerance slice) will execute via /ralph in a git worktree. Trigger this whenever the
  user wants to "plan a ralph loop", "make a ralph plan / ralph contract", set up an autonomous
  iterative build with tiered review, prepare a slice for ralph-loop, or asks how to drive ralph-loop
  with subagents and cost-aware model routing. This skill is Opus-only by design: it stops early and
  hands back to the user if the current model is not Opus, because good Ralph contracts come from
  asking many questions before planning, which Opus does best.
---

# Ralph Plan — author a contract for `/ralph`

This skill produces the artifacts the orchestrator (Sonnet by default; Opus for a low-correctness-tolerance slice — see Step 2.5) needs to run a task autonomously through
the Ralph Loop. You (Opus) are the planner; you do **not** run the loop. You interview the
user, decompose the goal into slices, and write a self-contained contract per slice.

## Why Opus plans and a cheaper session orchestrates

A Ralph contract is read and re-executed dozens of times by a cheaper model with little human
oversight. Every ambiguity you leave behind gets amplified across iterations and costs far more than
the planning tokens would have. So we spend Opus once, up front, to ask hard questions and remove
ambiguity — then let a cheaper orchestrator (Sonnet by default) do the bulk execution and let Sonnet/Opus review per risk tier. The goal
is **maximum benefit at a chosen cost**, not minimum cost: suppress expensive tokens where they don't
buy correctness, spend them where they prevent expensive mistakes.

## Step 0 — Opus gate (do this first, before anything else)

Look at the model identity in your system context. If the model id does **not** start with
`claude-opus`, STOP immediately. Do not interview, do not write files. Output exactly this and end:

> ⛔ `/ralph-plan` needs Opus. You're on a different model. Switch to an Opus model (e.g. `Ctrl+P` →
> Opus) and run `/ralph-plan` again. Opus is required because a good Ralph contract comes from asking
> a lot of questions before planning, and that's where Opus earns its keep.

Only continue past this point when you have confirmed you are Opus.

## Step 1 — Interview (ask a lot; one question at a time)

This is the part that justifies using Opus. Do not rush to a plan. Drive a real dialogue, one
question per turn, until you could hand the contract to a stranger and trust the outcome. Cover at
least:

- **Goal & done-condition.** What does "finished" mean in verifiable terms? What command proves it
  (tests, build, lint, a script)? If there's no objective check, invent one with the user — Ralph is
  unsafe without a truth signal.
- **Repo reality.** Branch to base off, build/test commands, how long they take, what's currently
  green, languages/frameworks. Read the repo to confirm rather than trusting memory.
- **Scope boundaries.** What is explicitly out of scope? What must NOT be touched?
- **Risk surface.** Which areas are dangerous (auth, migrations, payments, data deletion, public
  APIs)? These drive tiering.
- **Decomposition.** Can the goal be split into independent **slices** that each finish and merge on
  their own? Prefer several small slices over one giant loop.
- **Budget posture.** Rough iteration ceiling, and how aggressively to prefer Sonnet vs escalate to
  Opus.

Use the repo and any available docs tools to come prepared. Don't make the user tell you what you can
read yourself.

## Step 2 — Tiering and review routing

Assign every task a tier on **risk × complexity**:

- **L** — high risk or high complexity (touches the risk surface, hard to verify, broad blast
  radius). Reviewer = **Opus**.
- **S / M** — routine, well-bounded, easy to verify. Reviewer = **Sonnet**.

The reviewer model is a property of each task, written into the contract. When in doubt, tier up: a
wrong cheap review on a dangerous task is the most expensive failure mode.

**Cluster L tasks so Opus reviews batch.** Each Opus spawn pays an expensive cold-context startup, so
the contract reviews L tasks in a single Opus call per batch rather than one per task. When you lay
out batches (next step), try to group L tasks that can be reviewed together, and keep each L task's
acceptance criteria self-contained enough that Opus can judge it from the diff + criteria alone,
without needing a follow-up round-trip. Spend Opus rarely and completely.

## Step 2.5 — Choose the orchestrator model (write it into the contract)

The orchestrator runs resident across the whole loop — every iteration, for hours — so its model is the biggest cost multiplier in the run. Choose it deliberately and **write it into the contract**: the `<orchestrator-model>` placeholder in RALPH.md and an `orchestrator_model:` line in RALPH_PROGRESS.md. Users routinely forget to set the session model, so the contract also makes the loop **early-exit on mismatch** (the first section of the RALPH template).

- **Default: Sonnet — general & mechanical slices.** High-correctness-tolerance work (CRUD, plumbing, refactors, UI, tests, well-bounded changes that are easy to verify): the orchestrator's per-iteration job is clerk work — dispatch the next task, read a PASS/FAIL verdict, advance or retry, checkpoint-commit. Opus judgment is already routed on demand (L-task reviews + the circuit-breaker spawn `model: opus`). Pay Opus at the decision points, not for the resident driver. The mantra in action.
- **Opus — low correctness tolerance.** When a wrong autonomous decision is expensive or hard to undo: money/payment flows, auth, secrets, DB migrations, data deletion, public-API contracts. There every accept/merge/advance decision carries blast radius, so routing Opus only to the review step isn't enough — the resident driver itself needs Opus judgment. This is the deliberate, justified exception to the Sonnet default.

**Large scope → split by orchestrator model (the main cost lever).** Don't Opus-orchestrate a whole big feature. Decompose so the low-tolerance work is isolated into its own slice(s) under an Opus orchestrator and the mechanical remainder runs as separate slice(s) under a Sonnet orchestrator. Each slice's contract declares its own `<orchestrator-model>`, so you spend Opus on the money slice, not the CRUD around it. If you're about to tag a whole large feature Opus-orchestrated, re-slice instead.

State your choice and a one-line reason in the contract's Implementation strategy section so the executor and the human see why.

## Step 2.6 — Ordering and parallelism (prefer parallel)

Build the task **dependency graph**, then group tasks into ordered **batches**: every task in a batch
must be independent of the others in that batch, and each batch depends only on earlier batches. Push
as much as you safely can into parallel — wall-clock time is part of "benefit," and independent tasks
running concurrently is the cheapest speedup we have.

The worktree rule follows directly from this:

- **Parallel batch (2+ tasks).** Each task runs in its **own git worktree** off the slice's
  integration branch, so concurrent edits can't collide. After a task passes review, the orchestrator
  **merges its worktree back into the integration branch** and removes the worktree. Conflicts between
  parallel results are the orchestrator's job to resolve before moving to the next batch.
- **Sequential / single task.** A separate worktree is **not required**; the orchestrator can work
  directly on the integration branch.

So a slice always has one **integration branch**; parallel work fans out into child worktrees and
fans back in. Mark each task's `parallel_group` (batch id) and whether it needs its own worktree in
the contract. When two tasks *look* independent but touch the same files, keep them in separate
batches — false parallelism causes merge thrash that costs more than it saves.

**Cap parallel at 4** (a batch wider than 4 splits into waves). Each child worktree is not a full env —
gitignored files (`.env`, `node_modules`, `.venv`) aren't copied — so fill the contract's
`<install-cmd>` and a per-worktree isolation scheme (unique ports/DB schema) so concurrent tasks don't
collide. The template has slots for both.

## Step 2.7 — Visual plan (L-tier feature scope)

If the overall feature is **L-tier** (multi-day, cross-cutting, 4+ tasks, touches risk surface, or hard to verify), invoke the `/visual-plan` skill — specifically `create-visual-plan` in document-only mode (architecture/backend, no canvas) — before writing the contract files. This gives the user a rich review artifact before anything is committed.

The visual plan must cover:
- A `diagram` block of the full task DAG: nodes per task, dep arrows, batch groupings (parallel batches in same column), wave ordering
- A table of tasks: id, batch, `orchestrator-model`, reviewer tier (Opus/Sonnet), `parallel_group`, key deps, done-condition summary
- Risk surface callout: which tasks are L-tier, why, and what happens if they go wrong
- Implementation strategy rationale (Sonnet vs Opus orchestrator choice, why split if split)
- Open questions block (`question-form`) for anything still unresolved

After `create-visual-plan` returns the plan URL: surface it to the user and ask them to review. Run the self-review pass concurrently (do not make the user wait). Apply clear-cut fixes with `update-visual-plan` contentPatches; route real ambiguities into the `question-form` or ask the user directly. **Do not proceed to Step 3 until the user approves the plan and all open questions are resolved.**

Skip this step for S/M-tier feature scope — a terse written summary before handoff is enough.

## Step 3 — Write the artifacts

Each slice gets a directory: `plans/<scope>/<nnn>-<slice-name>/` where `<nnn>` is a zero-padded index
(`001`, `002`, …) and `<scope>` is a short area name (e.g. `auth`, `billing`). Inside it write:

- **`RALPH.md`** — the contract the orchestrator re-reads every iteration. Build it from
  `assets/RALPH.template.md`. It must be fully self-contained, because `/ralph` feeds its entire
  text back verbatim each loop and the orchestrator may have no other memory.
- **`RALPH_PROGRESS.md`** — the resume ledger. Build it from `assets/RALPH_PROGRESS.template.md`. The orchestrator reads
  it first thing and updates+commits it after every task, so a crash / power loss / accidental stop
  can resume exactly where it left off.

Read both template files now and fill every placeholder. Leave no `<...>` or TODO behind — unfilled
placeholders become Sonnet guessing under-supervised.

Fold the **Sanity Check** and **Implementation Strategy** directly into `RALPH.md` (the template has
sections for them). They are not separate files: the orchestrator only ever re-reads `RALPH.md`, so
anything it must act on lives there.

## Step 4 — Subagents

Execution uses committed subagents — `implementer`, `reviewer`, `scout`
(shipped alongside this skill under `~/.pi/agent/agents/`). The orchestrator picks the model **per
spawn** via the Agent tool's `model` parameter — `sonnet` for implementers and S/M reviews, `opus` for
L reviews and for the two-failure circuit-breaker decision. Each agent file carries a `model:` default
in its frontmatter, but the per-spawn `model` parameter **overrides** it, so the Opus
routing for L tasks holds. You do not generate per-model agent files; routing is logic in `RALPH.md`.
Verify all agents exist; if missing, tell the user to (re)install them.

Pi reviewers self-verify (re-run command, re-read code) — no nested verifier subagent in pi.

**Caveman by default.** The contract makes the orchestrator and every spawned subagent
(`implementer`, `reviewer`) report caveman-compressed — drop articles/filler/hedging, keep
full technical substance — because narration is the cheapest token to cut and subagent reports flow
back into the orchestrator's context. Code, commit messages, `RALPH_PROGRESS.md`, the `<promise>` tag, and
security points stay normal. This is already baked into the templates and agent files.

**Implementers don't compact — they hand over.** An `implementer` that nears its context limit
mid-task does not silently auto-summarize (which can drop the one detail that matters). It wraps up at
a clean point into a **handover doc** and returns `RESULT: HANDOVER`; the orchestrator persists that
doc and spawns a fresh implementer to continue the same task. This keeps long tasks lossless across
context windows, and a handover never counts as a failed attempt. The contract template already
encodes this; just make sure each task's acceptance criteria and "Touches" list are precise enough
that a second implementer can pick up cold.

## Step 4.5 — Self-review the contract before handoff

A hole in the contract is paid for many times over in the loop. Re-read the finished `RALPH.md` and
`RALPH_PROGRESS.md` with fresh eyes and fix inline:

- **No placeholders.** Zero `<...>` or TODO left — every slot filled, including `<verify-command>`,
  `<install-cmd>`, base/integration branches, isolation scheme.
- **Every task verifiable.** Each "Done when" names a concrete command/check, not a vibe.
- **Deps acyclic & batched.** Batches respect the dependency graph; nothing in a batch depends on a
  sibling; no batch wider than 4.
- **Truth signal real.** `<verify-command>` actually proves the goal and is green at baseline.
- **Promise phrase exact.** `RALPH SLICE FINISHED` matches the handoff command's `--completion-promise`
  character-for-character.

Fix anything found; no need to re-review.

## Step 5 — Hand off (this skill is terminal)

Do not start the loop. End by printing, for each slice, a copy-paste handoff. Remind the user that
`/clear` wipes the visible transcript, so they should copy first. Example:

```
✅ Contract ready: plans/<scope>/001-<slice-name>/

Next:
1) Copy this block (/clear erases the chat).
2) Switch model to Sonnet (Ctrl+P).
3) /clear  (or open a fresh session) — you'll run as the orchestrator.
4) Paste:

/ralph "$(cat plans/<scope>/001-<slice-name>/RALPH.md)" --max-iterations <N> --completion-promise "RALPH SLICE FINISHED"
```

Pick `<N>` from your iteration estimate plus headroom. Use the promise phrase **exactly**
`RALPH SLICE FINISHED` — the contract defines it as "terminal state reached: all tasks done &
committed, OR an abort reason recorded in RALPH_PROGRESS.md," so it's truthfully emittable on both success and
abort (the loop only supports one promise).

If you produced multiple slices, present them in run order and note which depend on which.

## Two levels of merge

Be explicit in the contract about both:

1. **Intra-slice (automated, inside the loop).** When a parallel batch finishes, the orchestrator
   merges each reviewed child worktree into the slice's **integration branch**, resolving conflicts.
   This is normal loop work, not a stopping point.
2. **Slice → base branch (human gate, after the loop).** The contract makes the orchestrator stop at
   "integration branch green, all tasks reviewed, committed, summary written" — it does **not**
   auto-merge to the base branch. After the loop exits, the user reviews the diff and merges (or asks
   the fresh Sonnet session to). Put the exact merge commands in the slice's summary so it's a
   one-liner. This is the deliberate human approval gate before anything reaches the base branch.
