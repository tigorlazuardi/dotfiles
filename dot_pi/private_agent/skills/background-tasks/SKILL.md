---
name: background-tasks
description: Run long-running BASH commands in the background with bg_run instead of blocking the turn, so the agent keeps working and gets woken on completion (success OR failure) with the exit code. Use whenever about to run a shell command that takes a while — test suites, builds, deploy/release pipelines, waiting on CI, installing dependencies, data migrations, benchmarks, downloads, or any bash command expected to run more than ~30 seconds. Also triggers on "run this in the background", "kick off the pipeline", "wait for CI", "don't block on this". This is for BACKGROUND BASH (bg_run); work that needs LLM reasoning (writing code, review, research) goes to a background worker subagent instead, not bg_run.
---

# Background bash — use bg_run, don't active-wait

Long-running shell work should NOT block the conversation. Pi has `bg_run` (plugin `pi-background-tasks`): start a named bash command in the background, keep doing other work, and get **woken on completion — success OR error — with the exit code**. Active-waiting (running a blocking command and staring at it, or sleeping in a loop) wastes the turn and freezes the agent. Background it instead.

## One line that matters most

`bg_run` runs a **bash command** in the background. Work that needs **LLM reasoning** (writing code, reviewing a diff, research) does NOT go through `bg_run` — that goes to a **background worker subagent** (`Agent` tool, `run_in_background: true`, plugin `@tintinweb/pi-subagents`). Don't confuse the two: `bg_run` = shell process; worker subagent = an LLM doing reasoning.

## Tier 1 — auto-background (just do it, no asking)

When you're about to run any of these as a bash command, reach for `bg_run` by default:

- **Test suites** — `pytest`, `npm test`, `go test ./...`, `cargo test`, `vitest run`
- **Builds** — `npm run build`, `cargo build --release`, `make`, `docker build`
- **Deploy / release pipelines** — `make deploy`, `terraform apply`, release scripts, publish
- **Waiting on CI** — `gh run watch`, polling a remote job to finish
- **Dependency installs** — `npm install`, `pip install -r`, `cargo fetch`, `bun install`
- **Data migrations** — `alembic upgrade`, `prisma migrate`, schema/data backfills
- **Benchmarks / long loops** — perf runs, load tests, long data processing
- **Downloads / fetches** — large `curl`/`wget`/`rsync`, dataset pulls

These are long-running by nature. Background them and continue useful work; the wakeup brings the exit code back so you reason about success vs failure.

## Tier 2 — fallback by duration

If a bash command doesn't fit a Tier-1 category but you expect it to run **more than ~30 seconds**, background it too, so the agent stays responsive and the user can keep talking to it while it runs.

## When NOT to background

- **Interactive commands** — anything that prompts (`(y/n)`, `Press any key`, a REPL, an editor, a login flow). Background jobs can't answer prompts and will stall. Run these in the foreground, or make them non-interactive first (flags like `-y`, `--non-interactive`, piped input).
- **You need the result for the very next step** — if the next action literally cannot proceed without this command's output (e.g. read a value, then branch on it), and it's quick, just run it foreground. Backgrounding only helps when there's other work to do meanwhile.
- **Trivially fast commands** — `ls`, `cat`, a quick `grep`, a one-line script. Foreground; the overhead isn't worth it.
- **Destructive / irreversible without confirmation** — backgrounding does not bypass the safety rule. Confirm `rm -rf`, force-push, DB drop/migrate, etc. with the user FIRST (see AGENTS.md Safety), then background the actual run if it's long.

## How to use it

```
bg_run({ name: "test suite", command: "npm test", isAgent: false })
```

- **`name`** — short 2-6 word label for the footer dock (not the raw command).
- **`isAgent`** — almost always `false`. Set `true` ONLY when the bash command itself launches an LLM/agent process (`pi -p ...`, `pi --mode json ...`) so the plugin can wrap it and read child token/model telemetry. A normal test/build/deploy is `isAgent: false`.
- Completion **triggers a follow-up turn by default** (`triggerOnCompletion: true`) — that's the wakeup. You'll get a `<background-task-notification>` with `status` + `exit-code` + output file.

### After it's running

- **Do other work.** Do NOT poll or `sleep` waiting — the wakeup comes to you. Polling defeats the purpose.
- React to the notification when it arrives: inspect with `bg_status` / `bg_logs`, then report completion, failure (quote the error + exit code), or next step.
- `bg_kill` to stop a job the user no longer wants.

### Honest reporting

When a backgrounded command finishes, report the truth: exit 0 → say it passed; non-zero → say it failed and quote the relevant output. Don't claim success without checking the exit code and logs.
