# herdr deployment reference (phase 2)

Deployment reference for phase 2 of `loop-agent-setup` — daemonizing a loop contract under
herdr + systemd so it survives crashes, rate-limits, and reboots. Read this only after phase 1
(the contract file) exists; this file is about running it unattended, not writing it.

## Mental model

Four layers, each with one job:

1. **`herdr server`** — one persistent background daemon (like tmux's server). Hosts all
   workspaces/panes. A systemd `Type=simple` base unit; everything else `Requires`/`After`/
   `PartOf` it so a server restart cascades a full rebuild.
2. **Keep-alive unit (per agent)** — a systemd `Type=simple` service running a small script
   that *ensures the workspace + agent exist* and then *blocks while the agent's pane lives*,
   exiting when it dies so `Restart=always` recreates it. This is what makes it self-healing.
3. **Pane entrypoint** — the command the workspace runs. It loads project env (direnv), launches
   `claude` interactively with `--remote-control`, and a background injector types the `/loop`
   command once claude is ready.
4. **Support daemons** — a rate-limit auto-continue monitor, and an idle-gated renewal timer
   that recycles the session before the `/loop` cron's ~7-day expiry.

The canonical, working implementation lives in the user's dotfiles (search the repo for
`herdr-workspace.sh`, `xp-jira-loop-pane.sh`, `xp-jira-loop-renew.sh`, and
`dot_config/systemd/user/herdr-*.service`). Read those as reference; this file explains the
decisions and the traps.

## herdr CLI facts you must build on (probed, v0.7.x)

These are non-negotiable shapes — guessing them wastes a session:

- Socket helpers **emit JSON by default**. There is **no `--json` flag** on `workspace` / `pane`
  subcommands (passing it prints usage). Parse stdout as JSON.
- `herdr workspace create --cwd DIR --label L --env K=V --no-focus` returns
  `.result.workspace.workspace_id` and the auto-spawned root pane at `.result.root_pane.pane_id`.
  **`workspace create` always makes a NEW workspace** — guard idempotency by label yourself.
- `herdr workspace list` → `.result.workspaces[] | {workspace_id, label, pane_count}`.
- `herdr pane list --workspace WSID` → `.result.panes[].pane_id`.
- `herdr pane run PANE "<cmd>"` types the command + Enter into the pane's shell.
  `herdr pane send-text PANE "<text>"` / `herdr pane send-keys PANE Enter` for injection.
- `herdr agent list` → `.result.agents[] | {workspace_id, agent_status, name}`. **`name` is
  usually `null`** for auto-detected agents — key on `workspace_id`, never on name.
- `herdr wait agent-status PANE --status idle --timeout MS` blocks until herdr's agent detection
  reports the status. `herdr wait output PANE --match REGEX [--regex]` matches pane text.
- herdr **injects env into every pane**: `HERDR_ENV=1`, `HERDR_PANE_ID`, `HERDR_LABEL`,
  `HERDR_WORKSPACE_ID`, `HERDR_SOCKET_PATH`. The entrypoint reads its own pane id and label
  from these — no `pane current` call needed.
- **Liveness:** herdr **closes a pane the instant its foreground process exits**, so
  `herdr pane get PANE` starts failing — that is the keep-alive's block predicate. The
  *workspace* persists (empty) after the pane closes.
- herdr **auto-detects claude** as an agent ~4s after launch (`agent_status` goes `idle`).

## The keep-alive pattern

Contract: `keep-alive.sh <label> <cwd> <launch-path>`. The launcher is exec'd in the root pane
with **no args** — it reads its label from `$HERDR_LABEL` (injected via `--env`).

```
1. unset HERDR_ENV HERDR_PANE_ID …          # never inherit a parent pane's identity
2. until `herdr workspace list` works: sleep # wait for the server socket (unit order ≠ socket ready)
3. ADOPT: for each workspace with this label, adopt it ONLY if `herdr agent list` shows a
   detected agent in it (pane_count>0 is NOT enough — a bare login shell has no agent);
   close every other same-label workspace (dedupe).
4. CREATE (if none adopted):
     workspace create --cwd CWD --label LABEL --env HERDR_LABEL="LABEL" --no-focus
     PANE = .result.root_pane.pane_id
     wait output PANE --match '<shell prompt>' (best-effort) ; pane run PANE "exec \"$LAUNCH\""
     HEALTH GATE: poll ~60s for `herdr agent list` to show an agent in this workspace; if the
       pane closes first → clean restart; if it stays a bare shell with no agent → close + exit 1
       (systemd retries). This is what stops an interrupted create from stranding a dead shell.
5. BLOCK: while `herdr pane get PANE` succeeds: sleep 5   # exit 0 when it closes → systemd recreates
```

### Why the health gate matters
Adopting on `pane_count>0` cannot distinguish a running claude from an idle login shell. If a
`pane run` fails or the unit is killed mid-create, you'd otherwise block forever on a shell that
never restarts. Gate "healthy" on herdr *detecting an agent*, and check `pane run`'s exit.

## The loop pane entrypoint

The entrypoint injects the **one-liner** (see SKILL.md "Injection design"), not a flattened
contract file — `/loop <interval> Read loop/<name>-LOOP.md and execute one iteration per its
contract.` This obsoletes the old newline-flattening concern (there's no multi-line PROMPT_FILE
to flatten anymore), but the double-Enter paste gotcha below still applies to the one-liner too.

```
SESSION="${HERDR_LABEL:-<fallback>}"     # label comes from --env; fallback only for manual runs
PANE="${HERDR_PANE_ID:-}"                # own pane id, injected by herdr
load direnv (allow-probe, graceful)
ONE_LINER="/loop ${INTERVAL} Read loop/${NAME}-LOOP.md and execute one iteration per its contract."
# persist identity + birth time for the renew guard (fresh-launch only):
write $STATE_DIR/{pane_id,workspace_id,started_at}
# background injector:
( herdr wait agent-status "$PANE" --status idle --timeout 180000   # readiness = agent idle
  sleep 2                                                          # let the input box settle
  herdr pane send-text "$PANE" "$ONE_LINER"
  sleep 2                                                          # let the bracketed paste settle
  herdr pane send-keys "$PANE" Enter                              # 1st Enter can finalize the paste
  sleep 1
  herdr pane send-keys "$PANE" Enter                              # 2nd Enter actually submits
) &
exec claude --model sonnet --remote-control "$SESSION"           # dispatcher runs on sonnet
```

## Gotchas (the expensive lessons — read these before coding)

- **Readiness = `agent-status idle`, NOT a text match.** Matching pane text for "Welcome to
  Claude" / "for shortcuts" breaks: resumed `--remote-control` sessions skip the welcome banner,
  and prompt-glyph matches (`❯`, `▐`) hit the *stale login-shell prompt already in the history
  buffer* (`herdr wait output` reads `recent_unwrapped` = history), firing the inject before
  claude is ready → keystrokes lost. `wait agent-status idle` tracks whatever the TUI actually
  renders. (If you must use text, match `remote-control is active` — claude-specific, not a shell
  lookalike.)
- **A long `/loop` pastes as a collapsed `[Pasted text]` block; ONE Enter finalizes the paste
  instead of submitting.** Send **Enter twice** with a short settle. Symptom: `/loop` sits armed
  in the input, agent stays `idle`, loop never starts. Still applies with the one-liner injection
  — it's the bracketed-paste behavior, not the payload length, that triggers this.
- **Pass labels via `--env HERDR_LABEL`, never as a typed shell arg.** Labels with spaces (e.g.
  "Dashboard Jira Loop") then survive regardless of the pane shell (zsh/fish) — no quoting hell.
- **Idempotency is by label + agent-detection**, not by workspace existence. `workspace create`
  always makes a new one; without a dedupe/adopt pass you accumulate duplicate same-label
  workspaces (and, on the same repo/board, *duplicate dispatchers racing to claim tasks*).
- **Stopping a keep-alive unit does NOT stop the agent** — panes run in the `herdr-server`
  cgroup, not the unit's. To actually kill an agent, `herdr workspace close <id>` or stop the
  server. (Different from zellij's `ExecStop=delete-session`.)
- **Model routing:** the loop dispatcher runs on **sonnet** (`--model sonnet`, cheap triage) and
  the contract hands heavy work to an **opus** orchestrator subagent per its escalation section.
  Pin the model explicitly so it doesn't inherit the user's default (which may be opus).
- **Renewal:** `/loop`'s underlying schedule expires (~7d). The entrypoint writes `started_at`;
  an hourly, idle-gated timer closes the workspace once past ~6d AND idle, and `Restart=always`
  recreates a fresh session (re-arming the cron). The renew guard reads `started_at` +
  `workspace_id` from `$STATE_DIR`, so the entrypoint MUST write them on fresh launch.

## systemd wiring (user units)

```ini
# herdr-server.service (base)
[Service]
Type=simple
ExecStart=%h/.local/bin/herdr server
ExecStop=%h/.local/bin/herdr server stop
Restart=always

# <agent>.service (per loop agent)
[Unit]
Requires=herdr-server.service
After=herdr-server.service
PartOf=herdr-server.service          # server restart → rebuild this workspace
[Service]
Type=simple
Environment=HOME=%h
Environment=PATH=%h/.local/bin:%h/.bun/bin:/usr/local/bin:/usr/bin:/bin
Environment=CLAUDE_CONFIG_DIR=%h/.claude
ExecStart=%h/.local/bin/keep-alive.sh "Agent Label" %h/projects/repo %h/.local/bin/loop-entrypoint.sh
Restart=always
RestartSec=3
[Install]
WantedBy=default.target
```

Plus optional support units: a rate-limit auto-continue daemon (e.g. `herdr-claude-retry`, a
bun package that watches herdr agents and resumes them after a limit reset), and the renewal
`.service` + `.timer`.

## Setup checklist

1. Install herdr; confirm `herdr server` runs headless and `herdr status server` reports ready.
2. Write `keep-alive.sh` (the pattern above) and a per-agent `loop-entrypoint.sh`.
3. Confirm the loop contract file (`loop/<name>-LOOP.md`, written in phase 1) exists in the
   target repo — the entrypoint's one-liner references it by path, it doesn't embed it.
4. Create `herdr-server.service` + one keep-alive unit per agent (`Requires`/`After`/`PartOf`).
5. `chezmoi apply` (or deploy the files), then
   `systemctl --user daemon-reload && systemctl --user enable --now herdr-server <agent>…`.
6. Validate: `herdr workspace list` shows the labels, `herdr agent list` shows detected agents,
   and each unit's `NRestarts` stops climbing (health gate settled). Attach with `herdr`.
7. If a `/loop` shows `[Pasted text]` unsubmitted → your injector needs the double-Enter.

## Cutover / self-hosting caveat

If you run this setup *from inside* one of the sessions being migrated (e.g. a dotfiles agent),
a destructive `systemctl disable --now <that-unit>` will kill your own session mid-operation.
Run such cutovers as a **detached systemd transient unit** so they outlive you:
`systemd-run --user --unit=cutover --collect bash cutover.sh`, logging to a file. Order it to
bring the herdr stack up and confirm the server is healthy *before* disabling the old sessions,
so a failure aborts with the old stack intact.

## macOS: launchd alternative to systemd

macOS has no systemd. Default to manual attended `/loop` on macOS (see SKILL.md phase 2). Only
reach for launchd if the machine is genuinely always-on (Mac mini/Studio, lid open, on AC power).

Caveats, all real:

- **Sleep kills loops.** Lid close or idle sleep suspends everything, including the herdr server
  and any running loop. `caffeinate -s` (while on AC) or `pmset` power-assertions are partial
  mitigations, not a fix — they don't survive a manual lid close on a laptop.
- **LaunchAgents die at logout** and need an active GUI login session (they run in
  `gui/$UID`, not system-wide). A machine that auto-logs-out or locks past a screensaver policy
  boundary can kill the agent depending on config.
- **No systemd-style `Requires`/`After`/`PartOf` ordering.** launchd has no native
  cross-unit dependency graph for user agents. Cover this in the keep-alive script itself with a
  wait-for-socket retry loop (same as `until herdr workspace list works: sleep` in the systemd
  version) instead of relying on launchd to sequence server-then-agent startup.
- **`launchctl bootstrap gui/$UID <plist>` is the modern load syntax.** `launchctl load` is
  deprecated (still works on some macOS versions but prints warnings and has known bugs around
  re-loading). Use `bootstrap`/`bootout` for load/unload, `enable`/`disable` for the persisted
  on/off bit.
- **PATH must be set explicitly** via an `EnvironmentVariables` dict in the plist — launchd
  agents do not inherit a login shell's PATH, so `herdr`/`claude`/`direnv` will silently 404
  unless you hardcode absolute paths or set PATH yourself.

Minimal plist shape (adapt paths):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.user.loopagent.myagent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/you/.local/bin/keep-alive.sh</string>
    <string>Agent Label</string>
    <string>/Users/you/projects/repo</string>
    <string>/Users/you/.local/bin/loop-entrypoint.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/Users/you/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>HOME</key><string>/Users/you</string>
    <key>CLAUDE_CONFIG_DIR</key><string>/Users/you/.claude</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/loopagent-myagent.log</string>
  <key>StandardErrorPath</key><string>/tmp/loopagent-myagent.err</string>
</dict>
</plist>
```

Load with `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.user.loopagent.myagent.plist`.

### Laptop but the loop must be reliable

Be honest with the user: don't fight launchd's sleep/logout semantics on a laptop for a loop
that must run 24/7. Deploy the loop on a small Linux VPS instead (any provider — the systemd
stack above works unmodified) and treat the local machine as attended-only.
