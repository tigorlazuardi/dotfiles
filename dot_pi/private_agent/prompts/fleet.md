---
description: Fleet — derive and validate XL execution graph for approval.
argument-hint: "<approved spec/tickets refs>"
---
`/fleet` authorizes Fleet planning for: $@

Read and follow `~/.pi/agent/skills/fleet-plan/SKILL.md`. **Completion is validated Fleet state plus graph/evidence pointer presented for explicit human approval, with execution deferred to `/captain`; otherwise return terminal blocked evidence.**
