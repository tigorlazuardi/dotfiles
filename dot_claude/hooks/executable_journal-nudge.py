#!/usr/bin/env python3
"""journal-nudge — SessionStart/Stop hook.

Forces the dev-journal offer that CLAUDE.md asks for but the model forgets.
Deterministic trigger, model judgment: when the session has produced at least
one new git commit, block Stop ONCE with an instruction to evaluate the
session for a notable moment and offer journaling. The main model judges with
full conversation context; this hook only pokes.

SessionStart records the baseline HEAD per (session, repo). Stop compares.
Fail-open: any error -> exit 0.
"""
import json
import os
import subprocess
import sys

CLAUDE_DIR = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.expanduser("~/.claude")
STATE_DIR = os.path.join(CLAUDE_DIR, ".cache", "journal-nudge")

NUDGE = (
    "DEV-JOURNAL CHECK (one-time, automated): this session created new git "
    "commit(s). Evaluate the conversation: did a notable dev moment happen "
    "(feature shipped, fix with interesting root cause, design decision, "
    "incident handled, new tech first used, milestone)? If YES: load the "
    "dev-journal skill and offer one line — \"Journal ini?\" — then finish "
    "your turn. If NO (routine/mechanical work only): just finish your turn. "
    "Do not re-evaluate later; this fires once per session."
)


def git_head(cwd):
    try:
        out = subprocess.run(
            ["git", "-C", cwd, "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=5,
        )
        return out.stdout.strip() if out.returncode == 0 else None
    except Exception:
        return None


def repo_root(cwd):
    try:
        out = subprocess.run(
            ["git", "-C", cwd, "rev-parse", "--show-toplevel"],
            capture_output=True, text=True, timeout=5,
        )
        return out.stdout.strip() if out.returncode == 0 else None
    except Exception:
        return None


def main():
    try:
        hook_input = json.load(sys.stdin)
    except Exception:
        hook_input = {}
    event = hook_input.get("hook_event_name", "Stop")
    cwd = hook_input.get("cwd") or os.getcwd()
    session = "".join(c for c in hook_input.get("session_id", "unknown") if c.isalnum() or c == "-")

    root = repo_root(cwd)
    head = git_head(cwd)
    if not root or not head:
        return  # not a git repo

    os.makedirs(STATE_DIR, exist_ok=True)
    state_path = os.path.join(STATE_DIR, f"{session}.state")
    try:
        with open(state_path) as f:
            state = json.load(f)
    except Exception:
        state = {"baselines": {}, "nudged": False}

    baselines = state.setdefault("baselines", {})

    if event == "SessionStart" or root not in baselines:
        # record baseline for this repo (first sight of it in this session)
        baselines[root] = head
        with open(state_path, "w") as f:
            json.dump(state, f)
        return

    if state.get("nudged"):
        return
    if head == baselines[root]:
        return  # no new commits yet

    state["nudged"] = True
    with open(state_path, "w") as f:
        json.dump(state, f)
    print(json.dumps({"decision": "block", "reason": NUDGE}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(0)  # fail open
