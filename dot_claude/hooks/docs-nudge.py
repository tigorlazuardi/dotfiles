#!/usr/bin/env python3
"""docs-nudge — SessionStart/Stop hook.

Diff-aware "update the design docs" nudge for repos with an Astro/Starlight
docs site (astro-docs-setup standard). Blocks Stop ONCE per session when the
session changed source files but touched nothing under the site's
src/content/ — the model then judges with full context whether a design doc
actually needs updating; this hook only pokes.

Silent when: no git repo, no docs site (docs/ or docs-site/ with an astro
config), no changes, docs content already touched, or already nudged.

SessionStart records the baseline HEAD per (session, repo). Stop compares
baseline..HEAD plus the working tree. Fail-open: any error -> exit 0.
"""
import json
import os
import subprocess
import sys

CLAUDE_DIR = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.expanduser("~/.claude")
STATE_DIR = os.path.join(CLAUDE_DIR, ".cache", "docs-nudge")

SITE_DIRS = ("docs", "docs-site")
ASTRO_CONFIGS = ("astro.config.mjs", "astro.config.ts", "astro.config.js")

NUDGE = (
    "DOCS CHECK (one-time, automated): this session changed source files but "
    "nothing under the docs site's src/content/. Evaluate the conversation: "
    "did the work make or change a design decision that belongs in a "
    "published design doc (docs/src/content/docs/design/)? If YES: load the "
    "astro-docs-authoring skill and offer one line — \"Update design docs?\" "
    "— then finish your turn. If NO (mechanical/routine change, no decision "
    "recorded): just finish your turn. Do not re-evaluate later; this fires "
    "once per session."
)


def run_git(cwd, *args):
    try:
        out = subprocess.run(
            ["git", "-C", cwd, *args],
            capture_output=True, text=True, timeout=5,
        )
        return out.stdout.strip() if out.returncode == 0 else None
    except Exception:
        return None


def find_site_dir(root):
    """Return repo-relative site dir ('docs' or 'docs-site') or None."""
    for d in SITE_DIRS:
        for cfg in ASTRO_CONFIGS:
            if os.path.isfile(os.path.join(root, d, cfg)):
                return d
    return None


def changed_files(root, baseline):
    """Repo-relative paths changed since baseline commit + working tree."""
    files = set()
    if baseline:
        diff = run_git(root, "diff", "--name-only", f"{baseline}..HEAD")
        if diff:
            files.update(diff.splitlines())
    status = run_git(root, "status", "--porcelain", "-uall")
    if status:
        for line in status.splitlines():
            path = line[3:]
            if " -> " in path:
                path = path.split(" -> ", 1)[1]
            files.add(path.strip().strip('"'))
    return {f for f in files if f}


def main():
    try:
        hook_input = json.load(sys.stdin)
    except Exception:
        hook_input = {}
    event = hook_input.get("hook_event_name", "Stop")
    cwd = hook_input.get("cwd") or os.getcwd()
    session = "".join(c for c in hook_input.get("session_id", "unknown") if c.isalnum() or c == "-")

    root = run_git(cwd, "rev-parse", "--show-toplevel")
    if not root:
        return  # not a git repo
    head = run_git(root, "rev-parse", "HEAD")

    os.makedirs(STATE_DIR, exist_ok=True)
    state_path = os.path.join(STATE_DIR, f"{session}.state")
    try:
        with open(state_path) as f:
            state = json.load(f)
    except Exception:
        state = {"baselines": {}, "nudged": False}

    baselines = state.setdefault("baselines", {})

    if event == "SessionStart" or root not in baselines:
        baselines[root] = head
        with open(state_path, "w") as f:
            json.dump(state, f)
        return

    if state.get("nudged"):
        return

    site = find_site_dir(root)
    if not site:
        return  # repo has no docs site — stay silent

    files = changed_files(root, baselines.get(root))
    content_prefix = f"{site}/src/content/"
    source_changed = any(not f.startswith(site + "/") for f in files)
    docs_touched = any(f.startswith(content_prefix) for f in files)

    if not source_changed or docs_touched:
        return

    state["nudged"] = True
    with open(state_path, "w") as f:
        json.dump(state, f)
    print(json.dumps({"decision": "block", "reason": NUDGE}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        sys.exit(0)  # fail open
