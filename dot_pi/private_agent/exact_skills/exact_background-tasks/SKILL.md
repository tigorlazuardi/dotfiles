---
name: background-tasks
description: Run long-running BASH commands in the background with pi-patty-bg-tasks (bash/bash_bg/jobs/monitor) instead of blocking the turn, so the agent keeps working and gets woken on completion (success OR failure). Use whenever about to run a shell command that takes a while — test suites, builds, deploy/release pipelines, waiting on CI, installing dependencies, data migrations, benchmarks, downloads, or any bash command expected to run more than ~15 seconds. Also triggers on "run this in the background", "kick off the pipeline", "wait for CI", "don't block on this". This is for BACKGROUND BASH; work that needs LLM reasoning (writing code, review, research) goes to a background worker subagent instead.
---

# Background bash — pi-patty-bg-tasks, don't active-wait

Long-running shell work should NOT block the conversation. The plugin `pi-patty-bg-tasks` runs a bash command in the background, keeps the agent free, and **surfaces completion — success OR error**. Active-waiting (running a blocking command and staring at it, or `sleep`-looping) wastes the turn and freezes the agent. Background it instead.

## Completion is turn-boundary, NOT idle auto-wake

How patty delivers a finished job (this differs from a naive auto-trigger, and is deliberate):
- **Agent mid-turn when the job finishes** → the notice is buffered and flushed at the next turn boundary as a `followUp`, so the agent sees it and reacts within that turn. Effective wake. ✅
- **Agent idle when the job finishes** → only a visual `ctx.ui.notify` to the user. The agent is **NOT** woken into a new turn (patty sets `triggerTurn: false` on purpose, to avoid spinning autonomous loops when the user isn't engaged). The agent picks it up on the **user's next message**.

So: do not assume a finished background job auto-starts a fresh agent turn from idle. It integrates into the next turn that happens. If you truly need autonomous continue-on-finish from idle, patty is not the tool (no env to flip this).

Output is captured to `/tmp/pi-bg/<id>.log` — **not** the project. No `.pi/tasks/` pollution. Stale logs are swept after 24h.

## One line that matters most

This runs a **bash command** in the background. Work that needs **LLM reasoning** (writing code, reviewing a diff, research) does NOT go here — that goes to a **background worker subagent** (`subagent` tool with `async: true`, plugin `pi-subagents`). Don't confuse the two: background bash = shell process; worker subagent = an LLM doing reasoning. (Patty's own `agent_bg` spawns a detached `pi -p` coworker — that's a full pi process, still not the same as a pinned worker subagent.)

## Auto-background at 15s (mandatory user convention)

The user wants any bash command that could run **more than ~15 seconds** to auto-background. Patty's built-in auto-bg timeout defaults to **120s** and is **not** env-configurable, so enforce 15s at call time:

- Pass **`timeout: 15`** on every `bash` / `bash_bg` call whose command could plausibly exceed 15s.
- When in doubt about duration, set `timeout: 15` — err toward backgrounding.
- Skip it only when you deliberately want the command foreground AND expect it to finish fast (a quick `git status`, a small `grep`, reading a value the very next step needs).

At the timeout the command is auto-backgrounded and the agent gets a `job_decide` prompt (`keep` / `kill` / `check`). Or press **Ctrl+B** to background a running foreground command immediately.

## Tools

- **`bash`** — built-in bash, overridden. Runs foreground but auto-backgrounds past its `timeout` (set `timeout: 15`). Finishes in <2s → returns immediately.
- **`bash_bg`** — start in the background up front (`command`, optional `name`, `timeout`, `notify`). Use when you already know it's long.
- **`jobs`** — mission control: `list`, `output` (log tail of one job), `kill`, `attach` (wait for finish then return output), `search` (regex across ALL job logs), `cleanup`, `stats`.
- **`job_decide`** — answer an auto-backgrounded command: `keep` / `kill` / `check`.
- **`monitor`** — turn a process into a **live event stream**: each stdout line (or WebSocket frame) becomes one notification into the agent's turn. Use for "tell me each time X happens" (error lines in a log, CI checks landing). `persistent: true` runs the whole session; stop with `jobs action='kill'`. Line-buffered — use `grep --line-buffered` / `awk fflush()`, never `head`.
- **`agent_bg`** — detached `pi -p` coworker with a continuity prompt; streams progress back.

## Tier 1 — background by default (just do it, no asking)

When about to run any of these, background with `timeout: 15`:

- **Test suites** — `pytest`, `npm test`, `go test ./...`, `cargo test`, `vitest run`
- **Builds** — `npm run build`, `cargo build --release`, `make`, `docker build`
- **Deploy / release pipelines** — `make deploy`, `terraform apply`, release scripts, publish
- **Waiting on CI** — `gh run watch`, polling a remote job
- **Dependency installs** — `npm install`, `pip install -r`, `cargo fetch`, `bun install`
- **Data migrations** — `alembic upgrade`, `prisma migrate`, backfills
- **Benchmarks / long loops** — perf runs, load tests, long data processing
- **Downloads / fetches** — large `curl`/`wget`/`rsync`, dataset pulls

## Tier 2 — fallback by duration

Any bash command expected to run **more than ~15 seconds** → background it too (`timeout: 15`), so the agent stays responsive.

## When NOT to background

- **Interactive commands** — anything that prompts (`(y/n)`, a REPL, an editor, a login). Background jobs can't answer and stall; patty's stall detection warns, but avoid it. Run foreground or make non-interactive (`-y`, `--non-interactive`, piped input).
- **You need the output for the very next step** — if the next action literally can't proceed without this command's output and it's quick, run foreground.
- **Trivially fast commands** — `ls`, `cat`, a quick `grep`, a one-liner. Foreground.
- **Destructive / irreversible without confirmation** — backgrounding does not bypass the safety rule. Confirm `rm -rf`, force-push, DB drop/migrate FIRST (see AGENTS.md Safety), then background the run if it's long.

## How to use it

```
# auto-background a possibly-long command at 15s
bash({ command: "npm test", timeout: 15 })

# start in the background up front
bash_bg({ command: "npm run dev", name: "devserver", timeout: 15 })

# check on things
jobs({ action: "list" })
jobs({ action: "output", jobId: "..." })
jobs({ action: "search", pattern: "error|warning" })
```

### After it's running

- **Do other work.** Do NOT poll or `sleep` — completion is surfaced to you (buffered mid-turn, flushed at the turn boundary; if idle, it waits for the user's next message — see "Completion is turn-boundary" above).
- React to the notification when it lands: inspect with `jobs action=list` / `jobs action=output`, then report completion, failure (quote the error), or next step.
- `jobs action=kill` (or Ctrl+Shift+X for the most recent) to stop a job the user no longer wants.

### Honest reporting

When a backgrounded command finishes, report the truth: exit 0 → passed; non-zero → failed, quote the relevant output from `jobs action=output`. Don't claim success without checking status and logs.
