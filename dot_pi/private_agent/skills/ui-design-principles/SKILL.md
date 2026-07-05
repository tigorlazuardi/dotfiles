---
name: ui-design-principles
description: Core web design principles — design as little as possible, Gestalt grouping (similarity/proximity), generous white space, design-system tokens, visual hierarchy via size/weight/color, and the creative process (inspiration → incubation → iterate). Use whenever designing a page or section from scratch, deciding layout/structure, emphasizing elements, building a design system, or when a design feels cluttered or unscannable. Sits between frontend-guidelines (user rules, wins) and frontend-design (aesthetics) — this governs structure and hierarchy.
---

# UI Design Principles

Creativity = process, not moment. Connecting existing ideas beats blank-slate invention. Source: Sajid.

## Relationship to other skills (precedence)

Precedence chain when skills pull opposite ways:

1. `frontend-guidelines` — user's durable rules (light-mode default, library-first, feedback + error paths, testing-is-done). Always wins.
2. **This skill** — STRUCTURE: hierarchy, restraint, scannability, design-system discipline.
3. `frontend-design` — VISUAL CHARACTER (distinctive aesthetics, anti-generic).

Not usually in conflict: distinctive ≠ cluttered — apply boldness to the few emphasized elements, restraint to everything else. Product UI leaning ambiguous → scannability/simplicity wins; marketing/landing pages → distinctiveness gets more rope.

- `frontend-stack` = orthogonal tool layer (React + Tailwind + shadcn/ui + Radix + Framer Motion); this skill's token discipline applies ON TOP of those tools.
- Framework stance: the video's "you don't need a CSS framework" advice is REJECTED — follow frontend-guidelines' library-first rule. Design-system principles here are never a reason to hand-roll components.
- Spacing details → ui-spacing. Depth/shadows → ui-depth. Colors/tokens → ui-color-theming. Conversion flows → ux-psychology.

## Rule 1: design as little as possible

Don't start from header/structure/"how many sections" — those drain decisions. Ask: what's the key functionality / main selling point? (Often: heading + input + button.) Design that first; often it's all that's needed. Fewer colors, words, elements. More design ≈ uglier design.

## Rule 2: Gestalt — similarity + proximity

Brain processes the whole before details; design must be scannable in seconds. Group with shape, size, color, spacing. Similar-looking elements read as one group (also cheaper to implement); proximity defines layout. First goal: understandable as a whole, details second.

## Rule 3: more white space than you think

Designer stares at one element — space feels excessive. User scans the whole page — space reads fine. Start with lots of spacing, remove until happy (same start-big rule as ui-spacing).

## Rule 4: design system = few tokens, picked early

- Spacing: values divisible by 4px, expressed in rem (px ÷ 16). System exists for fast picking, not correctness — context decides the value. Never design with lorem ipsum / vague data; spacing perfect for one card is disaster for another.
- Typography: ONE font + a type scale. Line height inversely proportional to font size — smaller text needs larger line height; generous line height doubles as vertical spacing between text elements (skip explicit margins).
- Don't center-align paragraphs or small text.
- Colors: dark + light for text/background + max two personality colors. Legibility over color psychology.
- Key elements first: two link styles + two button styles (primary/secondary action) before any page design.
- Everything as variables/tokens so values are swappable.

## Rule 5: hierarchy is everything

Emphasize what the user looks for FIRST (usually title/key value/primary action) via size, weight, color — but start small; tiny changes carry far. Often emphasis = DE-emphasizing competitors (drop secondary text contrast) rather than boosting the target. Escalation order: reduce competitor contrast → bump weight → bump size. Verify: zoom out — does the key element stand out in a 2-second scan? Semantic tags ≠ visual size: an h3 or p may legitimately render bigger than an h2 — context rules.

Allowed "more design" exceptions: depth/shadows to elevate important elements (→ ui-depth), shadows replacing solid borders, accent color on key actions, subtle gradient instead of flat fill, cards for bland lists/tables.

## Creative process (when stuck or starting fresh)

1. **Basics** — the rules above. Reference books: Atomic Design, Refactoring UI.
2. **Inspiration** — study top-tier real products for the SPECIFIC section being built; note what works as a user (simple, human faces, plain language) and what to avoid.
3. **Incubation** — form initial ideas, then step away; revisit later, better ideas surface. (Not working = stress/sleep problem, not design problem.)
4. **Ship + iterate** — don't fall in love with v1. Show colleagues, then users; adjust on feedback. Finishing something mediocre beats endless planning.
