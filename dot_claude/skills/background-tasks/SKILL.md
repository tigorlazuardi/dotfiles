---
name: background-tasks
description: Run long-running BASH commands in the background instead of blocking the turn, so the agent keeps working and gets the output back when the command finishes (success OR failure). Use whenever about to run a shell command that takes a while — test suites, builds, deploy/release pipelines, waiting on CI, installing dependencies, data migrations, benchmarks, downloads, or any bash command expected to run more than ~30 seconds. Also triggers on "run this in the background", "kick off the pipeline", "wait for CI", "don't block on this". This is for BACKGROUND BASH (the Bash tool's run_in_background); work that needs LLM reasoning (writing code, review, research) goes to a background subagent (Task tool) instead, not a background bash command.
---

# Background bash — run_in_background, don't active-wait

Long-running shell work should NOT block the conversation. The `Bash` tool takes `run_in_background: true`: start a bash command in the background, keep doing other work, and read its output when it finishes — **success OR error**. Active-waiting (running a blocking command and staring at it, or sleeping in a loop) wastes the turn and freezes the agent. Background it instead.

## One line that matters most

`Bash(run_in_background: true)` runs a **bash command** in the background. Work that needs **LLM reasoning** (writing code, reviewing a diff, research) does NOT go through background bash — that goes to a **background subagent** (`Task` tool). Don't confuse the two: background bash = shell process; background subagent = an LLM doing reasoning.

## Tier 1 — auto-background (just do it, no asking)

When you're about to run any of these as a bash command, background it by default:

- **Test suites** — `pytest`, `npm test`, `go test ./...`, `cargo test`, `vitest run`
- **Builds** — `npm run build`, `cargo build --release`, `make`, `docker build`
- **Deploy / release pipelines** — `make deploy`, `terraform apply`, release scripts, publish
- **Waiting on CI** — `gh run watch`, polling a remote job to finish
- **Dependency installs** — `npm install`, `pip install -r`, `cargo fetch`, `bun install`
- **Data migrations** — `alembic upgrade`, `prisma migrate`, schema/data backfills
- **Benchmarks / long loops** — perf runs, load tests, long data processing
- **Downloads / fetches** — large `curl`/`wget`/`rsync`, dataset pulls

These are long-running by nature. Background them and continue useful work; read the output when it completes so you reason about success vs failure.

## Tier 2 — fallback by duration

If a bash command doesn't fit a Tier-1 category but you expect it to run **more than ~30 seconds**, background it too, so the agent stays responsive and the user can keep talking to it while it runs.

## When NOT to background

- **Interactive commands** — anything that prompts (`(y/n)`, `Press any key`, a REPL, an editor, a login flow). Background jobs can't answer prompts and will stall. Run these in the foreground, or make them non-interactive first (flags like `-y`, `--non-interactive`, piped input).
- **You need the result for the very next step** — if the next action literally cannot proceed without this command's output (e.g. read a value, then branch on it), and it's quick, just run it foreground. Backgrounding only helps when there's other work to do meanwhile.
- **Trivially fast commands** — `ls`, `cat`, a quick `grep`, a one-line script. Foreground; the overhead isn't worth it.
- **Destructive / irreversible without confirmation** — backgrounding does not bypass the safety rule. Confirm `rm -rf`, force-push, DB drop/migrate, etc. with the user FIRST, then background the actual run if it's long.

## How to use it

Run with `run_in_background: true`, then retrieve output with `BashOutput` (by the returned shell id). Kill a job you no longer want with `KillShell`.

### After it's running

- **Do other work.** Do NOT poll or `sleep` waiting — check back when you have a reason to. Polling defeats the purpose.
- Inspect output with `BashOutput`, then report completion, failure (quote the error + exit code), or next step.
- `KillShell` to stop a job the user no longer wants.

### Honest reporting

When a backgrounded command finishes, report the truth: exit 0 → say it passed; non-zero → say it failed and quote the relevant output. Don't claim success without checking the exit code and output.
