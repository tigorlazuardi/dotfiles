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

2. **Ask the ambiguous questions — do this thoroughly before writing anything.**
   This step is NOT a quick checkbox. A bad plan built on assumptions wastes far more time than an extra Q&A round.

   Categories to interrogate. For each, ask if not crystal-clear from context:
   - **Goal / why** — what problem does this solve? What does success look like to the user?
   - **Scope** — what is explicitly OUT of scope? What is the user willing to sacrifice to keep this focused?
   - **Success criteria** — how will the user verify it is done? Any non-functional requirements (perf, security, compat)?
   - **Constraints** — tech stack, no-new-deps, must-not-break, deadline, branch strategy?
   - **Existing state** — is there prior work / a half-done attempt / related ADRs to build on?
   - **Escalation tolerance** — does the user want Opus review on every hard task, or only on security/migration?
   - **Iteration cap** — how many iterations is acceptable? Any cost sensitivity?

   Rules:
   - Use `AskUserQuestion` to batch decision-shaping questions (up to 4 per call). Do NOT scatter them one-by-one.
   - Do NOT guess on anything that changes the plan shape. A wrong assumption here gets baked into guardrails and verify commands that Sonnet cannot override.
   - If the first answer opens new ambiguity, ask again. Keep Q&A going until you can write a plan with NO placeholders.
   - Only move to step 3 when you can answer: "What exactly does done look like, and how do I prove it with a command?"

3. **Propose approach.** 2-3 options + trade-offs + your recommendation. Get user approval before writing docs.

4. **Decide scope + slice name.** Create `plans/<scope-name>/<nnn>-<slice-name>/` (non-repo context like `~/.claude` → `<cwd>/plans/<scope>/<nnn>-<slice>/`). Also capture the **base branch** now — `git branch --show-current` — this is the branch the loop's eventual PR/MR targets (§11). Record it in CONTRACT.md's header.

5. **Write the slice docs** (templates in `$CLAUDE_DIR/docs/orchestrator-templates.md`):
   - `SCOPE.md` — in/out scope, non-goals, constraints.
   - `IMPLEMENTATION.md` — why + approach + key decisions + risks.
   - `TASKS.md` — ordered concrete steps, each with a verify command.
   - `RESUME.md` — initial state, status `active`, per-task `attempts:` counters at 0.
   - `CONTRACT.md` — the autonomous contract, per `$CLAUDE_DIR/docs/ralph-contract-template.md`. This is the heart.
   - `PROMPT.md` — the fixed loop prompt fed back every iteration (template in the contract template doc). The start command inlines it via `"$(cat …/PROMPT.md)"`. Promise phrase inside must match CONTRACT.md §3 and the `--completion-promise` exactly.

6. **Author the CONTRACT.md carefully** — you (Opus) have awareness Sonnet lacks; bake it in:
   - **Sanity check §0 (preflight).** First section in CONTRACT.md. Bash commands the loop runs BEFORE any task work each iteration: branch guard, CONTRACT.md/RESUME.md exist, no BLOCKED.md, any project-specific prereqs. If any check fails → stop and report, do NOT proceed. Fill in real paths — no generic placeholders.
   - **ralph-loop compat.** The contract is consumed by the ralph-loop plugin, invoked as `/ralph-loop:ralph-loop` (`plugin:command`, repeated — NOT `/ralph-loop`). Verify:
     - State file: `.claude/.ralph-loop.local.md` (loop writes this — do NOT mention `.claude/ralph-loop.local.md` with wrong prefix).
     - Promise tag: `<promise>PHRASE</promise>` exactly — the stop hook pattern-matches on this. No variation.
     - Promise phrase in §3 == `--completion-promise` value in §10 == the phrase inside `PROMPT.md`, character-for-character including case and spaces.
     - `--max-iterations` is set; loop auto-stops at that count if promise never fires.
     - Start command reads the prompt from `PROMPT.md` via `"$(cat …/PROMPT.md)"`, not an inline string.
   - **§11 post-completion PR/MR.** Author §11 so that, on the promise turn, the loop pushes the feature branch then offers a PR/MR to the recorded **base branch**: `gh`/`glab` create command if the matching CLI is authed for that host, else a compare URL. Header **Base branch** must hold the real branch from step 4 (no placeholder).
   - **Success criteria = machine-checkable.** Every "done" is a concrete command that exits 0. No vibe-based acceptance.
   - **Promise gate.** Sonnet may emit `<promise>` ONLY after running every verify command, all green, output pasted. Never on self-assessment.
   - **Tasks table** with per-task `difficulty` + `review: self|sonnet|opus` + `escalate_after: 2`. Tag genuinely hard / security / migration / public-API tasks `review: opus`.
   - **Guardrails** — explicit do-NOT-touch + constraints. Sonnet wanders more; lock scope.
   - **Escalation** — same task fails verify 2x → Opus diagnose. Task tagged `opus` → Opus review before done.
   - **Abort protocol** — Opus-diagnose returns IMPOSSIBLE → write BLOCKED.md → `rm .claude/.ralph-loop.local.md` → exit. Only authorized exit besides success.
   - **Backstop** — always set `--max-iterations` (default 30). Tune to task size.

7. **Self-review the contract** (spec self-review): scan for placeholders/TBD, contradictions, ambiguous criteria, any "done when" that is not a runnable command. Fix inline. A clean spec is what a lower-awareness executor needs.

8. **Print the exact start command.** Tell the user to run it in a FRESH Sonnet session on a dedicated branch. The prompt is inlined from `PROMPT.md`:
   ```
   git checkout -b ralph/<scope>-<nnn>
   /ralph-loop:ralph-loop "$(cat plans/<scope>/<nnn>-<slice>/PROMPT.md)" --max-iterations 30 --completion-promise 'ALL ACCEPTANCE MET'
   ```
   Use the plugin form `/ralph-loop:ralph-loop` (repeated `plugin:command`), NOT `/ralph-loop`. Adjust the path, branch, max-iterations, and promise phrase to match the contract you wrote.

9. **Hand off.** Summarize: slice folder path, what the loop will do, how to resume (re-run the start command — RESUME.md carries state), where BLOCKED.md appears if it aborts, and that on completion the loop offers a PR/MR (`base ← ralph/<scope>-<nnn>`) per §11.

## Notes
- Do NOT implement code here. This skill plans + emits the contract; execution happens in the separate Sonnet ralph session.
- Keep the contract self-contained: the `PROMPT.md` text is fed back verbatim every iteration, so all durable state must live in CONTRACT.md (fixed) + RESUME.md (progress) — never in PROMPT.md.
