---
name: plandeck-authoring
description: How to author plan/design/spec docs for a directory served by Plandeck. Trigger when authoring any plan/design/spec doc — SPEC.mdx, docs/design/<yyyy-mm-dd>-<topic>.mdx, FLEET.md-adjacent .mdx, ADRs, slice docs (SCOPE/IMPLEMENTATION/TASKS/RESUME) — when the user says "plandeck", or when a planning skill (feature-planning, ralph-plan, fleet, workflow-sweep) writes its artifacts. Covers choosing Markdown vs MDX, the custom MDX blocks (Callout, CodeTabs, Decision, HtmlBlock), Mermaid diagrams, and keeping the folder discoverable and live-reload friendly. This is for AUTHORING agents that write docs INTO a Plandeck-served folder, not for contributing to Plandeck's own source.
---

# Authoring docs for Plandeck

Plandeck renders a directory of docs as a searchable, live-reloading, **read-only** site. You (the agent) write the files; a human reads them in the browser. Optimize for *human reading*, not for re-parsing your own output.

In this stack, plan/design docs ARE plandeck `.mdx` — the committed `.mdx` file is itself the L-tier review artifact the human gates on (no separate visual-plan step). Typical locations: `plans/<scope>/SPEC.mdx` (FASE-1 spec, scope-level), `docs/design/<yyyy-mm-dd>-<topic>.mdx` (architecture decisions that outlive one scope), `plans/<scope>/<nnn>-<slice>/` slice docs (SCOPE/IMPLEMENTATION/TASKS/RESUME), ADRs.

## Plans MUST use MDX

Any document that is a **plan** — captures decisions, warnings, or architecture, not just prose notes — defaults to **`.mdx`**, not `.md`. This includes SPEC.mdx, design docs, ADRs, and any slice doc that records a real decision.

- Use **`.md`** only for plain prose with no decisions/callouts/diagrams to record.
- Use **`.mdx`** whenever you need the custom blocks below. MDX executes the registered components — nothing else.

## Custom MDX blocks (`.mdx` only)

| Block | Props | Use for |
|---|---|---|
| `<Callout>` | `type` = `info`/`warn`/`success`/`danger`, `title` | Highlighted note |
| `<CodeTabs>` | children: fenced-code blocks with `tab="..."` meta (optional `default`) | Tabbed code snippets |
| `<Decision>` | `title`, `status` = `proposed`/`accepted`/`rejected` | Architecture decision record |
| `<HtmlBlock>` | `height`; wraps one ```html fence | Sandboxed HTML preview (`sandbox=""`, scripts disabled) |

Example:

```mdx
<Callout type="warn" title="Heads up">
This migration is irreversible. Take a backup first.
</Callout>

<Decision title="Use SQLite FTS5 for search" status="accepted">
In-memory, zero external services, good enough for local doc sets.
</Decision>
```

Record every real architecture/design choice as a `<Decision title="..." status="proposed|accepted|rejected">` block so the human gets an ADR trail, not buried prose. Use `<Callout type="info|warn|success|danger" title="...">` for important notes, risks, and irreversible-step warnings.

## Code blocks

Fenced code blocks (both `.md` and `.mdx`) render as a syntax-highlighted box with a border, in light and dark themes. Set the language after the opening fence for highlighting (e.g. ` ```ts `).

**Line numbers are ON by default.** Optional metadata after the language controls the header and gutter:

| Meta | Effect | Default |
|---|---|---|
| `title="server.ts"` | Shows a filename/header bar above the block | none |
| `showLineNumbers=false` | Hides the line-number gutter | line numbers on |
| `startLine=42` | First line number (useful for excerpts) | `1` |

Examples (the meta goes on the info string, after the language):

````md
```ts title="src/server.ts"
import { serve } from "bun";
serve({ port: 3000 });
```

```sql showLineNumbers=false
SELECT * FROM orders WHERE status = 3;
```

```go title="sync.go" startLine=42
func FindVerifiedOrders() ([]Order, error) { ... }
```
````

Notes:

- Prefer `title="..."` when the snippet is a real file — the header gives the reader instant context.
- Use `startLine=N` when you paste an excerpt from deep in a file so the numbers match the source.
- Inline `<code>…</code>` and inline code spans stay literal (underscores, asterisks, backticks inside them are NOT parsed as Markdown), so `<code>product_id</code>` renders as-is.

## Mermaid diagrams

Fenced ` ```mermaid ` blocks render as diagrams (centered) in both `.md` and `.mdx`. **Prefer a diagram over a long textual description** of a flow or architecture — for any flow / architecture / sequence, reach for `mermaid` before prose.

## Tables

GFM tables (`| col | col |`) render with borders and a header row in both `.md` and `.mdx`. Use them for structured comparisons (e.g. task/slice tables, risk tiers) instead of nested bullet lists.

## Folder & discovery rules

- Plandeck respects **`.gitignore`** and skips hidden files/dirs by default. Don't write plan docs into ignored or dotted paths — they won't appear.
- Files above the size cap (**5 MB** default) are skipped. Split huge docs.
- **HTML and SVG are served as inert downloads, never live** — don't rely on active `.html`/`.svg` content; use `<HtmlBlock>` for sandboxed previews.
- Use clear file/folder names; the sidebar and full-text search key off them.

## Read-only mindset

There is no database and no write-back. The filesystem is the source of truth: to change what the human sees, write the file. Live reload pushes your edits to the open page automatically — no restart needed.

## Graceful degradation

An `.mdx` file with no custom blocks still reads fine as plain Markdown in any viewer (GitHub, editor preview, `cat`) — the JSX-looking blocks just show as literal tags outside Plandeck. Don't withhold `.mdx` out of fear it breaks non-Plandeck viewing; Plandeck is additive, not a hard dependency for the doc to be useful.

## Project-scoped rule

Working in a repo that keeps plandeck-served docs under `docs/**` or `plans/**`? Offer to run `/promote-rules` to write a project-scoped plandeck rule (`paths: docs/**, plans/**`) pointing back at this skill, so a cold session in that repo doesn't have to re-derive "plans are .mdx" from scratch. (There is no global `~/.claude/rules/` — rules are project-level only, unlike pi's `~/.pi/rules/`; this skill is the carrier of the global default.)
