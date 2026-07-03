---
description: Authoring docs/plans browsed through Plandeck — plans MUST be .mdx with Decision/Callout/mermaid/CodeTabs/HtmlBlock blocks; discovery + rendering constraints.
paths:
  - "docs/**/*.md"
  - "docs/**/*.mdx"
  - "plans/**/*.md"
  - "plans/**/*.mdx"
  - "plan/**/*.md"
  - "plan/**/*.mdx"
---

# Authoring plan docs browsed through Plandeck

These files are browsed through Plandeck (a read-only viewer). Follow the `plandeck-authoring` skill when writing them.

## Plans MUST use MDX

When writing a **plan** document, author it as **`.mdx`** (not `.md`). Plans capture decisions, warnings, and architecture — they need the custom blocks. Use:

- `<Decision title="..." status="proposed|accepted|rejected">` for every real architecture/design choice → gives the human an ADR trail.
- `<Callout type="info|warn|success|danger" title="...">` for important notes, risks, and irreversible-step warnings.
- ` ```mermaid ` fences for any flow / architecture / sequence — prefer a diagram over long prose.
- `<CodeTabs>` (child fences with `tab="..."`) for multi-variant code snippets.
- `<HtmlBlock>` (sandboxed, scripts disabled) for any HTML preview.

Plain prose-only notes may still use `.md`, but anything that is a *plan* defaults to `.mdx`.

## Discovery & rendering

- Keep files out of `.gitignore`d / hidden paths so they stay discoverable; split docs over the 5 MB cap.
- HTML/SVG are inert downloads — use `<HtmlBlock>` for sandboxed previews.

> Adjust the `paths:` globs above to wherever this repo keeps its Plandeck-served docs.
