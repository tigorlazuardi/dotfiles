---
name: promote-rules
description: Promote a durable, path-scoped project convention into a repo `.pi/rules/` file (with `paths:` frontmatter) so it survives sessions and machines, is shared with the team, and is auto-loaded by pi. Use when a concrete, domain-specific rule emerges that can be scoped to file paths — e.g. "all drizzle timestamp fields must be timezone-aware", "API handlers must validate input with zod". OFFER this whenever the user states a durable convention/constraint tied to a clear part of the codebase, instead of silently absorbing it. Also triggers on "/promote-rules", "make this a rule", "save this convention", "remember this for these files".
---

# Promote a durable convention into a project rule

Turn a durable convention into a committed `.pi/rules/` file. Rules are loaded by the **pi-rules** extension and injected into matching `tool_result` output when work touches matching file paths.

**pi-rules contract (non-negotiable):**
- `description:` is **REQUIRED** and must be a non-empty string. pi-rules **silently skips** any rule file without it. Never omit it.
- Discovery dirs (only these load): `~/.pi/rules/`, `~/.claude/rules/`, `<repo>/.pi/rules/`, `<repo>/.claude/rules/`. Note user-level is `~/.pi/rules/` — **NOT** `~/.pi/agent/rules/`.
- `paths:` optional. Omitted → tool-scoped rule (fires on `tools` match, default `read`/`edit`/`write`). Present → at least one target path must match.
- Deprecated: `globs:` (use `paths:`, warns), `alwaysApply:` (ignored — omit `paths:` for tool-scoped).
- Optional fields: `tools` (glob/list over tool name; `"*"` = all tools), `inputPaths`, `includeErrors` (default false), `dedupe` (session|tool|target|call|never, default session).

**Location policy (default repo-level):** save to repo `.pi/rules/` unless the user EXPLICITLY asks for user-level. Repo-level (`.pi/rules/`) is shared with the team and auto-loaded by pi. User-level (`~/.pi/rules/`) is your personal cross-repo habit, pi-only. Assume repo-level unless told otherwise.

**Team + cross-harness compat:** pi-rules ALSO loads `.claude/rules/` (repo + user). If the team shares rules with a Claude Code harness, write to `<repo>/.claude/rules/` instead of `.pi/rules/` so both harnesses pick them up. Offer this when the user mentions a mixed/Claude-Code team.

## Use a rule (not a skill) when

- Domain is concrete (db schema, API handlers, one package).
- Scope is expressible as file-path globs.
- It should apply automatically whenever those paths are touched.

If the concept is abstract / intent-triggered / cross-domain with no clean path scope → **stop, suggest `/promote-skills` instead**.

## Workflow

1. **Identify the concept.** From the conversation or the user's args, state the durable rule in one sentence. Confirm with the user if fuzzy.

2. **Confirm it is rule-shaped.** Concrete domain + path-scopable? If not → suggest `/promote-skills`, stop.

3. **Resolve target dir and scope.** Default is repo-level; only go user-level on explicit request. Options:
   - **Path-scoped (repo)** — applies only to files matching globs. Best when the habit is language- or area-specific. → project `.pi/rules/<name>.md` **with** `paths:` frontmatter. Only loads when work touches matching files (saves context).
   - **Repo-wide** — applies to the whole project regardless of file. → project `.pi/rules/<name>.md` **without** `paths:` (still needs `description:`; it becomes tool-scoped, firing on the default `read`/`edit`/`write` tools).
   - **Team / Claude-Code-shared (repo)** — same as above but written to `<repo>/.claude/rules/<name>.md` so a Claude Code harness picks them up too. Offer when the team is mixed-harness.
   - **All projects (user-level, explicit only)** — personal habit across every repo, pi-only. → `~/.pi/rules/<name>.md`. Use ONLY when the user explicitly asks for user/global level.
   - No repo? Then the user-level option applies.

4. **Reuse-first.** Search existing `<root>/.pi/rules/*.md` + `<root>/.claude/rules/*.md` (or `~/.pi/rules/*.md` for user-level). If one already covers this domain (overlapping `paths:`), append/update it instead of creating a new file. Else pick a new kebab-case `<name>.md`.

5. **Derive `paths:` globs** (for path-scoped). From the domain, propose the glob(s). Show the user; let them tighten/loosen. Example:
   ```
   paths:
     - packages/db/**/*.ts
   ```

6. **Draft the rule.** Frontmatter + concise body. `description:` is REQUIRED. Imperative, testable, no fluff:
   ```markdown
   ---
   description: DB timestamp columns must be timezone-aware
   paths:
     - packages/db/**/*.ts
   ---

   All timestamp columns MUST use `timestamptz` (timezone-aware). No exceptions.
   ```
   Repo-wide (no `paths:`) still requires `description:`:
   ```markdown
   ---
   description: Project-wide error-handling convention
   ---

   Never swallow errors silently; wrap external calls with typed error results.
   ```

7. **Preview → approval.** Show the full file + target path. Get explicit OK.

8. **Write + confirm.** Write the file. Print the path. Remind the user to commit it so the team and other machines get it.

## Keep rules tight

- One coherent convention per file (or per closely-related cluster).
- Body states WHAT + the non-negotiable, not a tutorial. Explain "why" briefly when it isn't obvious — rules with reasons get followed more reliably.
- Paths as narrow as correctness allows — over-broad globs fire noise.

## Notes

- New/edited rule files are picked up **next session** (repo-wide/path-scoped) or when Pi next reads a matching file. Mention this so the user isn't surprised it's not live mid-session.
- **A rule with no `description:` is silently dropped by pi-rules** — always double-check the frontmatter has it before writing.
- Verify loading + diagnose skipped/parse-error files with `/tool-rules doctor` inside pi.
