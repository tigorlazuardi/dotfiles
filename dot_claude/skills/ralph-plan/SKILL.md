---
name: ralph-plan
description: Opus-side planning for a COMPLEX feature that will run autonomously via ralph-loop on a fresh Sonnet session. Use when user says "/ralph-plan", "plan a ralph loop", "bikin ralph contract", or judges a feature hard enough to need an Opus plan + autonomous Sonnet execution. Runs an interactive plan→Q&A session, then emits slice docs + a CONTRACT.md with quality gates + the exact /ralph-loop start command.
argument-hint: "<feature description>"
disable-model-invocation: true
model: opus
---

# Ralph Plan

Interactive Opus planning session that ends in a self-contained autonomous **ralph-loop contract** a fresh Sonnet session can execute unattended.

This skill runs INLINE on Opus (not a forked subagent) — the user wants to talk to you. `model: opus` forces the planning turn onto Opus even if invoked from a Sonnet session. Entry point for the COMPLEX-feature path only; simple/fast work skips this and goes direct to Sonnet.

The deliverable that makes execution safe is `CONTRACT.md` — its full template + every gate lives in `$CLAUDE_DIR/docs/ralph-contract-template.md` (resolve `$CLAUDE_DIR` = `$CLAUDE_CONFIG_DIR` or `$HOME/.claude`). Read that template before writing the contract.

## Steps

1. **Explore context.** Read relevant files, existing `plans/<scope>/`, ARCHITECTURE.md, prior ADRs. Understand current state before proposing.

2. **Ask the ambiguous questions.** Purpose, constraints, success criteria, out-of-scope. Use `AskUserQuestion`; batch the decision-shaping ones. Do NOT guess on anything that changes the plan shape.

3. **Propose approach.** 2-3 options + trade-offs + your recommendation. Get user approval before writing docs.

4. **Decide scope + slice name.** Create `plans/<scope-name>/<nnn>-<slice-name>/` (non-repo context like `~/.claude` → `<cwd>/plans/<scope>/<nnn>-<slice>/`).

5. **Write the slice docs** (templates in `$CLAUDE_DIR/docs/orchestrator-templates.md`):
   - `SCOPE.md` — in/out scope, non-goals, constraints.
   - `IMPLEMENTATION.md` — why + approach + key decisions + risks.
   - `TASKS.md` — ordered concrete steps, each with a verify command.
   - `RESUME.md` — initial state, status `active`, per-task `attempts:` counters at 0.
   - `CONTRACT.md` — the autonomous contract, per `$CLAUDE_DIR/docs/ralph-contract-template.md`. This is the heart.

6. **Author the CONTRACT.md carefully** — you (Opus) have awareness Sonnet lacks; bake it in:
   - **Success criteria = machine-checkable.** Every "done" is a concrete command that exits 0. No vibe-based acceptance.
   - **Promise gate.** Sonnet may emit `<promise>` ONLY after running every verify command, all green, output pasted. Never on self-assessment.
   - **Tasks table** with per-task `difficulty` + `review: self|sonnet|opus` + `escalate_after: 2`. Tag genuinely hard / security / migration / public-API tasks `review: opus`.
   - **Guardrails** — explicit do-NOT-touch + constraints. Sonnet wanders more; lock scope.
   - **Escalation** — same task fails verify 2x → Opus diagnose. Task tagged `opus` → Opus review before done.
   - **Abort protocol** — Opus-diagnose returns IMPOSSIBLE → write BLOCKED.md → `rm .claude/ralph-loop.local.md` → exit. Only authorized exit besides success.
   - **Backstop** — always set `--max-iterations` (default 30). Tune to task size.

7. **Self-review the contract** (spec self-review): scan for placeholders/TBD, contradictions, ambiguous criteria, any "done when" that is not a runnable command. Fix inline. A clean spec is what a lower-awareness executor needs.

8. **Print the exact start command.** Tell the user to run it in a FRESH Sonnet session on a dedicated branch:
   ```
   git checkout -b ralph/<scope>-<nnn>
   /ralph-loop "Autonomous execution. Read plans/<scope>/<nnn>-<slice>/CONTRACT.md and RESUME.md. Execute the next unchecked task per the contract. Honor guardrails, escalation, abort, and the promise gate. Emit the promise ONLY when the §3 gate passes." --max-iterations 30 --completion-promise 'ALL ACCEPTANCE MET'
   ```
   Adjust the path, branch, max-iterations, and promise phrase to match the contract you wrote.

9. **Hand off.** Summarize: slice folder path, what the loop will do, how to resume (re-run the start command — RESUME.md carries state), where BLOCKED.md appears if it aborts.

## Notes
- Do NOT implement code here. This skill plans + emits the contract; execution happens in the separate Sonnet ralph session.
- Keep the contract self-contained: the same prompt is fed back every iteration, so all durable state must live in CONTRACT.md (fixed) + RESUME.md (progress).
