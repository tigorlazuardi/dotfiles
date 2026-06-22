---
name: promote-rules
description: Promote a durable, path-scoped project convention into a .pi/rules/ file (with `paths:` frontmatter) so it survives sessions and machines and is shared with the team. Use when a concrete, domain-specific rule emerges that can be scoped to file paths — e.g. "all drizzle timestamp fields must be timezone-aware", "API handlers must validate input with zod". OFFER this whenever the user states a durable convention/constraint tied to a clear part of the codebase, instead of silently absorbing it. Also triggers on "/promote-rules", "make this a rule", "save this convention", "remember this for these files".
---

# Promote a durable convention into a project rule

Turn a durable convention into a committed `.pi/rules/` file. Rules trigger deterministically when work touches matching file paths.

## Use a rule (not a skill) when

- Domain is concrete (db schema, API handlers, one package).
- Scope is expressible as file-path globs.
- It should apply automatically whenever those paths are touched.

If the concept is abstract / intent-triggered / cross-domain with no clean path scope → **stop, suggest `/promote-skills` instead**.

## Workflow

1. **Identify the concept.** From the conversation or the user's args, state the durable rule in one sentence. Confirm with the user if fuzzy.

2. **Confirm it is rule-shaped.** Concrete domain + path-scopable? If not → suggest `/promote-skills`, stop.

3. **Resolve target dir and scope.** Three options — ask if unclear:
   - **Path-scoped** — applies only to files matching globs. Best when the habit is language- or area-specific. → project `.pi/rules/<name>.md` **with** `paths:` frontmatter. Only loads when Pi touches matching files (saves context).
   - **Repo-wide** — applies to the whole project. → project `.pi/rules/<name>.md`, **no** frontmatter.
   - **All projects** — personal habit across every repo. → `~/.pi/agent/rules/<name>.md`.
   - No repo? Only the all-projects option applies.

4. **Reuse-first.** Search existing `<root>/.pi/rules/*.md`. If one already covers this domain (overlapping `paths:`), append/update it instead of creating a new file. Else pick a new kebab-case `<name>.md`.

5. **Derive `paths:` globs** (for path-scoped). From the domain, propose the glob(s). Show the user; let them tighten/loosen. Example:
   ```
   paths:
     - packages/db/**/*.ts
   ```

6. **Draft the rule.** Frontmatter + concise body. Imperative, testable, no fluff:
   ```markdown
   ---
   paths:
     - packages/db/**/*.ts
   ---

   All timestamp columns MUST use `timestamptz` (timezone-aware). No exceptions.
   ```

7. **Preview → approval.** Show the full file + target path. Get explicit OK.

8. **Write + confirm.** Write the file. Print the path. Remind the user to commit it so the team and other machines get it.

## Keep rules tight

- One coherent convention per file (or per closely-related cluster).
- Body states WHAT + the non-negotiable, not a tutorial. Explain "why" briefly when it isn't obvious — rules with reasons get followed more reliably.
- Paths as narrow as correctness allows — over-broad globs fire noise.

## Notes

- New/edited rule files are picked up **next session** (repo-wide/path-scoped) or when Pi next reads a matching file. Mention this so the user isn't surprised it's not live mid-session.
