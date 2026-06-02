---
name: opus-diagnose
description: Spawn Opus subagent to diagnose bugs, failing tests, or hard errors after standard debugging has failed. Use when user says "/opus-diagnose", "ask Opus to diagnose", "have Opus look at this bug", or when systematic-debugging has cycled once without resolution.
---

# Opus Diagnose

Invoked via `/opus-diagnose <symptom>` or after one full `systematic-debugging` cycle fails.

## Steps

1. **Collect symptom + evidence** from conversation or args:
   - Error message / stack trace (exact, quoted)
   - Failing test output
   - Steps to reproduce
   - What has already been tried
   - Relevant file paths and line numbers

2. **Assemble cold-context briefing** — Opus starts fresh, so include all evidence directly in the prompt. Do not reference "the conversation" — paste the relevant parts.

3. **Spawn Opus subagent**:
   ```
   Agent({
     model: "opus",
     description: "Opus diagnose: <symptom>",
     prompt: `[Communication: respond in caveman ultra mode per global CLAUDE.md. Code/commits/security normal.]

Diagnose this bug / failure:

Symptom: <exact error or behavior>

Evidence:
<stack trace / test output / logs — paste exact, not paraphrased>

Relevant files:
<file:line for key suspects>

Already tried:
<list what has been attempted>

Return:
- Root cause hypothesis (most likely first)
- Evidence that supports/refutes each hypothesis
- Concrete next-step plan to confirm and fix
- Any spec or invariant violations found

Tight. No filler.`
   })
   ```

4. **Present Opus output** to user.

5. **Proceed**: if Opus returns a hypothesis + fix plan, offer to delegate fix to `sonnet-implementer` per the plan. Do not auto-execute destructive or irreversible actions without user confirmation.
