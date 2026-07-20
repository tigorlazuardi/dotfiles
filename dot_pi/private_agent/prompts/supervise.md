---
description: Supervised — execute accepted scope through one child writer and independent review.
argument-hint: "<accepted spec/ticket/fix ref>"
---
`/supervise` makes main supervisor for accepted scope: $@

Main remains read-only for project source. Route fixed by risk: `implementer` + `reviewer` for standard work; `frontier-implementer` + `frontier-reviewer` for low-tolerance work. Exactly one child is writer at any time. Every child starts fresh and receives selected skills plus immutable scope, check, standards, findings, and evidence pointers relevant to its pass.

1. Resolve one accepted spec/ticket or diagnosed fix and exact recorded `checkCommand`. Read project instructions and current diff. Missing or ambiguous scope/check stops for user decision. **Complete when scope, check, preserved changes, risk route, and required skills are fixed.**
2. Resolve repo-root `CODING_STANDARDS.md`. If missing, stop and ask permission to invoke `coding-standards`; author nothing until approved. Use `code-review` skill for reviews. **Complete when canonical standards and review semantics are available.**
3. Create compact report/evidence paths. Spawn fresh writer with scope, standards, selected skills, output path, and instruction to leave exact `checkCommand` to supervisor. **Complete when writer returns verdict plus changed-file/report pointers.**
4. Spawn fresh read-only `standards` reviewer with diff/scope, standards, `code-review`, and report pointers. On FAIL, send findings pointer to fresh writer, increment shared fix count, then repeat `standards`. **Complete when `standards` PASS or shared cap of 3 fix passes yields terminal FAIL.**
5. After `standards` PASS, main runs exact `checkCommand`; record command, exit status, timestamp, revision/diff identity, and output pointer. Failure uses same fresh-writer loop, shared cap, then restarts at `standards`. **Complete when exact check is green or cap/block/escalation is terminal.**
6. After recorded green check, spawn fresh read-only `spec` reviewer with accepted scope and green-check evidence pointers. Reviewer uses recorded check evidence rather than rerunning it. FAIL uses same fresh-writer loop, shared cap, then restarts at `standards`. **Complete when `spec` PASS covers recorded green check, or terminal blocked/escalated/cap failure is recorded.**
7. Return terminal verdict, changed-file/report pointers, exact check evidence, fix count, and residual risks. Machine axes remain `standards` then `spec`; quick/deep labels, if used, are human-facing only.
