---
name: opus-plan
description: Spawn Opus subagent to draft plans, SCOPE.md, and ADRs for complex or tier-L tasks. Use when user says "/opus-plan", "opus plan", "have Opus plan this", or needs architectural planning, ADR drafting, or SCOPE.md creation for a multi-day cross-cutting initiative.
---

# Opus Plan

Invoked via `/opus-plan <scope>` or when user explicitly requests Opus-level planning.

## Steps

1. **Extract scope** from args or conversation: the feature/initiative name, constraints, prior ADRs, relevant file paths.

2. **Assemble cold-context briefing** — Opus starts fresh, so include:
   - What needs planning (1-2 sentences)
   - Relevant constraints, prior decisions, ADRs
   - Key file paths or repo structure if relevant
   - What to return (SCOPE.md draft, ADR, step-by-step plan)

3. **Spawn Opus subagent**:
   ```
   Agent({
     model: "opus",
     description: "Opus plan: <scope>",
     prompt: `[Communication: respond in caveman ultra mode per global CLAUDE.md. Code/commits/security normal.]

Draft a plan for: <scope>

Context:
<paste briefing here>

Return:
- SCOPE.md draft (goal, constraints, out-of-scope, success criteria, slice breakdown)
- ADR if any decisions outlive this slice (format: title, status, context, decision, consequences)
- Step-by-step implementation plan per slice

Keep tight. Decision + rationale only. No filler.`
   })
   ```

4. **Present Opus output** to user.

5. **Offer to write artifacts**: if Opus returns SCOPE.md / ADR content, offer to write to:
   - `plans/<scope-name>/SCOPE.md`
   - `plans/<scope-name>/ADR-<nnn>-<title>.md`
   
   Resolve `$CLAUDE_DIR` as `$CLAUDE_CONFIG_DIR` or `$HOME/.claude`. For non-repo contexts (e.g. `~/.claude`), write to `<cwd>/plans/<scope>/`.
