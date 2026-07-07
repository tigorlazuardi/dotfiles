---
name: opus
description: Hand off any task to Opus as full orchestrator — Opus plans, delegates workers, and drives to completion without user needing to guide each step. Use when user says "/opus", "let Opus handle this", "have Opus do it", "I don't want to think about this", or wants Opus to own an entire task end-to-end.
---

# Opus — Full Orchestrator Handoff

Invoked via `/opus <task>` when user wants Opus to own the task completely.

Sonnet's role after this: present Opus output to user, offer follow-up if needed. Do not second-guess Opus decisions.

## Steps

### 1. Gather context

Collect everything Opus needs (it starts cold):
- Task description (from args + conversation)
- Current working directory
- Relevant file paths already discussed
- Project type / stack if known
- Any constraints or preferences mentioned
- Prior decisions / ADRs relevant to task

Run these quickly if not already known:
```bash
pwd && ls -la
git log --oneline -5 2>/dev/null || echo "no git"
```

**Classify tier.** Assess: is this L-tier? (multi-day, cross-cutting, touches risk surface — auth/payments/migrations/data deletion/public API, or hard to verify, or broad blast radius). If yes, run Step 1.5 before spawning the executor.

### 1.5. MDX plan doc (L-tier only)

For L-tier tasks: spawn a **plan-only** Opus subagent whose sole job is to produce an `.mdx` plan doc — it does NOT execute anything. Brief it with all context from Step 1 and instruct it to:
1. Explore the repo to ground the plan in real files/symbols.
2. Decompose into steps, identify hard-to-reverse decisions, assign risk tiers.
3. Follow the `astro-docs-authoring` skill to write the plan doc: `Decision` blocks for hard-to-reverse choices, a mermaid work-graph diagram, a step table with risk tiers, and an open-questions `Aside`. Write it to `plans/<scope>/SPEC.mdx` (or `docs/src/content/docs/design/<yyyy-mm-dd>-<topic>.mdx` if this is pure architecture, no scope folder yet).
4. Return: the file path + a terse plan summary.

After the subagent returns: surface the file path to the user so they can review the committed `.mdx`. Route real ambiguities to the user via AskUserQuestion. **Do NOT spawn the executor (Step 2) until the user approves the plan and all open questions are resolved.**

Skip this step for S/M-tier — proceed directly to Step 2.

### 2. Spawn Opus as orchestrator

```
Agent({
  model: "opus",
  description: "Opus orchestrate: <task summary>",
  prompt: `[Communication: respond in caveman ultra mode per global CLAUDE.md. Code/commits/security normal. Persist every response.]

You are the orchestrator for this task. Own it end-to-end.

## Task
<task description>

## Context
Working dir: <cwd>
Project: <stack/type if known>
Relevant files: <paths>
Constraints: <any user constraints>
Prior decisions: <relevant ADRs or decisions from conversation>

## Your role as orchestrator

Plan the work, then delegate via subagents. You have access to:
- **sonnet-implementer** — all code writes/edits/generation, multi-file changes
- **haiku-implementer** — trivial mechanical edits < 10 LOC, single file, zero design
- **Explore / general-purpose** — read-only codebase search, returns synthesis
- **sonnet-support** — docs, research, web fetches, summarization

Rules for delegation:
- Write tight specs before spawning workers. Include: goal, files to touch, acceptance criteria.
- Prepend to every worker prompt: "[Communication: respond in caveman ultra mode. Code/commits/security normal.]"
- Review worker output vs spec before next step. Spawn fix worker if needed.
- Destructive/irreversible actions (delete, force-push, schema drop, prod write): STOP and ask user first.
- If a worker fails twice on same step: diagnose root cause before spawning again.

## Path convention
Resolve \$CLAUDE_DIR as \$CLAUDE_CONFIG_DIR first, fall back to \$HOME/.claude. Never hardcode ~/.claude.

## Deliverable
When done: summary of what was done, what files changed, what's next (if anything).
Keep tight.`
})
```

### 3. Present result

Show Opus output to user. If Opus asks for user input mid-task (destructive action gate, ambiguity), relay to user and continue.

### 4. Follow-up

If task incomplete or Opus surfaced blockers, offer next steps. User decides whether to re-invoke `/opus` or handle manually.
