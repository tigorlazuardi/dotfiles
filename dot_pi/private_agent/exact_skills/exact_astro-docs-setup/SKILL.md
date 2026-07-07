---
name: astro-docs-setup
description: Scaffold a per-repo Astro + Starlight design-docs site (once per repo). Trigger when the user asks to "set up docs", "scaffold the docs site", "add astro docs", when a FASE-1 spec produces a design doc but the repo has no docs site yet, or when migrating a repo off Plandeck. Creates docs/ (merge-offer on conflict, fallback docs-site/), the Decision.astro component, starlight-llms-txt config, and CI for GitHub Pages or Cloudflare Pages. For WRITING docs afterwards, use astro-docs-authoring instead.
---

# Astro docs site — per-repo scaffold

One Starlight site per repo. Published content = high-level design docs only (`src/content/docs/design/<yyyy-mm-dd>-<topic>.mdx`). `plans/**` stays at repo root, same MDX dialect, never published. Build output serves `llms.txt` / `llms-full.txt` / `llms-small.txt` for external RAG. Spec: this standard replaces Plandeck (retired 2026-07-07).

## Step 0 — decide location

- Repo has no `docs/` → scaffold at `docs/`.
- Repo has an existing `docs/` → **offer to merge**: existing markdown moves into `docs/src/content/docs/` (design docs into `design/`, the rest wherever fits). Show the file list before moving.
- User declines merge → fall back to `docs-site/`. Use that name consistently everywhere below.

## Step 1 — ask hosting (per repo, no global default)

Ask the user: **GitHub Pages** vs **Cloudflare Pages** (vs skip CI for now). Also ask, if the repo is private, whether the published site/`llms.txt` may be public — private-repo RAG access is a per-repo call.

## Step 2 — scaffold

```bash
npm create astro@latest docs -- --template starlight --no-git --install --skip-houston
cd docs && npm install starlight-llms-txt
```

Then remove the template's example content (`src/content/docs/guides/`, example assets) and create `src/content/docs/design/` and `src/content/docs/reports/`.

Seed `src/content/docs/reports/index.mdx` (the only sidebar entry for reports — content pages hang off it):

```mdx title="docs/src/content/docs/reports/index.mdx"
---
title: Index of Reports
description: Repo-level lessons learnt — errors, quirks, incidents — grouped by month.
sidebar:
  label: Index of Reports
---

No reports yet. Written per the report-authoring skill after nontrivial fixes/incidents.
```

### astro.config.mjs

```js title="docs/astro.config.mjs"
// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';

export default defineConfig({
  // GitHub Pages project site: site = https://OWNER.github.io, base = '/REPO'.
  // Cloudflare Pages / custom domain: site = the real URL, no base.
  site: 'https://OWNER.github.io',
  base: '/REPO',
  integrations: [
    starlight({
      title: 'REPO design docs',
      plugins: [
        starlightLlmsTxt({
          // Reports ship in llms.txt but sit below design docs in the index ordering
          demote: ['reports/**'],
          // ONE entry per report file — appended by the report-authoring skill.
          // Each set builds to /_llms-txt/<slug>.txt and is listed in llms.txt.
          customSets: [
            // { label: 'Report: <topic> (<yyyy-mm>)', description: '<symptom keywords>', paths: ['reports/<yyyy-mm>-<topic>'] },
          ],
        }),
      ],
      sidebar: [
        // Starlight ≥0.39 syntax — autogenerate lives inside items, not next to label
        { label: 'Design decisions', items: [{ autogenerate: { directory: 'design' } }] },
        // Reports: collapsed, index-only — content pages reachable from the index, not the sidebar
        { label: 'Reports', collapsed: true, items: [{ label: 'Index of Reports', link: '/reports/' }] },
      ],
    }),
  ],
});
```

### Content schema — extend with status/date

```ts title="docs/src/content.config.ts"
import { defineCollection, z } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        status: z.enum(['draft', 'accepted', 'superseded']).optional(),
        date: z.coerce.date().optional(),
        // reports/ fields (unused by design docs)
        severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        tags: z.array(z.string()).optional(),
      }),
    }),
  }),
};
```

### Decision.astro — the one custom component

Copied into each repo; no npm package to maintain. Built on Starlight's Aside + Badge so it inherits theming and stays indexable in llms.txt.

```astro title="docs/src/components/Decision.astro"
---
import { Aside, Badge } from '@astrojs/starlight/components';

interface Props {
  title: string;
  status?: 'proposed' | 'accepted' | 'rejected' | 'superseded';
}

const { title, status = 'proposed' } = Astro.props;

const variants = {
  proposed: 'caution',
  accepted: 'success',
  rejected: 'danger',
  superseded: 'note',
} as const;
---

<Aside type="note" title={`Decision: ${title}`}>
  <p><Badge text={status} variant={variants[status]} /></p>
  <slot />
</Aside>
```

Docs import it per file: `import Decision from '../../../components/Decision.astro';` (adjust depth). Prefer a `src/components/` alias if the repo configures one.

### UiMock.astro — Figma-style UI preview frame

For specs that touch UI: wrap plain HTML mock markup in a browser-chrome frame so the built site (and `astro dev` for `draft: true` docs) renders a live preview. Replaces the retired Plandeck `<HtmlBlock>` — content renders for real instead of a sandboxed iframe.

```astro title="docs/src/components/UiMock.astro"
---
interface Props {
  title?: string;
  height?: string;
}

const { title = 'UI mock', height = 'auto' } = Astro.props;
---

<figure class="ui-mock not-content">
  <figcaption>
    <span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span>
    <span class="mock-title">{title}</span>
  </figcaption>
  <div class="ui-mock-body" style={`min-height:${height}`}>
    <slot />
  </div>
</figure>

<style>
  .ui-mock {
    border: 1px solid var(--sl-color-gray-5);
    border-radius: 0.5rem;
    overflow: hidden;
    margin: 1.5rem 0;
  }
  .ui-mock figcaption {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem;
    background: var(--sl-color-gray-6);
    font-size: 0.8rem;
    color: var(--sl-color-gray-2);
  }
  .mock-title { margin-inline-start: 0.35rem; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .red { background: #f56; }
  .yellow { background: #fb3; }
  .green { background: #4c4; }
  .ui-mock-body { padding: 1rem; background: var(--sl-color-bg); }
</style>
```

`not-content` opts the frame out of Starlight's default content styling so the mock's own layout wins.

## Step 3 — CI template (per Step 1 answer)

### GitHub Pages

```yaml title=".github/workflows/docs.yml"
name: Deploy docs
on:
  push:
    branches: [main]
    paths: ['docs/**']
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: withastro/action@v3
        with:
          path: ./docs
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Remind: repo Settings → Pages → Source = GitHub Actions.

### Cloudflare Pages

Prefer the CF Pages git integration (zero YAML): build command `npm run build`, root directory `docs`, output `dist`. If the user wants Actions instead:

```yaml title=".github/workflows/docs.yml"
name: Deploy docs
on:
  push:
    branches: [main]
    paths: ['docs/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
        working-directory: docs
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy docs/dist --project-name=REPO-docs
```

Telemetry: consciously minimal — CI build status IS the alert (static site, no runtime surface). No OTel.

## Step 4 — migrate existing design docs

Repo already has `docs/design/*.mdx` (old Plandeck dialect) → move into `docs/src/content/docs/design/` and convert per file:

| Old (Plandeck) | New (Starlight) |
|---|---|
| `<Callout type="info\|warn\|success\|danger" title>` | `<Aside type="note\|caution\|tip\|danger" title>` (warn→caution, success→tip) |
| `<CodeTabs>` + `tab="..."` fences | `<Tabs><TabItem label="...">` (import from `@astrojs/starlight/components`) |
| `<Decision title status>` | keep — local `Decision.astro`, add import |
| `<HtmlBlock>` | drop — inline the content or link it |
| code meta `showLineNumbers=false` / `startLine=N` | drop (Expressive Code defaults); keep `title="..."` |

Add required frontmatter (`title`, `description`) where missing. `status: proposed|rejected` from old Decision blocks maps to frontmatter only if the whole doc is one decision.

## Step 5 — verify

```bash
cd docs && npm run build
```

Build must exit 0. Check `dist/llms.txt` exists and lists the design docs. A doc with `draft: true` must NOT appear in `dist/` nor any `llms*.txt`.

## Step 6 — offer project rule

Offer `/promote-rules`: project rule (`paths: docs/**, plans/**`) pointing at `astro-docs-authoring`, so a cold session in the repo knows the dialect without re-deriving.
