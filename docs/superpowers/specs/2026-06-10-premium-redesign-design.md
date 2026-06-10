# Premium Redesign — Design

A four-part redesign of the timer app: persistent timers, a consolidated Timer
page, a full SVG icon system, and an Apple-like typographic/layout pass. Each part
is independently shippable and lands as its own commit.

## 1. Persistent timers — Spotify-style mini-player

### Problem
The timer engine (`useTimerEngine`) currently runs *inside* `RunScreen`, a
`fixed inset-0 z-50` overlay rendered by `RunProvider`. Pressing ESC or navigating
calls `onClose()`, which clears the spec, unmounts `RunScreen`, and destroys the
engine — the run stops entirely. The user wants ESC to let them browse the
dashboard while the timer keeps running, like Spotify's mini-player.

### Architecture
Hoist the engine out of `RunScreen` into a new always-mounted `ActiveRun`
component rendered by `RunProvider` (which sits above the router in the tree, so it
never unmounts on navigation):

- `RunProvider` keeps `spec`/`minimized` state and renders
  `{spec && <ActiveRun spec onClose onAgain />}` alongside `{children}`.
- `ActiveRun` owns `useTimerEngine`, the session-logging refs, mute state, and the
  `minimized` flag. It renders `<RunScreen … />` when expanded or `<MiniPlayer … />`
  when minimized — both presentational, both fed the same engine + handlers.
- `RunScreen` and `MiniPlayer` no longer own the engine; they receive
  `engine`, `spec`, `muted`, `onMinimize`, `onStop`, `onAgain` as props.

### Interaction
- **ESC** or a header **minimize** control collapses the full view to the
  mini-player. The engine keeps running. Dashboard becomes interactive.
- **Mini-player** (pinned bottom-right, above content, below modals): phase-color
  dot, label, `remaining` time, play/pause, expand affordance, and Stop. Clicking
  the body re-expands to full screen.
- **Stop** is the only action that ends + logs the run (`exit()` →
  `logRun(false, …)` if not done, then `onClose()`). Navigation no longer ends runs.
- Space / ArrowLeft / ArrowRight keyboard controls stay; ESC now minimizes instead
  of exiting.

### Out of scope
Surviving a hard browser refresh (would require serializing engine timing/alarms
and rehydrating against wall-clock — significantly more complex than the stated
in-app-navigation need).

## 2. Merge Focus + Quick → one `/timer` page

`Focus.tsx` (Pomodoro) and `QuickTimer.tsx` (simple/interval) share `useRun()` and
differ only in input configuration. Consolidate into a single `Timer.tsx` page at
`/timer` with a segmented control: **Pomodoro · Focus block · Interval**.

- Pomodoro tab = current Focus builder (loads/saves Pomodoro config in settings,
  `trackMode: 'focus'`).
- Focus block tab = QuickTimer's simple mode.
- Interval tab = QuickTimer's interval mode.
- Routing: add `/timer`; redirect `/focus` and `/quick` → `/timer` so old links and
  any bookmarks keep working.
- Sidebar Tools: replace "Focus" with "Timer". Mobile nav: replace Focus with Timer.
- Remove the two bottom-of-Today buttons (`🍅 Focus`, `⚡ Quick Timer`) — they were
  the redundant entry points.

## 3. SVG icon system — Lucide

Install `lucide-react` (tree-shaken, minimal, closest free analogue to SF Symbols).

### Chrome icons
Replace every UI-chrome emoji with a Lucide component, routed through a small
central `client/src/lib/icons.tsx` (or `.ts`) that re-exports the named icons used
across the app, so swaps are one-line. Affected: `Layout.tsx` (nav + logo + mobile
nav), `RunScreen.tsx`/`MiniPlayer` (play/pause/skip/mute/close/minimize/check),
`TodayView.tsx` (streak, hide), `TaskRow.tsx` (hide), `QuickAdd`/add buttons (plus),
`Settings.tsx` (moon/sun theme, add), `Progress.tsx` (streak).

### Habit / group icons (picker)
- Add a `<HabitIcon name>` component that renders a Lucide icon by name and, for
  legacy values still holding an emoji, falls back to rendering the emoji as text.
- Replace the freeform `EMOJI` array in `HabitEditor.tsx` with a curated grid of
  ~24 Lucide icon names (swords, brain, code, book-open, dumbbell, pen-line,
  footprints, music, etc.). The picker writes the icon *name* into the existing
  `emoji` text column — **no schema change**.
- Provide a `LEGACY_EMOJI_TO_ICON` map for the seeded defaults
  (⚔️→`swords`, 🧮→`calculator`, 🧠→`brain`, 💻→`code`, 📖→`book-open`,
  ✍️→`pen-line`, 🏃→`footprints`, 🧘→`flower`, 🎸→`guitar`, 💪→`dumbbell`,
  🥗→`salad`, 🌙→`moon`, ☀️→`sun`, ⏱→`timer`, 📌→`pin`) so existing habits/groups
  render as crisp icons immediately. Display resolution: known icon name → Lucide;
  legacy emoji in the map → mapped Lucide; otherwise → render the stored string
  verbatim.

## 4. Premium typography & layout — Apple-like

Taste-driven; implemented then verified visually via screenshots and iterated.

- **Font:** switch UI to **Inter** (canonical SF substitute), loaded via the
  existing Fontshare/Google `<link>` pattern in `index.html`; keep a mono stack for
  timer digits. Update `tailwind.config.js` `fontFamily.sans`.
- **Tracking:** negative letter-spacing on large headings (Apple display style),
  normal on body.
- **Scale & rhythm:** refined type scale, more generous whitespace/padding, larger
  section headings, larger card radii with softer/subtler shadows, calmer borders.
- Keep the existing Night/Day theme token system and accent variables intact — this
  is a presentational pass, not a token rewrite.

## Implementation order (one commit each)
1. Timer persistence + mini-player (functional core).
2. Merge Focus/Quick into `/timer`.
3. Lucide icon system + habit icon picker.
4. Typography & layout polish.

## Verification
- Per workstream: `npm run typecheck` (client) + `npm test` (server) stay green.
- Live browser drive (throwaway DB, never the real `timer.db`): start a timer →
  ESC → confirm mini-player persists and keeps counting across navigation → expand →
  Stop logs the session. Exercise the merged Timer tabs. Confirm icons render
  (chrome + habit picker, including a legacy-emoji habit). Screenshot the redesigned
  views and iterate on the premium look.
- Deploy to timer.musel.dev after all four land and verify the live site loads.
