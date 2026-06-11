# Ralph contract template

Referenced from `skills/ralph-plan/SKILL.md` and `docs/orchestrator-playbook.md`. Load on demand — only when Opus authors a ralph contract, or when a Sonnet ralph-loop session needs the execution rules.

A **ralph contract** lets a fresh Sonnet session execute a complex feature unattended via the ralph-loop plugin. Opus (higher awareness) authors it; Sonnet (lower awareness, autonomous) executes it. The contract compensates for the awareness gap with machine-checkable gates, locked scope, and Opus-gated escalation/abort.

## How ralph-loop actually works (constraints that shape the contract)

- `/ralph-loop:ralph-loop "$(cat <slice>/PROMPT.md)" --max-iterations N --completion-promise 'PHRASE'` writes `.claude/.ralph-loop.local.md` and feeds **the same prompt back every iteration** when the session tries to exit. Invoke via the plugin form `/ralph-loop:ralph-loop` (`plugin:command`, repeated) — NOT `/ralph-loop`. The loop prompt lives in `PROMPT.md` and is inlined with `"$(cat …/PROMPT.md)"` (bash command-substitution at the `!`-run command) so it can be long without shell-escaping hell.
- The loop exits ONLY when: (a) the session outputs `<promise>PHRASE</promise>` with PHRASE matched exactly, OR (b) `iteration >= max_iterations`, OR (c) the state file `.claude/.ralph-loop.local.md` is deleted.
- Progress is NOT in the prompt (it never changes). All durable state lives in files: `CONTRACT.md` (fixed) + `RESUME.md` (progress) + git history. The loop re-reads them each iteration.
- The session has Bash, so it CAN delete the state file to exit — that is the abort hatch. The contract must explicitly authorize it under one gated condition, because ralph's default instructions say "never circumvent / never lie to escape."

## CONTRACT.md template

```markdown
# Ralph Contract: <slice title>

**Slice:** <repo>/plans/<scope>/<nnn>-<slice>/
**Executor:** Sonnet orchestrator, autonomous ralph-loop (fresh session)
**Planner:** Opus — contract authored <UTC date>
**Base branch:** <branch active when ralph-plan ran — the PR/MR target in §11. Fill the real name, no placeholder.>

## 0. Sanity check (preflight — run FIRST, every iteration, before any task work)

```bash
# 1. Must be on a ralph/ branch, never main/master
git branch --show-current | grep -qE "^ralph/" \
  || { echo "ERROR: not on ralph/ branch — abort"; exit 1; }
# 2. Contract + progress files must exist
test -f plans/<scope>/<nnn>-<slice>/CONTRACT.md \
  || { echo "ERROR: CONTRACT.md missing"; exit 1; }
test -f plans/<scope>/<nnn>-<slice>/RESUME.md \
  || { echo "ERROR: RESUME.md missing"; exit 1; }
# 3. If blocked, surface it and stop — do NOT iterate further
test ! -f plans/<scope>/<nnn>-<slice>/BLOCKED.md \
  || { echo "Loop BLOCKED — read BLOCKED.md:"; cat plans/<scope>/<nnn>-<slice>/BLOCKED.md; exit 0; }
# 4. <project-specific prereq — e.g.: command -v node, test -f .env, npm ci check>
```

If ANY check fails: stop, print the error, do NOT proceed to §4 tasks.

## 1. Mission
<one line: what this loop must achieve>

## 2. Success criteria (definition of done)
Loop is DONE only when ALL of these hold, each proven by a command that exits 0:
- <criterion> — verify: `<command>`
- <criterion> — verify: `<command>`

Full gate (run ALL, in order, before any promise):
` ``
<combined verify — e.g. test suite + lint + typecheck + build>
` ``

## 3. Completion promise
Phrase: `ALL ACCEPTANCE MET`   (must match the --completion-promise exactly)

Gate — MANDATORY before emitting, no exceptions:
1. Every task in §4 is checked done in RESUME.md.
2. Run every verify command in §2. ALL exit 0.
3. Paste the verify output into your response.
4. ONLY THEN output: `<promise>ALL ACCEPTANCE MET</promise>`

NEVER emit the promise on self-assessment alone.
NEVER emit it to escape a stuck loop — that is a false promise and a contract violation.
If you cannot make the gate green, you are NOT done — iterate or escalate (§6), or abort (§7).

## 4. Tasks
Ordered. Each iteration: execute the next unchecked task. Track state in RESUME.md.

| #   | Action | Files in-scope | Out-of-scope | Done when (verify cmd, exit 0) | Difficulty | Review | escalate_after |
| :-- | :----- | :------------- | :----------- | :----------------------------- | :--------- | :----- | :------------- |
| 001 | <do X> | <paths>        | <paths>      | `<cmd>`                        | easy       | self   | 2             |
| 002 | <do Y> | <paths>        | <paths>      | `<cmd>`                        | hard       | opus   | 2             |

**Review levels:**
- `self` — run the verify command, self-check the diff against the row. No Opus unless verify fails `escalate_after` times.
- `sonnet` — after implementing, re-read the full diff with fresh eyes against acceptance before marking done.
- `opus` — after implementing, spawn an Opus subagent (`/opus-review` pattern) to deep-review the diff BEFORE marking the task done. Mandatory for `opus`-tagged rows.

## 5. Guardrails (do NOT violate)
- Do NOT touch: <paths / modules / files>
- Constraints: <perf budget, API compat, no new deps, security requirement, style>
- Do NOT expand scope beyond this table. New need discovered → record under RESUME.md "Open questions", do NOT silently implement it.
- Do NOT delete or rewrite a file you did not create without surfacing it in RESUME.md first.
- Follow the CLAUDE.md orchestrator/worker split: delegate code writes to `sonnet-implementer`; the loop session orchestrates + reviews.

## 6. Escalation rules
Spawn an Opus subagent (`Agent({ model: "opus", ... })`, cold-context briefing) when ANY:
- Task tagged `review: opus` → Opus reviews its diff before the task is marked done.
- Diff touches auth / secrets / DB migration / schema change / public API → Opus review (inherits CLAUDE.md auto-trigger list).
- The SAME task fails its verify `escalate_after` times (default 2; track `attempts:` in RESUME.md) → Opus DIAGNOSE. Opus returns one of:
  - `SOLVABLE` + a concrete hint → reset that task's `attempts` to 0, apply the hint, continue.
  - `IMPOSSIBLE` + rationale → go to §7 Abort.
Briefing = the task row + the failing verify output + relevant file paths. Batch multiple Opus questions into ONE call — ping-pong is the expensive mode.

## 7. Abort protocol (only authorized exit besides success)
Trigger: Opus DIAGNOSE returned `IMPOSSIBLE`. (Sonnet judgment alone is NOT a valid abort trigger.)
Steps:
1. Write `BLOCKED.md` in the slice folder (template below).
2. Set RESUME.md status: `blocked`.
3. Run: `rm .claude/.ralph-loop.local.md`
4. Exit with a short summary pointing at BLOCKED.md.

This OVERRIDES ralph's "never circumvent the loop" default — it is gated by Opus (higher awareness), not a self-escape. Do NOT emit the completion promise to abort (that lies). Do NOT delete the state file for any other reason.

## 8. Iteration discipline (every iteration, in order)
1. Read this CONTRACT.md and RESUME.md first.
2. Idempotency: never redo a task already checked done in RESUME.md.
3. Pick the next unchecked task in §4.
4. Implement it (delegate code writes per CLAUDE.md split).
5. Run the task's verify command:
   - Pass → check the task done in RESUME.md; record files touched + key decisions; reset its `attempts` to 0.
   - Fail → increment that task's `attempts:` in RESUME.md. If `attempts >= escalate_after` → §6 escalation.
6. Checkpoint commit if the user authorized commits (one commit per completed task — keeps each iteration revertable).
7. When every task is done → run the §3 promise gate.

## 9. Backstop
max-iterations: <N>   (default 30; tune to task size). Hard ceiling. If hit, the loop stops on its own; the user reviews RESUME.md + any BLOCKED.md.

## 10. Start command (fresh Sonnet session, dedicated branch)
` ``
git checkout -b ralph/<scope>-<nnn>
/ralph-loop:ralph-loop "$(cat plans/<scope>/<nnn>-<slice>/PROMPT.md)" --max-iterations 30 --completion-promise 'ALL ACCEPTANCE MET'
` ``
Invoke form is `/ralph-loop:ralph-loop` (`plugin:command`, repeated) — NOT `/ralph-loop`. The prompt is read from `PROMPT.md` via `"$(cat …/PROMPT.md)"`; keep the long autonomous prompt in that file (see PROMPT.md template below), not inline.

## 11. Post-completion — open PR/MR to base branch
Runs in the SAME response that emits the §3 promise (the loop exits on the promise, so this cannot wait for a later iteration). Target: PR/MR from head `ralph/<scope>-<nnn>` → base `<base branch>` (the **Base branch** in the header — the branch ralph-plan ran on).

Steps:
1. Push the feature branch (safe — own branch, never force, never the base/main):
   `git push -u origin "$(git branch --show-current)"`
2. Detect remote + provider:
```bash
url=$(git remote get-url origin 2>/dev/null) || { echo "no origin remote — skip PR/MR, report loop done + branch"; }
host=$(printf '%s' "$url" | sed -E 's#^(git@|ssh://git@|https?://)([^/:]+)[/:].*#\2#')
path=$(printf '%s' "$url" | sed -E 's#^(git@|ssh://git@|https?://)[^/:]+[/:]##; s#\.git$##')
base="<base branch>"; head=$(git branch --show-current)
```
   Host not github* / gitlab* → skip PR/MR; just report loop done + the pushed branch name.
3. Pick CLI by host: `github.com`/GitHub-Enterprise → `gh`; `gitlab.*` (incl. self-hosted) → `glab`.
4. CLI authed AND host matches AND user has access (`gh auth status` / `glab auth status` exits 0, host listed) → **OFFER, do NOT auto-create** (PR/MR is outward-facing — surface the ready command, let the user confirm):
   - GitHub: `gh pr create --base "$base" --head "$head" --fill`
   - GitLab: `glab mr create --source-branch "$head" --target-branch "$base" --fill`
5. CLI absent / not authed / wrong host / no access → generate the compare URL to open in a browser:
   - GitHub: `https://$host/$path/compare/$base...$head?expand=1`
   - GitLab: `https://$host/$path/-/merge_requests/new?merge_request[source_branch]=$head&merge_request[target_branch]=$base`
   Print the URL.

Always end the promise turn with: base ← head, plus the offered command (authed) or the compare URL (unauthed), so the user can act when they return.
```

## BLOCKED.md template

```markdown
# Blocked: <slice title>

**When:** <UTC date>, iteration <N>
**Blocked task:** <task # + action>

## What was tried
- <attempt 1 — what + verify result>
- <attempt 2 — what + verify result>

## Why it is blocked
<the failing verify output / error, root symptom>

## Opus diagnosis
**Verdict:** IMPOSSIBLE
**Rationale:** <Opus's reasoning>

## Suggested next step for the user
<what a human needs to decide / unblock — missing access, spec gap, external dep, etc.>
```

## RESUME.md extension for ralph slices

On top of the standard RESUME.md (see `orchestrator-templates.md`), a ralph slice MUST carry:

```markdown
## Ralph state
- Contract: CONTRACT.md (this slice)
- Loop status: active | blocked | done

## Task progress (with attempt counters)
- [x] 001 done — <result, file:line> — attempts: 0
- [ ] 002 pending — attempts: 1   (1 failed verify; escalate at 2)
```

The `attempts:` counter is the concrete stuck-detection signal that drives §6 — not a vibe. Each iteration updates it.
```

## PROMPT.md template

The fixed loop prompt, fed back verbatim every iteration via `"$(cat …/PROMPT.md)"`. Keep it self-contained — all changing state is in CONTRACT.md (fixed) + RESUME.md (progress), never here.

```markdown
Autonomous execution of the ralph contract at plans/<scope>/<nnn>-<slice>/.

Every iteration, in order:
1. Read CONTRACT.md and RESUME.md in that folder first.
2. Run §0 preflight. Any check fails → stop, print error, do NOT proceed.
3. Execute the next unchecked §4 task. Delegate code writes per the CLAUDE.md orchestrator/worker split.
4. Run the task's verify command; update RESUME.md (`attempts:`, done check) per §8.
5. Honor §5 guardrails, §6 escalation (Opus on opus-tagged tasks or attempts >= escalate_after), §7 abort.

Emit the §3 completion promise `<promise>ALL ACCEPTANCE MET</promise>` ONLY after the gate is green: every §2 verify command run, all exit 0, output pasted. NEVER to escape the loop, NEVER on self-assessment.

On the promise turn, also run §11: push the feature branch, then surface the PR/MR offer (gh/glab if authed) or the compare URL (if not) targeting the base branch.
```

Adjust the slice path + promise phrase to match this contract (phrase must equal §3 and `--completion-promise` exactly).

## Authoring checklist (Opus, before emitting)

- §0 sanity check has real paths filled in (no `<scope>` placeholders left). Project-specific prereq row filled or removed.
- State file path in §7 abort is `.claude/.ralph-loop.local.md` (leading dot on filename) — matches what ralph-loop plugin actually creates.
- Promise tag format is `<promise>PHRASE</promise>` exactly — stop hook pattern-matches on this literal tag.
- Promise phrase in §3 == the `--completion-promise` value in §10, character-for-character (case + spaces).
- Every "done when" is a command that exits 0 — no prose acceptance.
- §2 full gate command actually runs the whole suite.
- Hard / security / migration / public-API tasks tagged `review: opus`.
- Guardrails name concrete do-NOT-touch paths.
- `--max-iterations` set in §10.
- §10 start command uses the plugin form `/ralph-loop:ralph-loop "$(cat …/PROMPT.md)"` (repeated `plugin:command`), NOT `/ralph-loop`.
- `PROMPT.md` emitted in the slice folder, self-contained, promise phrase matches §3 + §10.
- Header **Base branch** filled with the real branch ralph-plan ran on (no placeholder) — §11 PR/MR targets it.
- §11 present: provider detection + authed CLI offer (`gh`/`glab`) + unauthed compare-URL fallback.
- No TBD / placeholder / contradiction left.
