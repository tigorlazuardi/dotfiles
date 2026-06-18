---
name: feature-planning
description: Use when the user asks to plan a whole feature or multi-part build — phrases like "plan untuk fitur ini semua", "plan untuk fleet", "plan this feature", "let's plan X". The main Opus agent triages the execution mode (one-shot Opus vs Fleet vs Ralph), confirms the choice with the user, then routes to the right executor. Run this BEFORE committing to any execution path.
---

# Feature planning — mode triage

You (main agent, **must be Opus**) decide HOW to build a requested feature before building it. Do not jump straight to coding or to a specific mode. Triage → confirm → route.

If this session is not Opus, say so and ask the user to `/model` to Opus first — mode triage is an Opus-judgment call.

## Step 1 — understand the work (interview)

Ask only what you need to classify (use AskUserQuestion). Probe:
- Scope: one coherent change, or several distinct pieces?
- Parallelism: can pieces be built independently, or is it one long dependent chain?
- Risk/correctness: any low-tolerance surface (auth, billing, migrations, public API)?
- Size: fits one focused session, or a multi-day grind?
- Attended or unattended (will it run while you're away / under rate limits)?

Don't over-interview here — deep slice-level interviewing happens inside the chosen executor's planner.

## Step 2 — classify (decision guide)

| Signal | Mode | Why |
|---|---|---|
| 1–few files, single coherent change, fits one session, easy to verify | **One-shot Opus** | No fan-out overhead. Opus plans + drives it directly (delegating writes to workers). |
| Multi-slice feature, slices parallelize (a DAG), want autonomous fan-out + per-slice orchestrators + knowledge sharing, may run unattended/resumable | **Fleet** | Captain spawns one orchestrator per slice across waves, merges, propagates rules/skills. Rate-limit-safe + resumable. |
| ONE very large mostly-sequential build, won't fit a session, needs loop + checkpoint + completion gate, single track (little parallelism) | **Ralph** | Loop with on-disk progress + completion promise. Best for the long single chain, not for parallel slices. |

Edge calls:
- Parallel + long → **Fleet** (it already handles waves + resume).
- Sequential + long + single track → **Ralph**.
- Small but risky → **One-shot Opus** with an opus-reviewer pass.
- Unsure between Fleet and Ralph → prefer **Fleet** if the work splits into independent slices; **Ralph** if it's genuinely one indivisible long effort.

## Step 3 — recommend + confirm

State your pick + a one-line rationale + the rough shape (e.g. "Fleet: ~4 slices, 2 waves, auth+billing opus-orchestrated"). Confirm with the user via AskUserQuestion (accept / switch mode / adjust). **Do not start building until the user confirms the mode.**

## Step 4 — route

- **Fleet** → invoke the `fleet` skill (it runs its own opus-planner interview → DAG → gate → build).
- **Ralph** → run `/ralph-plan <feature>` (Opus interactive plan → emits the ralph contract), then start the ralph loop on the declared model.
- **One-shot Opus** → plan inline (SCOPE if it locks decisions), then execute as the Opus orchestrator, delegating writes to `sonnet-implementer` and reviewing per the effort tier.

Each executor owns its own deep planning/interview. This skill only picks the lane.
