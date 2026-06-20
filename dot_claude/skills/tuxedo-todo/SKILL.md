---
name: tuxedo-todo
description: Use whenever the user asks "what's pending / what's left / any todos", when the working repo has a todo.txt at its root, or when the user mentions tuxedo/todos. Read and edit the repo's todo.txt directly (in todo.txt format) to surface unfinished tasks, mark them done, and add new ones. Keeps each repo's cross-session obligations from being lost after context compaction.
---

# Per-repo todo.txt (tuxedo format)

The todo list is a plain **`todo.txt`** at the **root of each repo**, git-tracked,
in the standard [todo.txt](https://github.com/todotxt/todo.txt) format. It is the
durable memory for *that project's* multi-session obligations — things that must
survive context compaction and a fresh session. There is no global/shared list;
work only on the current repo's `todo.txt`.

**Claude does NOT run the `tuxedo` binary.** `tuxedo` is an interactive TUI for the
*human* to review/edit the list quickly — not an agent tool. Claude reads and edits
`todo.txt` **directly as a file**, following the format below exactly so the user's
`tuxedo` view stays correct.

## todo.txt format (follow exactly)

One task per line:

```
(A) 2026-06-19 Restore library from backup +project @context due:2026-06-22
x 2026-06-20 2026-06-19 Restore library from backup +project @context
```

- `x ` prefix  → **DONE**. The date right after `x` is the completion date; the
  next date is the original creation date (kept). Format: `x <done-date> <created-date> <text>`.
- `(A)`–`(Z)`  → priority, leading. `(A)` = do first. Drop the priority when marking done.
- leading `YYYY-MM-DD` (no priority) → creation date.
- `+project`   → project tag.
- `@context`   → context tag.
- `key:value`  → metadata extension. Recognized keys:
  - `due:YYYY-MM-DD` → deadline (used for sort + due-bucket grouping).
  - `rec:[+]N{d,b,w,m,y}` → recurrence (d=day, b=business day, w=week, m=month,
    y=year). `+` = strict, anchored to the previous `due:`; no `+` = computed from
    completion date. On completion, the **tuxedo binary** inserts a fresh copy with
    `due:` advanced — see caveat under "Marking done".
  - `t:YYYY-MM-DD` or `t:-Nd` → threshold/start; hides the task until then
    (`t:-3d` = until 3 days before `due:`).
  - Other arbitrary `key:value` pairs are allowed and preserved.

Dates are ISO 8601 (`YYYY-MM-DD`). Natural-language input (e.g. "tomorrow",
"monthly", "high priority") is a **tuxedo TUI** convenience for the human; Claude
always writes the canonical form above.

**Incomplete = any non-blank line NOT starting with `x `.**

## When triggered

1. Find `todo.txt` at the **root of the current repo** (git toplevel). If not a
   git repo, or no `todo.txt` at its root, say so and stop — do not create one
   unprompted and do not look elsewhere.
2. Read the file. List **incomplete** lines (skip `x `-prefixed and blank),
   highest priority first ((A) before (B) before unprioritized). Show due dates;
   flag any `due:` past today.
3. Remind concisely. Example:
   > Pending todo (2): (A) Restore library from backup; (B) verify restore.
4. Nothing incomplete → say "todo clear" and stop. Do not nag.

## Marking done

Never silently edit the list. When the user confirms a task is finished (or you
just completed work that clearly matches an open line), OFFER to mark it, then
edit the line in place: prefix `x ` + today's date, keep the original creation
date and text, drop any `(X)` priority. E.g.:

```
(A) 2026-06-19 Restore library +backup @manga   →   x 2026-06-20 2026-06-19 Restore library +backup @manga
```

**Recurrence caveat:** auto-spawning the next occurrence of a `rec:` task on
completion is a *tuxedo-binary* behavior. Claude edits the file directly, so it
will NOT happen automatically. If you mark a `rec:` line done by hand, also append
the next occurrence (creation = today, `due:` advanced per `rec:`) — or leave that
task for the user to complete in tuxedo so recurrence fires.

## Adding tasks

Append a new line in format, leading with today's creation date and any
priority/`+project`/`@context`/`due:` the task needs:

```
(B) 2026-06-20 Verify restore integrity +backup @manga due:2026-06-22
```

## The tuxedo binary (user only)

The user may run `tuxedo` (TUI) or `tuxedo ls` for a fast review of the same file
— vim-style keys, themes, search. That is their convenience tool; Claude never
invokes it. Just keep the file format clean so that view renders correctly.

## Committing

The repo's `todo.txt` is committed alongside its code: treat changes (new tasks,
completions) like any other edit — stage/commit when the user commits that repo.
Do not commit on your own unless asked.
