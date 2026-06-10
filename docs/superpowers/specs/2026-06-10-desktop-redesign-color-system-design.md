# Desktop Redesign + Color System — Design

The app's desktop layout reads as "not designed for desktop": content sits in a
narrow left column (`max-w-3xl`) inside a centered `max-w-6xl` shell, stranding a
sea of empty space on the right, with habit labels and duration chips pushed to
opposite edges. The palette is flat near-monochrome cards — "dead." This redesign
adds a vibrant-but-professional color/gradient system, a proper desktop layout
shell, a real Today dashboard, and brings every tab onto the shared system. Both
Day (light) and Night (dark) themes are polished. Mobile remains fully supported
(single-column, bottom nav).

## Decisions (from brainstorming)
- **Vibrant gradients + per-category colors** — rich palette, gradient surfaces,
  each habit/section tinted with its own hue.
- **Two-column dashboard, habits as cards** — desktop fills the width with grids;
  collapses to single column on mobile.
- **Both themes equally polished.**

## A. Color & gradient system

### Per-category palette (`client/src/lib/palette.ts`)
- Define ~8 hues as RGB triples: violet, blue, cyan, teal, green, amber, rose,
  indigo (each `{ name, rgb: 'R G B' }`).
- `habitColor(id: string)` → a stable palette entry via a small string hash of the
  id, so each habit keeps a consistent color across loads with no DB change.
- Helpers to produce inline styles from a palette entry: a soft tint background, a
  gradient (`linear-gradient(135deg, …)`), and the solid color — used for icon
  chips, done chips, and card accents. Inline styles (not Tailwind classes) so we
  don't generate dozens of per-color utilities.

### Gradients, surfaces, depth (`client/src/index.css`, `tailwind.config.js`)
- **Page background**: a subtle fixed gradient (faint accent tint → base) per theme
  via a `body`/`#root` background-image, replacing the flat `bg-ink-900`.
- **Gradient hero**: a reusable `.hero` surface (accent→second-hue gradient, rounded,
  soft inner border) for page headers.
- **`.btn-accent`**: gradient fill (`from-accent` to a lighter shifted accent) with a
  soft accent-tinted shadow/glow.
- **`.card`**: gradient surface (subtle top-down lightening) + layered shadow +
  refined border, tuned separately for Night and Day so neither looks washed out.
- Keep the existing accent CSS-var system and theme tokens; add gradient tokens.

## B. Layout shell (`client/src/features/Layout.tsx`, `index.css`)
- Remove the centered `max-w-6xl` wrapper around the whole shell. Instead:
  - `aside` (sidebar) **pinned to the left edge**, slightly wider (`w-60`), with a
    subtle gradient/again surface and the active item using an accent gradient pill.
  - `main` = `flex-1`, containing an inner `mx-auto max-w-6xl` content container with
    consistent horizontal padding. On wide monitors the sidebar hugs the left and
    content centers in the remaining space — no dead right margin.
- **Shared page wrapper** component `PageHeader`/`Page` (or a documented class
  convention) giving every tab the same width, padding, and header rhythm, replacing
  the per-view `max-w-xl|3xl|5xl|none` jumble. Target content width: `max-w-6xl` for
  dashboard views, with forms (Timer, Settings) centered narrower inside it.
- Mobile (`< md`): sidebar hidden, bottom nav retained, all grids collapse to one
  column.

## C. Today dashboard (`client/src/features/tasks/TodayView.tsx`)
- **Gradient hero header**: greeting + date, and colorful stat pills (streak with
  Flame, sessions, minutes) each tinted a supporting hue.
- **Responsive dashboard grid** below the hero:
  - **Tasks** panel (add/list, hide/unhide preserved exactly as today).
  - **Habits as a card grid** — each habit a card with its category-colored icon chip
    (gradient), name, optional group, and duration chips; done chips render in the
    habit's category color. Hide-for-today control preserved.
  - `lg`: two columns (Tasks + Habits, or Tasks spanning with Habits grid beneath —
    whichever reads best at implementation, verified visually). `< lg`: single column.
- Reuse/unify with the existing Dashboard `HabitRow` card pattern so Today and Habits
  share one habit-card component.

## D. All other tabs onto the system
Each keeps its current behavior; only layout/visual treatment changes, verified in
both themes and at desktop + mobile widths:
- **Week** (`WeekBoard.tsx`): colorful day cards, today highlighted with a gradient;
  consistent spacing in the shared wrapper.
- **Month** (`MonthCalendar.tsx`): today and activity days colored; roomy grid.
- **Inbox** (`Inbox.tsx`): shared wrapper width, richer empty state.
- **Timer** (`Timer.tsx`): centered form with a gradient session-preview hero; mode
  tabs styled as a segmented control on the new system.
- **Habits** (`Dashboard.tsx`): habit card grid with category colors (shared card).
- **Progress** (`Progress.tsx`): gradient stat cards (each a different hue),
  per-habit bars and heatmap intensity in accent/category colors.
- **Settings** (`Settings.tsx`): shared wrapper, polished theme/accent pickers.

## Constraints / non-goals
- No new DB columns: per-habit colors are derived from the habit id.
- Preserve all existing behavior: timer/mini-player, hide-for-today, task CRUD,
  habit icon picker, theme/accent switching.
- Keep `lucide-react` icons and Inter typography from the prior redesign.

## Build order (commits)
1. Color & gradient system + layout shell (tokens, palette, `.card`/`.btn`/`.hero`,
   page background, sidebar/main restructure, shared wrapper).
2. Today dashboard + shared habit card (and adopt it in Habits/Dashboard).
3. Remaining tabs (Week, Month, Inbox, Timer, Progress, Settings) polish.

## Verification
- `npm run typecheck` + `npm run build` (client) green; server `npm test` green.
- Live drive on a throwaway DB (never the real `timer.db`): screenshot every tab in
  **both** Day and Night themes, at desktop and mobile widths; confirm no dead-space
  column, habit cards render with category colors, gradients show, 0 console errors.
- Deploy to timer.musel.dev and confirm the live site loads.
