#!/usr/bin/env bash
# Prints the Claude.ai OAuth usage/limits JSON.
#
# Cached + throttled: the endpoint is hit at most once per USAGE_CACHE_TTL
# seconds (default 60). A fresh cache is served without any network call; only a
# stale/missing cache triggers a fetch. Best-effort, no locking — a small race
# (two concurrent fetches) is harmless, the last writer wins. If a fetch fails
# but a stale cache exists, the stale copy is served rather than erroring.
#
# Set USAGE_CACHE_TTL=0 to always bypass the cache and fetch fresh.
set -euo pipefail

CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CACHE_TTL="${USAGE_CACHE_TTL:-300}"
CACHE_DIR="$CLAUDE_DIR/cache"
CACHE_FILE="$CACHE_DIR/usage-limits.json"

now="$(date +%s)"

# Age of the cache file in seconds (-1 if unknown).
cache_age() {
  local m
  m="$(stat -c %Y "$CACHE_FILE" 2>/dev/null)" || { echo -1; return; }
  echo $(( now - m ))
}

cache_fresh() {
  [ "$CACHE_TTL" -gt 0 ] 2>/dev/null || return 1
  [ -s "$CACHE_FILE" ] || return 1
  local mtime age
  mtime="$(stat -c %Y "$CACHE_FILE" 2>/dev/null)" || return 1
  age=$(( now - mtime ))
  [ "$age" -lt "$CACHE_TTL" ] || return 1
  jq -e . "$CACHE_FILE" >/dev/null 2>&1 || return 1
}

# 1. Fresh cache -> serve it, skip the network entirely.
if cache_fresh; then
  cat "$CACHE_FILE"
  exit 0
fi

# 2. Stale/missing -> resolve token and fetch.
TOKEN="$(jq -r '.claudeAiOauth.accessToken // empty' "$CLAUDE_DIR/.credentials.json" 2>/dev/null || true)"
if [ -z "$TOKEN" ]; then
  TOKEN="$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null | jq -r '.claudeAiOauth.accessToken // empty' 2>/dev/null || true)"
fi
if [ -z "$TOKEN" ]; then
  # best effort: serve stale cache, but flag it so callers can warn.
  if [ -s "$CACHE_FILE" ]; then
    echo "STALE_SERVED reason=no-token age=$(cache_age)s" >&2
    cat "$CACHE_FILE"; exit 0
  fi
  echo "Error: could not resolve OAuth access token from $CLAUDE_DIR/.credentials.json or macOS keychain." >&2
  exit 1
fi

resp="$(curl -s https://api.anthropic.com/api/oauth/usage \
  -H "Authorization: Bearer $TOKEN" \
  -H "anthropic-beta: oauth-2025-04-20" || true)"

# 3. Valid JSON -> refresh cache (tmp + atomic mv) and serve.
if printf '%s' "$resp" | jq -e . >/dev/null 2>&1; then
  mkdir -p "$CACHE_DIR" 2>/dev/null || true
  tmp="$CACHE_FILE.$$.tmp"
  if printf '%s' "$resp" > "$tmp" 2>/dev/null; then
    mv -f "$tmp" "$CACHE_FILE" 2>/dev/null || rm -f "$tmp"
  fi
  printf '%s\n' "$resp"
  exit 0
fi

# 4. Fetch failed/invalid -> best-effort stale cache (flagged), else error.
if [ -s "$CACHE_FILE" ]; then
  echo "STALE_SERVED reason=fetch-failed age=$(cache_age)s" >&2
  cat "$CACHE_FILE"
  exit 0
fi

echo "Error: usage endpoint returned no valid JSON and no cache is available." >&2
exit 1
