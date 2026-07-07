#!/usr/bin/env python3
"""usage-guard — Stop/SubagentStop hook.

Checks the Anthropic OAuth usage endpoint (same one /usage uses). Nudges the
main agent to run the usage-checkpoint skill: >= 80% amber (set wakeup timer),
>= 90% prep (early handover docs if many subagents in flight), >= 95% red
(stop + handover). Fires each phase at most once per window per session.

Throttling:
  - Shared response cache with adaptive TTL (usage is account-wide).
  - mkdir-based lock so concurrent hook invocations produce one fetch.
  - Per-session state file keyed on resets_at debounces the nudge itself.

Fail-open: any error -> exit 0, never blocks work.
"""
import json
import os
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone

CLAUDE_DIR = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.expanduser("~/.claude")
CACHE_DIR = os.path.join(CLAUDE_DIR, ".cache", "usage-guard")
CACHE = os.path.join(CACHE_DIR, "usage.json")
LOCK = os.path.join(CACHE_DIR, ".fetch-lock")
AMBER, PREP, RED = 80, 90, 95
USAGE_URL = "https://api.anthropic.com/api/oauth/usage"


def get_token():
    try:
        with open(os.path.join(CLAUDE_DIR, ".credentials.json")) as f:
            return json.load(f)["claudeAiOauth"]["accessToken"]
    except Exception:
        pass
    try:
        out = subprocess.run(
            ["security", "find-generic-password", "-s", "Claude Code-credentials", "-w"],
            capture_output=True, text=True, timeout=5,
        )
        return json.loads(out.stdout)["claudeAiOauth"]["accessToken"]
    except Exception:
        return None


def cache_ttl(data):
    if not data:
        return 0
    pct = max(data["five_hour"]["utilization"] or 0, data["seven_day"]["utilization"] or 0)
    if pct < 60:
        return 300
    if pct < AMBER:
        return 120
    return 30


def read_cache():
    try:
        with open(CACHE) as f:
            return json.load(f)
    except Exception:
        return None


def fetch_usage():
    token = get_token()
    if not token:
        return None
    req = urllib.request.Request(USAGE_URL, headers={
        "Authorization": f"Bearer {token}",
        "anthropic-beta": "oauth-2025-04-20",
    })
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.load(resp)
    if "five_hour" not in data:
        return None
    tmp = CACHE + f".tmp.{os.getpid()}"
    with open(tmp, "w") as f:
        json.dump(data, f)
    os.replace(tmp, CACHE)
    return data


def get_usage():
    data = read_cache()
    try:
        age = time.time() - os.path.getmtime(CACHE)
    except OSError:
        age = 1e9
    if age <= cache_ttl(data):
        return data
    # stale: one process fetches, others use the stale copy
    try:
        os.mkdir(LOCK)
    except OSError:
        return data  # someone else is fetching
    try:
        return fetch_usage() or data
    except Exception:
        return data
    finally:
        try:
            os.rmdir(LOCK)
        except OSError:
            pass


def seconds_until(iso_ts):
    try:
        delta = datetime.fromisoformat(iso_ts) - datetime.now(timezone.utc)
        return max(60, int(delta.total_seconds()))
    except Exception:
        return 3600


def main():
    try:
        hook_input = json.load(sys.stdin)
    except Exception:
        hook_input = {}
    event = hook_input.get("hook_event_name", "Stop")
    session = "".join(c for c in hook_input.get("session_id", "unknown") if c.isalnum() or c == "-")

    os.makedirs(CACHE_DIR, exist_ok=True)
    data = get_usage()
    if not data:
        return

    five = data["five_hour"]
    seven = data["seven_day"]
    five_pct = five["utilization"] or 0
    seven_pct = seven["utilization"] or 0
    pct = max(five_pct, seven_pct)
    if pct < AMBER:
        return

    weekly_bound = seven_pct >= five_pct
    window = "seven_day (weekly)" if weekly_bound else "five_hour"
    resets_at = seven["resets_at"] if weekly_bound else five["resets_at"]
    phase = "red" if pct >= RED else "prep" if pct >= PREP else "amber"

    state_path = os.path.join(CACHE_DIR, f"{session}.state")
    try:
        with open(state_path) as f:
            state = json.load(f)
    except Exception:
        state = {}
    if state.get("resets_at") != resets_at:
        state = {"resets_at": resets_at}  # new window -> reset debounce
    if state.get(f"{phase}_done"):
        return
    state[f"{phase}_done"] = True
    # a higher phase supersedes lower pending ones
    if phase in ("prep", "red"):
        state["amber_done"] = True
    if phase == "red":
        state["prep_done"] = True
    with open(state_path, "w") as f:
        json.dump(state, f)

    detail = (
        f"USAGE GUARD: {pct:.0f}% of the {window} rate-limit window used "
        f"(5h: {five_pct:.0f}%, weekly: {seven_pct:.0f}%). "
        f"Window resets at {resets_at} (~{seconds_until(resets_at) // 60} min). "
    )
    if phase == "amber":
        detail += (
            "Invoke the usage-checkpoint skill Phase 1 NOW: schedule the wakeup "
            "timer via ScheduleWakeup, mark amber state, then continue working."
        )
    elif phase == "prep":
        detail += (
            "usage-checkpoint PREP phase: if you have 2+ subagents in flight or "
            "expensive batches queued, write handover docs NOW while continuing "
            "to work — do not wait for 95%. Ensure the wakeup timer is set. "
            "Solo/light work: just keep the timer set and continue."
        )
    else:
        detail += (
            "Invoke the usage-checkpoint skill Phase 2 NOW: stop spawning new "
            "subagents, write/finalize handover docs, finalize the wakeup timer, "
            "then stop."
        )
    if weekly_bound:
        detail += (
            " NOTE: the WEEKLY window is binding — reset is days away, do not "
            "chain 5h wakeups; write handover docs and inform the user."
        )

    if event == "Stop":
        print(json.dumps({"decision": "block", "reason": detail}))
    else:  # SubagentStop and anything else: inject context, never block
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": event,
                "additionalContext": detail,
            }
        }))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(0)  # fail open
