---
paths:
  - workflows/src/control_plane.js
  - workflows/src/slice_orchestrator.js
  - workflows/saved/fleet.json
  - workflows/saved/slice_orchestrator.json
---

# Fleet knowledge-transfer conventions

When editing the fleet workflow source, preserve these invariants.

## Schema

Every knowledge item conforms to `DELTA_SCHEMA`:
```
{ kind: 'rule' | 'skill', name: string, scope: string, body: string }
```
- `rule.scope` = glob list (becomes `paths:` frontmatter in `.pi/rules/<name>.md`).
- `skill.scope` = the intent/trigger sentence (becomes `description:` frontmatter in `.pi/skills/<name>/SKILL.md`).
- `name` = kebab-case, used as the filename/dirname stem.

## Persistence

Persist via the `writeKnowledge(items, tag)` helper. The writer spawns a `support` agent with explicit "do NOT overwrite; merge if file exists; write valid frontmatter" instructions. Never write knowledge files inline with `bash` — always go through the helper so the merge/frontmatter contract is honored.

## Propagation

`knowledge[]` is the single accumulator in `control_plane.js`. Every wave dispatches with `knowledge.slice()` (a snapshot, not a reference) and slices inject it into both impl + review prompts via `knowledgeBlock`. Do not pass the array by reference into a sub-workflow — the snapshot is what guarantees a slice sees only the knowledge available WHEN IT STARTED.

## Tiered write

`slice.writeDirectly` controls when persistence happens:
- `true` → slice_orchestrator writes mid-slice after impl AND after review.
- `false` → control plane batches the write at end-of-wave.

Default rule: `writeDirectly = slice.lowTolerance === true`. Low-tolerance slices get deep-reviewer gate at review time, so mid-slice writes are safe and propagate faster. Routine slices batch.

Slices that wrote mid-slice MUST return `writtenItems: [name1, name2, ...]` so the control plane can deduplicate the batch write.

## Trivia filter

Persist only durable concepts: real conventions, schemas, vendor quirks, gotchas other slices must honor. One-off slice details (a variable rename, a tweak to one file) stay in the diff, not in `.pi/rules`/`.pi/skills`. When unsure, do not write — the next manual `/promote-rules` capture costs less than scrubbing a wrong rule from git.
