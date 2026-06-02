# Orchestrator playbook

Referenced from `CLAUDE.md`. Load on demand — only when actually running a multi-step slice or fanning out workers. Not needed every turn. Templates live in `orchestrator-templates.md`.

## Orchestrator workflow

1. **Receive task.** Clarify scope if ambiguous (AskUserQuestion).
2. **Resume check.** If user references prior work, check `<repo>/plans/<scope>/` for an existing slice `RESUME.md` and load it (+ sibling SCOPE/IMPLEMENTATION/TASKS).
3. **Slice setup.** For multi-step/multi-day work, decide scope+slice name, create `<repo>/plans/<scope>/<nnn>-<slice>/`, write docs per the effort tier (see CLAUDE.md "Effort tier"):
   - `SCOPE.md` if major + needs explicit constraints.
   - `IMPLEMENTATION.md` (approach + reasoning).
   - `TASKS.md` (concrete steps).
   - `RESUME.md` (initial state, status: active).
4. **Dependency check.** Single linear chain, or independent branches? Independent → parallel spawn. Dependent → serialize.
5. **Delegate.** Spawn worker with tight spec: goal, files in scope, files out of scope, acceptance criteria, gotchas. Point at slice folder path.
6. **Review.** On return, read summary + diff (scale review to effort tier). Verify against spec. Run tests/typecheck if relevant.
7. **Update RESUME.md.** After each milestone: mark TASKS done, append decisions to IMPLEMENTATION.md, record open questions, save worker handover path.
8. **Fix loop.** Incomplete/wrong → spawn another worker with a fix spec referencing what failed. Do not implement the fix directly.
9. **Handover relay.** Worker returns pre-compaction handover → read it, spawn fresh worker, pass handover path + original spec.
10. **Wrap.** Report outcome. Slice complete → RESUME.md status `done`. Commit only if user asked.

## Parallel spawn (multi-agent fan-out)

Spawn multiple workers concurrently when dependency chains are clear and disjoint. Preferred speedup for slices that decompose into independent units.

### When to fan out
- Tasks touch **disjoint file sets** (worker A `frontend/`, worker B `backend/`).
- Independent reads/research the orchestrator synthesizes.
- Multiple sub-steps sharing no state.

### Serialize instead when
- Worker B needs worker A's output (file produced, type added, function renamed).
- Workers would edit the same file → merge conflicts.
- A test/lint run must observe both changes together; broken interim state unacceptable.

### Git worktrees for parallel writes
≥2 workers both writing code → pass `isolation: "worktree"` in the Agent call. Each gets its own temp worktree off the default branch; edits don't collide.
- Temp worktree created from default branch.
- Subagent runs entirely inside it — edits never touch your main copy.
- On finish, CC returns worktree path + branch. No changes → auto-cleaned.
- After all return, merge branches, run combined suite, delete worktrees.

### Fan-out workflow
1. Decompose TASKS into independent units. List deps in IMPLEMENTATION.md or a "Parallel plan" section in RESUME.md.
2. Prepare a separate spec per unit (files in/out of scope, acceptance criteria).
3. Spawn all workers in **one message with multiple Agent calls** (this is what parallelizes). Pass `isolation: "worktree"` for code writes.
4. As each returns, capture summary + worktree path + branch into RESUME.md "Parallel results".
5. All returned → merge in order, resolve conflicts (fix worker if non-trivial), run combined verification.
6. Clean up worktrees (`git worktree remove <path>` after merge; no-op workers auto-clean).

### Read-only fan-out
Research only (Read/Grep/Glob, no edits) → no worktree. Spawn multiple `sonnet-support`/`Explore` in one message. Synthesize their summaries.

### Caps
- Soft cap ~4 parallel workers. More → orchestrator review is the bottleneck.
- Batch fails coherence (merged tests red, type drift) → do NOT spawn more. Diagnose, redo serially or shrink the slice.

## Resume note discipline
- One `RESUME.md` per slice, in the slice folder. Commits with the slice.
- Stable filename — update in place, never timestamp.
- Update after each milestone, not session end. Stale RESUME.md is worse than missing.
- When delegating, give the worker the slice folder path + the spec for *this* step. Don't paste the entire RESUME.md.

## Worker handover relay (intra-task, between workers)
- Workers write handovers to `$CLAUDE_DIR/handovers/<slug>-<UTC>.md` when context gets tight.
- NOT RESUME.md — these are intra-slice transfers between two workers on the same step.
- When relaying, re-include the original goal + acceptance criteria (from TASKS.md/RESUME.md) alongside the handover path.
- Do not edit handover files — worker's record. Add new context in the delegation prompt instead.
- Old handovers are scratch; safe to delete once RESUME.md marks the slice done.

## Memory prune cadence
Memory entries load every session when relevant — stale entries are a recurring tax. Pruning interrupts long runs, so the threshold is generous:
- **Soft signal:** `MEMORY.md` > ~100 entries OR an entry older than 6 months unreferenced in recent work.
- **Hard signal:** `MEMORY.md` > ~200 entries OR memory conflicts surface multiple times in one session.
- Soft → queue a prune for the next maintenance session (don't interrupt current work).
- Hard → propose a prune at a natural break. Don't auto-prune without consent.
- Long autonomous runs: ignore soft entirely; surface hard only at scheduled checkpoints.
- Prune actions: drop dead references (memories naming removed code/flags), merge duplicates, demote one-time observations that never recurred.

## Why this setup
- Opus as the implementation hand burns budget on tool-output tokens.
- Workers run in isolated contexts — their tool output doesn't pollute the orchestrator's.
- Smaller worker contexts hit compaction faster; the handover protocol turns that into a clean restart, not a degraded compaction.
- Planning docs in the repo → reviewable, diffable, resumable by any future session via `git pull`.
- Two-tier (orchestrator reviews, worker implements) catches more errors than a single-agent loop.
