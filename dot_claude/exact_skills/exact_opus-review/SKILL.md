---
name: opus-review
description: Spawn Opus subagent for deep code review of diffs, branches, or files — especially security, auth, DB migrations, schema changes, or public API surface. Use when user says "/opus-review", "have Opus review", "ask Opus to review", or when a diff touches auth/secrets/migrations/public APIs.
---

# Opus Review

Invoked via `/opus-review <ref>` (branch, PR number, file path, or diff) or auto-triggered by CLAUDE.md security/migration/public-API rules.

## Steps

1. **Identify what to review** from args or conversation:
   - Branch name, PR number, file path, or inline diff
   - Review focus: security, correctness, migration safety, API surface, general

2. **Gather the diff / content** before spawning:
   - For branch: `git diff main...<branch> -- <relevant paths>`
   - For PR: use `gh pr diff <number>`
   - For file: read relevant sections
   - Keep it scoped — don't dump the entire repo

3. **Assemble cold-context briefing** with the actual diff/content pasted in. Opus starts fresh.

4. **Spawn Opus subagent**:
   ```
   Agent({
     model: "opus",
     description: "Opus review: <ref>",
     prompt: `[Communication: respond in caveman ultra mode per global CLAUDE.md. Code/commits/security normal.]

Deep review this diff / code:

Focus: <security | migration safety | API surface | correctness | general>

Diff / content:
<paste diff or file contents here>

Context:
<what this change does, any relevant constraints>

Return findings as:
path:line: <severity>: <problem>. <fix>.

Severity levels: CRITICAL, HIGH, MEDIUM, LOW.
Skip formatting nits unless they change behavior.
Flag: auth issues, secret handling, SQL injection, data loss risk, breaking API changes, migration rollback safety.
No praise. Findings only.`
   })
   ```

5. **Present Opus findings** to user.

6. **Gate if critical**: if Opus finds CRITICAL issues, do not proceed with merge/deploy until user acknowledges and resolves.
