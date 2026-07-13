---
name: check-usage
description: Check the current Claude Code / Claude AI OAuth usage limits (rate limit / quota status) for the logged-in account. Use when the user asks about their usage, rate limits, quota, or how much of their Claude plan they've used.
---

# Check Usage

Checks the caller's Claude.ai OAuth usage/limits by hitting the `api.anthropic.com/api/oauth/usage` endpoint with the locally stored OAuth access token.

## How it works

The OAuth access token is read from `$CLAUDE_CONFIG_DIR/.credentials.json` (defaults to `~/.claude/.credentials.json`) via `jq`, falling back to the macOS Keychain entry `"Claude Code-credentials"` if the file lookup fails. The token is then sent as a bearer token to the usage endpoint.

The result is cached at `$CLAUDE_CONFIG_DIR/cache/usage-limits.json` and the endpoint is hit at most once per **300 seconds** (`USAGE_CACHE_TTL`, in seconds). A fresh cache is served without any network call; only a stale/missing cache triggers a fetch. If a fetch fails but a stale cache exists, the stale copy is served. Set `USAGE_CACHE_TTL=0` to force a fresh fetch — do this if the user explicitly wants up-to-the-second numbers.

## Usage

Run the bundled script and report the result to the user:

```bash
bash scripts/check-usage.sh
```

The output is raw JSON from the usage endpoint — summarize the relevant fields (e.g. limits, reset times, current consumption) for the user rather than dumping raw JSON, unless they ask for the raw response.
