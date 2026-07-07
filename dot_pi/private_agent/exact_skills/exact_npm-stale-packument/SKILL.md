---
name: npm-stale-packument
description: 'Fix npm/pi install failing with "ETARGET No matching version found" or "404 could not be found" for a version that DEMONSTRABLY exists in the registry. Root cause is a stale cached packument (npm per-package version metadata) — npm only sees old versions while curl/the web registry shows the version exists. Use when `pi install`, `npm install <pkg>@<ver>`, or a transitive dep pins a fresh/alpha/nightly version (e.g. playwright daily alphas, @playwright/cli, canary builds) and npm claims it does not exist. Triggers include "No matching version found", "notarget", "ETARGET", a package that publishes very frequently, or a version curl confirms but `npm view <pkg>@<ver>` returns 404. NOT for genuinely-nonexistent versions, registry auth errors, or private-registry misconfig.'
---

# npm stale packument — clean cache, don't chase phantom gates

`pi install` shells out to `npm install ... --prefix ~/.pi/agent/npm --legacy-peer-deps`. When it dies with:

```
npm error code ETARGET
npm error notarget No matching version found for <pkg>@<version>.
```

…for a version that actually exists, the cause is almost always a **stale cached packument** — npm's local copy of the package's version list is old and does not include the newly-published version. This bites hardest on packages that publish **daily alphas / nightlies** (playwright, @playwright/cli, canary toolchains): the pinned dep is newer than the cached metadata.

## Confirm it's stale metadata (30 seconds)

The version exists at the registry but npm can't see it:

```bash
# Registry HAS it (raw HTTP, bypasses npm cache):
curl -s https://registry.npmjs.org/<pkg>/<version> | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('_id'), d.get('dist',{}).get('tarball'))"

# npm CANNOT see it (reads stale cache):
npm view <pkg>@<version> version          # -> 404
npm view <pkg> versions --json | tail     # newest listed is days/weeks behind curl
```

Scoped names need URL-encoding in curl: `@playwright/cli` -> `@playwright%2Fcli`.

If curl shows the version + tarball but `npm view` 404s → stale packument confirmed.

## Fix

```bash
npm cache clean --force
```

Then re-run the install (`pi install npm:<pkg>` or the npm command). npm refetches the packument and now resolves the version. Verify:

```bash
npm view <pkg>@<version> version --prefer-online   # prints the version, no 404
```

## Do NOT get misled by

- **`minimum-release-age` / `minimum-release-age-exclude` in ~/.npmrc** — these are **pnpm-only**. npm ignores them (it even warns `Unknown user config "minimum-release-age"`). They are NOT the cause and adding the package to the exclude list does nothing. Don't waste time editing them; revert any such edit.
- **`prefer-offline=true`** — makes it *more* likely to serve stale metadata, but the real fix is still `npm cache clean --force` (one-shot `--prefer-online` alone did not fix it in practice).
- **The warning lines** about unknown config — noise, unrelated to the failure.

## One line that matters most

Version exists at the registry but npm says "no matching version" → `npm cache clean --force`, then re-install. Don't touch `minimum-release-age`.
