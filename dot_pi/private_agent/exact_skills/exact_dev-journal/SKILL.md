---
name: dev-journal
description: >-
  Canonical workflow for the dev journal — the private git repo
  tigorlazuardi/journal cloned at $HOME/journal that logs every notable dev
  moment (feature, fix, design-decision, incident, learning, milestone) across
  all of the user's projects. Use in three modes — (1) RECALL at the start of
  substantive coding/design work in ANY repo: read L0 index.md, surface one
  line of precedent ("kamu pernah X, hasilnya Y"); (2) WRITE when a notable
  moment happens (offer "Journal ini?", then author the entry + update indexes
  + git push); (3) CV/PORTFOLIO mode for "pernah gak saya…" / resume /
  portfolio questions (read skills-inventory.md first). Also triggers on the
  journal-nudge Stop-hook's "DEV-JOURNAL CHECK" message.
---

# Dev Journal

Development journey log. One private git repo, `tigorlazuardi/journal`, cloned at
`$HOME/journal` on every machine, also openable as an Obsidian vault (keep
wikilinks + frontmatter working). Three consumers:

1. **Portfolio / CV** raw material.
2. **Design-precedent recall** — "you built this before, here's how it went."
3. **Cheap cross-check** at task start in any coding session.

The repo's own `CLAUDE.md` holds the structural **invariants** (source of truth if
this skill and it ever disagree — that file wins, it lives with the data). This
skill holds the **workflow**: when to read, when to write, the templates, git sync.

## Structure — 3 levels

```
$HOME/journal/
├── index.md                 ← L0: one line per PROJECT (cheap load surface, ~20 lines)
├── skills-inventory.md      ← skill/tech → proof entries (CV mode reads this first)
└── <project>/
    ├── index.md             ← L1: one line per ENTRY (grep-friendly digest)
    └── YYYY-MM-DD-<slug>.md ← L2: full entry
```

Read top-down, on demand. L0 first (~300 tokens) → matching project's L1 → drill
L2 only when detail needed. Cross-project skill search greps the L1 files
(`*/index.md`), never bulk-reads L2.

`$HOME/journal` missing locally → offer to clone
`git@github.com:tigorlazuardi/journal.git` before recall/write.

---

## Mode 1 — RECALL (task start)

Trigger: starting substantive coding/design work in any repo (the global CLAUDE.md
"task start" rule). Cheap by design — do not skip on cost grounds, but do not drill
L2 unless there's a real hit.

1. `cd $HOME/journal && git pull --ff-only` (stay in sync; skip silently if offline).
2. Read L0 `index.md` (one file, cheap).
3. Project match (same repo, or same subsystem/tech) → read that project's L1
   `<project>/index.md`. Strong hit → drill the one L2 entry.
4. Surface **one line** to the user: `kamu pernah <X>, hasilnya <Y>` + the wikilink.
   No hit → proceed silently, say nothing.

Cross-project by tech instead of project: grep L1 files (see Tag Fallback).

---

## Mode 2 — WRITE (notable moment)

Trigger: a notable moment happened — feature shipped, fix with an interesting root
cause, design decision, incident handled, new tech first used, milestone. Also the
`journal-nudge` Stop-hook's "DEV-JOURNAL CHECK" after a session makes commits.

**Offer, don't auto-write** — quality stays curated. One line: **"Journal ini?"**
Rejected → drop it, no re-nag. Approved → author:

1. **Sync**: `cd $HOME/journal && git pull --ff-only`.
2. **Pick type** (6-type taxonomy, fixed): `feature` · `design-decision` · `fix` ·
   `incident` · `learning` · `milestone`.
3. **Write L2** `<project>/YYYY-MM-DD-<kebab-slug>.md` — frontmatter (all fields) +
   body per the type's template below. Default **English** (portfolio reuse); match
   the user if they dictate content in Indonesian.
4. **Update L1** `<project>/index.md` — add the one-line digest.
5. **Update L0** `index.md` — bump the project's `N entries` + `last <date>`, refresh
   `notable:` hooks if this entry is notable. New project → add its L0 line under the
   right `## <company>` section.
6. **Update `skills-inventory.md`** — any skill new to the inventory gets a row; an
   existing skill gets this entry appended to its proof list.
7. **Link** related entries with `[[wikilinks]]` (same subsystem, superseding
   decision, repeat bug).
8. **Commit + push**: `git add -A && git commit && git push`. An unpushed entry is
   invisible on every other machine — pushing IS the sync.

### Frontmatter (all fields required)

```yaml
---
type: feature | design-decision | fix | incident | learning | milestone
project: <repo-name>
company: <company>          # bareksa | personal | freelance-<client>
date: YYYY-MM-DD
title: <human title>
skills: [go, postgres]
impact: <one line, measurable if possible>
cv_ready: true|false
tags: [journal/entry, type/fix, project/<project>, company/<company>, skill/go, skill/postgres, cv-ready]
---
```

`tags` are **derived + deterministic**: always `journal/entry` + `type/<type>` +
`project/<project>` + `company/<company>` + one `skill/<s>` per `skills` item +
`cv-ready` iff `cv_ready: true`. Tags make each entry self-describing; indexes are a
cache, entries are the source of truth.

### Body templates (by type)

- **fix / incident** — `## Symptom` → `## Root cause` → `## Fix` → `## Lesson`.
  Lesson = the transferable rule, not the diff.
- **design-decision** — mini-ADR: `## Context` → `## Options considered` →
  `## Decision` → `## Why` → `## Outcome` (revisit-later welcome).
- **feature / milestone** — STAR: `## Situation` → `## Task` → `## Action` →
  `## Result`. Keep measurable impact in `Result`.
- **learning** — `## Context` → `## What I learned` → `## How to apply`.

### Line formats (copy exactly)

- **L0** (one per project, under a `## <company>` heading):
  `<project> — <one-line what> {main-tech} · N entries · last YYYY-MM-DD · @<company> · notable: [[<project>/index|<hooks>]]`
- **L1** (one per entry):
  `YYYY-MM-DD <type> <slug> {skills} — <compressed what/lesson/impact>`
- **skills-inventory** (one per skill):
  `- **<skill>** — level: <touched|comfortable|deep> · _<optional gloss>_ · [[<project>/YYYY-MM-DD-<slug>|<hook>]], ...`

---

## Mode 3 — CV / PORTFOLIO

Trigger: "pernah gak saya…", CV/resume drafting, portfolio, "what have I built with
<tech>". Read `skills-inventory.md` FIRST (skill → proof-entries map), then drill the
linked L2 entries whose `cv_ready: true`. L0 `## <company>` sections give the
employer-grouped view.

---

## Invariants (hard rules — from repo CLAUDE.md)

1. **Every entry write updates L1 then L0.** Stale index kills recall.
2. **Company is metadata, never a directory.** Folders stay `<project>/` flat;
   company lives in frontmatter + the L0 `## <company>` section. Project changes
   company → edit frontmatter + L0, never `git mv`.
3. **Filename** `YYYY-MM-DD-<kebab-slug>.md` — no chars that break wikilinks.
4. **Git sync**: pull `--ff-only` before writing; commit + push after every write.
5. **Never edit `.obsidian/`** app state (gitignored, per-machine).
6. Entries default English; 6-type taxonomy is fixed; `project/` tag must match L0
   spelling.

## Tag fallback — when indexes fail

Index missing/stale/contradicts an entry → fall back to tags, then repair the index
(rebuild is always safe — entries are source of truth).

```bash
# 1. discover the LIVE tag vocabulary first (never guess — a synonym miss reads as "no precedent")
grep -rhoE '(type|project|skill|company)/[a-z0-9.+-]+' --include="*.md" $HOME/journal | sort -u
# 2. find by tag (matches frontmatter tags: lines only, never bulk-reads bodies)
grep -rl "skill/redis" --include="*.md" $HOME/journal
```

Rebuild an index deterministically: L1 line per entry from its frontmatter; L0 line
per project from its L1 (company/section from the entries' `company:`, latest entry
wins on conflict).

## Related infra

- `journal-nudge.py` Stop-hook (`$CLAUDE_DIR/hooks/`) fires the "DEV-JOURNAL CHECK"
  once per session that made commits — that's the WRITE-mode trigger.
- Global CLAUDE.md "Dev journal" section wires the task-start recall + notable-moment
  offer + CV recall into every main session.
