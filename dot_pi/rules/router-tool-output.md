---
description: Local model-router (omniroute) tool-output corruption gotcha — if a tool returns nonsensical output, suspect the router layer first; verify backend directly; do not reintroduce 9router without re-testing.
paths:
  - .pi/agent/models.json
  - .pi/agent/settings.json
  - .config/systemd/user/omniroute.service
---

# Local model router: tool-output corruption gotcha

Pi routes models through a local router (currently **omniroute** at `http://localhost:20128/v1`, provider `omniroute`, api `anthropic-messages`).

## Gotcha: 9router corrupted tool outputs
The previous router **9router** intermittently corrupted/hijacked tool results — e.g. a `web-search` call returned the git string `nothing to commit, working tree clean` instead of search results, even in non-git dirs. The tool itself (pi-lean-search → SearXNG on port 8888) was healthy; the router layer mangled the response.

**Diagnostic heuristic:** if a tool returns output that is nonsensical for that tool (git status text from web-search, wrong tool's payload, etc.), suspect the **router layer first**, not the tool or its backend. Verify the backend directly (e.g. `curl localhost:8888/search?q=test&format=json`) before touching tool config.

**Resolution:** migrated 9router → omniroute; the corruption disappeared immediately. 9router has been purged. Do not reintroduce 9router as the pi provider without re-testing tool-output integrity.
