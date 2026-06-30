---
name: plandeck-authoring
description: How to author plan/documentation files for a directory served by Plandeck. Use whenever writing or editing .md/.mdx docs that a human will browse through Plandeck — choosing Markdown vs MDX, using the custom MDX blocks (Callout, CodeTabs, Decision, HtmlBlock), Mermaid diagrams, and keeping the folder discoverable and live-reload friendly. This is for AUTHORING agents that write docs INTO a Plandeck-served folder, not for contributing to Plandeck's own source.
---

# Authoring docs for Plandeck

Plandeck renders a directory of docs as a searchable, live-reloading, **read-only** site. You (the agent) write the files; a human reads them in the browser. Optimize for *human reading*, not for re-parsing your own output.

## File format: Markdown vs MDX

- Use **`.md`** for plain prose. No JSX runs in `.md` (safe by design).
- Use **`.mdx`** only when you need the custom blocks below. MDX executes the registered components — nothing else.

## Custom MDX blocks (`.mdx` only)

| Block | Props | Use for |
|---|---|---|
| `<Callout>` | `type` = `info`/`warn`/`success`/`danger`, `title` | Highlighted note |
| `<CodeTabs>` | children: fenced-code blocks with `tab="..."` meta (optional `default`) | Tabbed code snippets |
| `<Decision>` | `title`, `status` = `proposed`/`accepted`/`rejected` | Architecture decision record |
| `<HtmlBlock>` | wraps one ```html fence | Sandboxed HTML preview (`sandbox=""`, scripts disabled) |

Example:

```mdx
<Callout type="warn" title="Heads up">
This migration is irreversible. Take a backup first.
</Callout>

<Decision title="Use SQLite FTS5 for search" status="accepted">
In-memory, zero external services, good enough for local doc sets.
</Decision>
```

Record real architecture choices as `<Decision>` blocks so the human gets an ADR trail, not buried prose.

## Mermaid diagrams

Fenced ` ```mermaid ` blocks render as diagrams in both `.md` and `.mdx`. Prefer a diagram over a long textual description of a flow or architecture.

## Folder & discovery rules

- Plandeck respects **`.gitignore`** and skips hidden files/dirs by default. Don't write plan docs into ignored or dotted paths — they won't appear.
- Files above the size cap (**5 MB** default) are skipped. Split huge docs.
- **HTML and SVG are served as inert downloads, never live** — don't rely on active `.html`/`.svg` content; use `<HtmlBlock>` for sandboxed previews.
- Use clear file/folder names; the sidebar and full-text search key off them.

## Read-only mindset

There is no database and no write-back. The filesystem is the source of truth: to change what the human sees, write the file. Live reload pushes your edits to the open page automatically — no restart needed.
