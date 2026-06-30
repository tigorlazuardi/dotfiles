---
name: frontend-stack
description: Build frontend UI in this user's preferred stack — React + Tailwind + shadcn/ui + Radix + Framer Motion, with TanStack Start for SSR. Use whenever building web components, pages, dashboards, forms, or any React UI for this user. Enforces two hard preferences: (1) light mode is the default theme, never ship dark-by-default because it looks bad in demos; (2) library-first — reach for an existing component library and tweak it rather than rolling your own. Pairs with and overrides the generic `frontend-design` skill.
---

This skill encodes a specific user's frontend stack and two non-negotiable preferences. When it conflicts with the generic `frontend-design` skill, THIS wins.

## Stack (fixed)

- **Framework**: React
- **SSR / routing**: TanStack Start (use when SSR/routing needed)
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui (installed via `npx shadcn@latest add <name>`)
- **Primitives / a11y**: Radix (comes bundled inside shadcn components)
- **Animation**: Framer Motion (`motion/react`)

## Hard preference 1 — Light mode default

Dark-by-default looks bad in demos. Always ship light as the default.

- Do NOT put `class="dark"` on `<html>`.
- If a theme provider (e.g. `next-themes`) is present:
  - `defaultTheme="light"`
  - `enableSystem={false}` — system preference can force dark on a dark-set laptop during a demo. Disable it.
- shadcn CSS variables: ensure `:root` (light tokens) is active. A `.dark { ... }` block may exist but must not be applied by default.
- Provide a manual dark toggle only if the user explicitly asks. Default state is still light.

## Hard preference 2 — Library-first

Reach for an existing library and tweak it. Do NOT roll your own when a solved primitive exists.

| Need | Use | Do NOT hand-roll |
|---|---|---|
| Base components (button, dialog, dropdown, sheet, toast) | `npx shadcn add ...` | from-scratch components |
| Behavior / a11y primitives | Radix (via shadcn) | manual focus-trap, manual aria wiring |
| Animation / transitions | Framer Motion | complex manual CSS keyframes |
| Forms | react-hook-form + zod | manual form state + validation |
| Data tables | TanStack Table | manual map + sort + filter |
| Icons | lucide-react (shadcn default) | custom SVG icon set |
| Charts | Recharts (shadcn charts) | hand-drawn SVG charts |
| Date / calendar | react-day-picker (shadcn calendar) | manual date grid |

Only roll your own when: no library covers it, or the library genuinely fights the design. Say so explicitly when you do.

## Animation intensity by context

Always add animation. But tune intensity to the surface — Framer Motion (`motion/react`) for all of it.

**Storefront / marketing / landing — EXAGGERATE.**
- Bold staggered page-load reveals, parallax, scroll-triggered sections.
- Hero entrance with orchestrated stagger (`staggerChildren`, delayed children).
- Hover states that surprise: scale, tilt, glow, image zoom.
- Spring physics, longer durations (0.4–0.8s), generous movement.
- Use `whileInView` + `viewport={{ once: true }}` for scroll reveals.

**Dashboard / app / admin — SUBTLE.**
- Fast, functional, never distracting. Durations 0.12–0.25s.
- Gentle fades, small slides (4–8px), layout transitions on data change.
- `AnimatePresence` for list add/remove, modal/sheet in-out.
- Animated number counters, smooth chart transitions (Recharts handles).
- No parallax, no big scroll theatrics — speed and clarity over spectacle.
- Respect `prefers-reduced-motion` (reduce, don't kill) — but default theme stays light, see above.

If the surface is ambiguous, ask which it is, or default to subtle (safer for demos).

## Every action has feedback (even stubs)

No dead clicks. Every interactive element MUST react — even when the logic behind it is a stub.

- Button/action with no real backend yet → still show feedback: a toast, a loading spinner, a disabled state, an inline message. Never a silent no-op.
- Async actions show pending state (spinner / skeleton / disabled button) then a result state (success or error).
- Stub success path → a clear toast like "Saved (stub)" or similar so the demo reads as alive.
- Forms validate and show field-level feedback immediately.

## Every fallible thing displays its error (even "not implemented")

If an operation CAN error, it MUST have a visible error path — even if the only error today is "belum diimplement" / "Not implemented yet". This forces an error-display mechanism to exist from day one.

**Standard error display — pick by scope:**

| Scope | Mechanism |
|---|---|
| Transient action error (failed save, failed fetch on click) | **Toast** — shadcn `sonner` (`toast.error(...)`) |
| Inline / field-level (form validation, one field) | inline text under the field (react-hook-form error) |
| Section / panel failed to load | inline **error state block** in that panel (icon + message + retry button) |
| Whole route / render crash | **Error Boundary** — TanStack Start route `errorComponent`, or React error boundary fallback |
| Empty / missing data (not an error, but handle it) | explicit **empty state** component |

**Rules:**
- Stub an action → wire `toast.error("Not implemented yet")` (or a localized message) on the not-yet-built branch, not a silent return.
- Every data fetch has three rendered states: loading, error, success. Plus empty when a list can be empty.
- Every route in TanStack Start gets an `errorComponent` (and `pendingComponent`) so a thrown error never shows a blank screen.
- Error messages are human-readable, never a raw stack in the UI (log the stack, show a clean message).
- Install `sonner` early: `npx shadcn add sonner`, mount `<Toaster />` once at root.

## Testing stack (fixed)

Three layers, each a distinct job. Vite-native because TanStack Start is Vite-based.

| Layer | Tool | Job |
|---|---|---|
| Unit / component | **Vitest** + **React Testing Library** | logic, hooks, component render |
| Interaction | **@testing-library/user-event** | click, type, submit |
| Network mock | **MSW** (Mock Service Worker) | mock API; test loading/error/success paths |
| E2E / browser | **Playwright** | real browser flows, multi-browser, screenshots |
| a11y | **jest-axe** (in Vitest) and/or Playwright axe | catch Radix/aria regressions |

Why these: Vitest over Jest (shares Vite config, faster, no extra transform). Playwright over Cypress (free multi-browser, parallel, trace viewer). MSW because the feedback/error rules below need easy error-path simulation without a backend.

**What must be tested (mirrors the UI rules in this skill):**
- Every stubbed action → assert feedback appears (toast / spinner / disabled state). No dead clicks.
- Every data fetch → assert all three rendered states: loading, error, success (+ empty when a list can be empty). Drive error/loading via MSW handlers.
- Every error path → assert the visible message renders (e.g. "Not implemented yet" / localized).
- Light-mode default → assert `<html>` has no `dark` class on initial render.
- Forms → assert field-level validation errors show.
- Key flows → one Playwright E2E happy path per major surface (e.g. browse → add to cart → checkout for storefront; load → filter → act for dashboard).

**Setup reference:**
```bash
npm i -D vitest @testing-library/react @testing-library/user-event \
  @testing-library/jest-dom jsdom jest-axe
npm i -D msw
npm i -D @playwright/test && npx playwright install
```
- Vitest config: `environment: 'jsdom'`, setup file importing `@testing-library/jest-dom`.
- MSW: a `handlers.ts` with default success + per-test `server.use(...)` overrides for error/loading.
- Playwright: separate `e2e/` dir; keep unit and E2E test globs from overlapping.

## Design quality

Inherit the aesthetic guidance from the generic `frontend-design` skill (typography, color, motion, composition, avoid AI-slop) — BUT:
- Theme default stays **light** regardless of what that skill says about "vary between light and dark".
- Achieve distinctiveness by tweaking shadcn tokens (radius, font, accent color, spacing) and adding Framer Motion polish — not by abandoning the library.

## Quick setup reference

```bash
# shadcn init (run once)
npx shadcn@latest init   # pick: light base color, CSS variables yes

# add components as needed
npx shadcn@latest add button dialog dropdown-menu form input sonner

# animation
npm i motion        # Framer Motion -> import from "motion/react"

# forms
npm i react-hook-form zod @hookform/resolvers
```
