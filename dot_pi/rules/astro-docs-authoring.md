---
description: Authoring plan/design/spec docs in the Astro + Starlight MDX dialect — plans MUST be .mdx with Decision/Aside/Tabs/mermaid; design docs publish via per-repo Starlight site with llms.txt; lesson-learnt reports under reports/.
paths:
  - "docs/**/*.md"
  - "docs/**/*.mdx"
  - "plans/**/*.md"
  - "plans/**/*.mdx"
  - "plan/**/*.md"
  - "plan/**/*.mdx"
---

# Authoring plan/design docs — Astro/Starlight MDX dialect

These files follow the Astro + Starlight docs standard (replaces Plandeck, retired 2026-07-07). Follow the `astro-docs-authoring` skill when writing them; scaffold a missing docs site with `astro-docs-setup`; lesson-learnt reports follow `report-authoring`.

## Plans MUST use MDX

Any document capturing decisions, warnings, or architecture is **`.mdx`** (not `.md`). Use:

- `<Decision title="..." status="proposed|accepted|rejected|superseded">` for every real architecture/design choice → ADR trail.
- `<Aside type="note|tip|caution|danger" title="...">` for important notes, risks, irreversible-step warnings.
- ` ```mermaid ` fences for any flow / architecture / sequence — prefer a diagram over long prose.
- `<Tabs>`/`<TabItem label="...">` for multi-variant code snippets.
- `<UiMock title height>` for Figma-style UI mocks (inline HTML, rendered live on the site).
- Every feature spec MUST contain an `### I/O examples` section (request/response, call→return, etc.).

Frontmatter: `title` + `description` required; `status: draft|accepted|superseded`; `draft: true` while draft (excludes page from build AND llms.txt).

## Locations

- Working plans: `plans/**` — same dialect, never published, imports optional.
- Published design docs: `docs/src/content/docs/design/<yyyy-mm-dd>-<topic>.mdx`.
- Lesson-learnt reports: `docs/src/content/docs/reports/<yyyy-mm>-<topic>.mdx` — per `report-authoring` (monthly per topic, severity + scoped tags, customSets entry per report).

Old Plandeck dialect in legacy files: `Callout`→`Aside` (warn→caution, success→tip), `CodeTabs`→`Tabs`/`TabItem`, `HtmlBlock`→`UiMock` or drop.
