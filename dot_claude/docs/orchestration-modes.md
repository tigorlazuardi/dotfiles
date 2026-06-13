# Orchestration modes & model routing

On-demand reference, loaded from CLAUDE.md only when choosing how to run non-trivial work. Keeps the rationale + mechanics out of every-turn context.

## Two decisions when starting non-trivial work

Two independent decisions, not one. The expensive resource is the **resident orchestrator** (it persists across every turn) plus the spec-writing + diff-review around delegation — both decisions are about where to spend.

### Decision 1 — attended one-shot vs autonomous loop (how the work runs)
- **One-shot attended** — fits one sitting, you stay at the keyboard. Opus drives directly, delegates to ralph subagents, no contract/STATE/loop overhead.
- **Autonomous loop (ralph)** — long-running, unattended, resumable, parallel fan-out, spans sessions. Opus authors a contract once; a fresh session runs the loop on the model the contract declares.

### Decision 2 — Sonnet vs Opus orchestrator (chosen *per slice*, by correctness tolerance)
- **Sonnet (default) — general & mechanical, high correctness tolerance.** CRUD, plumbing, refactors, UI, tests, well-bounded changes that are easy to verify. The loop turn is clerk work (dispatch → read verdict → advance → commit); Opus judgment is routed on demand (L reviews + the two-failure circuit-breaker spawn `model: opus`). Making the resident driver Opus here just pays the Opus tax on every mechanical turn.
- **Opus — low correctness tolerance.** A wrong autonomous decision is expensive or hard to undo: money/payment flows, auth, secrets, DB migrations, data deletion, public-API contracts. There every accept/merge/advance decision carries blast radius, so routing Opus only to the review step isn't enough — the *resident driver itself* needs Opus judgment. This is the deliberate, justified exception to the Sonnet default.

### Large scope → split by orchestrator model (the main cost lever)
Don't Opus-orchestrate a whole big feature. Decompose so the low-tolerance work is isolated into its own slice(s) under an Opus orchestrator, and the mechanical remainder runs as separate slice(s) under a Sonnet orchestrator. The per-slice `orchestrator_model` in each contract makes this natural — spend Opus on the money slice, not the CRUD around it.

**Nested subagents reinforce the Sonnet default**: the reviewer self-scouts + self-verifies, so deep intelligence concentrates in an ephemeral Opus subtree on demand — the resident orchestrator gets *thinner*, not smarter. That keeps the Sonnet bar where it should be and reserves the Opus orchestrator for genuine low-tolerance slices.

## Nested subagents — mechanics (CC v2.1.172+)

A subagent spawns its own subagents only if its frontmatter `tools` list includes `Agent`.

- **`Agent` is binary.** The `Agent(type)` allowlist parens are *ignored* inside a subagent definition — a nesting-enabled subagent can spawn any type. Control children by **prompt**, not frontmatter. Bound a tree by giving `Agent` only to agents you trust to self-limit, and keeping leaves un-nestable (omit `Agent`, or add it to `disallowedTools`).
- **Depth.** Foreground subagents nest at any depth — each level blocks its parent, so the chain is self-limiting. A *background* subagent at depth 5 loses `Agent` and cannot spawn further (fixed anti-runaway cap).
- **Fork** can't spawn another fork, but can spawn other types (they count toward depth).
- **Cost.** A nested subagent starts cold and reloads the full CLAUDE.md/memory hierarchy (except Explore/Plan). Keep CLAUDE.md lean partly for this reason.

Ralph tree (all foreground; depth 1–3, well under the background-5 cap):

```
ralph-loop / main (orchestrator: sonnet, or opus for a low-tolerance slice)   depth 0
└─ ralph-reviewer (opus for L/risky)   +Agent                                 depth 1
   ├─ ralph-scout    (haiku)  leaf                                            depth 2   self-scout dangerous paths
   └─ ralph-verifier (sonnet) leaf                                            depth 2   adversarial refute, one per finding
```

Only `ralph-reviewer` nests. `ralph-scout`, `ralph-verifier`, `ralph-implementer` are leaves → tree stops at depth 2. Outside ralph, a nested *write* worker is discouraged: an Opus subagent returns a spec UP to Sonnet rather than spawning its own implementer, so writes stay reviewable.

## One-shot attended Opus mode — reuse ralph subagents standalone

In attended one-shot mode Opus stays the driver and reuses the committed ralph subagents directly — no contract, no STATE.md, no promise tag:
- **`ralph-scout`** (`model: haiku`) — map the codebase (where X used, what calls Y, trace a flow) so Opus doesn't burn tokens on fan-out reading. Bump to `sonnet` for hard multi-hop traces.
- **`ralph-implementer`** (`model: sonnet`) — one task each, test-first, in scope, reports back; hands over cleanly when its context fills, so long tasks stay lossless across implementers.
- **`ralph-reviewer`** per the review-routing rule (S/M → `sonnet`, L/risky → `opus`). It self-scouts + self-verifies via nesting, so you don't pre-scout for it. For small one-shot work, Opus often just reviews the diff itself.

Lighter than full ralph — no loop/contract/STATE. Default to this unless the work genuinely needs autonomy, resume, or wide parallelism.

## Copy-paste brief — Sonnet main → fresh Opus session

When a Sonnet main thread hits Medium/Large work with no plan file, it must hand off to Opus. If the user will `/clear` into a fresh Opus session (which wipes the transcript), give them a **self-contained** brief to paste — written so cold Opus picks it up with zero prior memory:

```
[Goal restated in full. Key context/constraints gathered so far. Relevant files/paths.
 Repo + branch. Decisions already made this session.]

Plan this as a medium/large task. Decide: full Ralph workflow (/ralph-plan) or orchestrate
it yourself one-shot with cheaper subagents. Ask me questions before planning.
```

Fill it with everything this session already established — don't make Opus re-derive it.
