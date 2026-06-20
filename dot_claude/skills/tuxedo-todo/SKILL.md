---
name: tuxedo-todo
description: Use whenever the user asks "what's pending / what's left / any todos", when the working repo has a todo.txt at its root, or when the user mentions tuxedo. Surfaces unfinished durable tasks, marks them done, and adds new ones via the tuxedo CLI (a keyboard-driven TUI/CLI for the todo.txt format). Keeps each repo's cross-session obligations from being lost after context compaction.
---

# Tuxedo todo (per-repo todo.txt)

`tuxedo` is a fast, keyboard-driven TUI **and** scriptable CLI for the standard
[todo.txt](https://github.com/todotxt/todo.txt) format
([webstonehq/tuxedo](https://github.com/webstonehq/tuxedo)).

**The todo list is per-repo.** Each repository keeps its **own** git-tracked
`todo.txt` at its root — that file is the durable memory for *that project's*
multi-session obligations: things that must survive context compaction and a
fresh session. There is no global/shared list; work only on the current repo's
`todo.txt`.

## todo.txt format (what to parse)

One task per line. Examples:

```
(A) 2026-06-19 Restore library from backup +project @context due:2026-06-22
x 2026-06-20 2026-06-19 Restore library from backup +project @context
```

- `x ` prefix  → **DONE** (first date after `x` = completion date).
- `(A)`–`(Z)`  → priority. `(A)` = do first.
- leading `YYYY-MM-DD` → creation date.
- `+project`   → project tag.
- `@context`   → context tag.
- `due:YYYY-MM-DD` → deadline.

**Incomplete = any non-blank line NOT starting with `x `.**

## When triggered

1. Look for `todo.txt` at the **root of the current repo** (the git toplevel).
   If the working dir is not a git repo, or there is no `todo.txt` at its root,
   say so and stop — do not create one unprompted and do not fall back to any
   other directory.
2. List **incomplete** lines (skip `x `-prefixed and blank), highest priority
   first ((A) before (B) before unprioritized). Show due dates; flag any `due:`
   past today.
3. Remind concisely. Example:
   > Pending todo (2): (A) Restore library from backup; (B) verify restore.
4. Nothing incomplete → say "todo clear" and stop. Do not nag.

`tuxedo ls` prints the list directly; run it from the repo root (it reads
`./todo.txt`, or `$TODO_FILE` if that repo's tooling sets it). Prefer it over
hand-parsing when the binary is on PATH.

## Marking done

Never silently edit the list. When the user confirms a task is finished (or you
just completed work that clearly matches an open line), OFFER to mark it:

- Preferred: `tuxedo do <n>` (n = line number from `tuxedo ls`).
- Or edit the file directly: prefix the line with `x ` + today's date, e.g.
  `x 2026-06-20 2026-06-19 Restore library from backup +project @context`.

## Adding tasks

`tuxedo add "Do the thing +project @context due:YYYY-MM-DD"` (run from the repo
root), or append a todo.txt-format line directly. Keep the leading creation date.

## Interactive use

Bare `tuxedo` launches the TUI (vim-style keys, themes, search, command palette).
That is for the human — in an agent loop use the one-shot CLI subcommands
(`ls`, `add`, `do`) so output is scriptable.

## Committing

The repo's `todo.txt` is committed alongside its code: treat changes (new tasks,
completions) like any other edit — stage/commit when the user commits that repo.
Do not commit on your own unless asked.
