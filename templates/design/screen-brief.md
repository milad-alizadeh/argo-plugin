# Screen brief template

The **product spec** for one screen. Authored (in the host repo, e.g.
`apps/desktop/design/briefs/<screen>.md`) BEFORE its wireframe, and read by
BOTH the wireframe stage (`figma-wireframe`) and the hi-fi stage
(`figma-create`). It carries the two things a wireframe deliberately strips
out — **what each region is/does** and **which regions are reusable
components** — so hi-fi rebuilds a real component architecture instead of
reskinning grayscale boxes.

A screen is not started (wireframe or hi-fi) until its brief exists.

Copy the four sections below verbatim; fill them for the screen. Keep it tight
— this is a spec, not a document.

---

## Purpose

One paragraph: what this screen is, who is looking at it, and what they do
here. Name the primary job the screen exists to serve.

## Regions → component map

Every region on the screen, top to bottom, each tagged exactly one of:

- **`composite`** — a reusable, named component with internal structure. This
  is the decomposition hi-fi must build first and compose from; it becomes a
  real component on the `Custom Components` page (and, code-side, a real React
  component). Give it a PascalCase name.
- **`layout`** — a one-off container/arrangement with no reuse (a page grid, a
  spacer column, a section wrapper). Never becomes a component.

Do not tag a region `layout` just because it looks simple — tag by **reuse**:
if the same structure appears on another screen, or is conceptually one "thing"
with a name, it is `composite`.

## Flow / IA

Where this screen sits in the product, and every way in and out: what navigates
TO it, what it navigates to, what triggers each transition. This pins the
information architecture so a soft wireframe flow can't quietly drift.

## Component sub-parts

For each `composite` above, its internal parts and which of THOSE are
themselves reusable composites (nesting is expected). This is what stops a
composite from being built as one flat blob.

## Stage arrangement

**How the regions sit in space** — required for any screen with more than one
content region, because a region map + flow does NOT imply a layout, and a
wireframe drawn without this defaults to a single flat vertical column (every
screen ends up looking like an identical sidebar + stacked main). State
explicitly:

- The **backbone**: master/detail two-pane · persistent split · canvas-dominant ·
  single-surface · dashboard grid. Which region is the master (narrow primary),
  which is the detail (wide, selection-driven), and what a selection in the
  master does to the detail.
- Where **ground truth** (terminal/transcript, if any) lives — inline, docked,
  or full-surface.
- What is **collapsible / resizable / addable** (side panels), and any
  deliberate exception to the app's default grammar (e.g. a canvas that
  dominates instead of sitting in the detail slot).

If a project has a settled cross-screen spatial model, cite it here rather than
re-deriving (e.g. Argo v2's `.claude/plans/stage-arrangement-decisions.md`). One
paragraph or a small labelled ASCII sketch is enough — this is the spec a
wireframe realizes, not prose.

---

## Filled example — `session-rail`

### Purpose

The persistent left rail of the cockpit. Shows every live and parked agent
session as a scannable stack so the operator can see fleet state at a glance and
jump to any session in one click. Always visible; it is the primary navigation
surface of the app.

### Regions → component map

- **`RailHeader`** — `composite`. Project switcher + "new session" affordance.
- **`SessionList`** — `layout`. Scrolling vertical stack of session cards (the
  arrangement is one-off; the cards are the reusable unit).
- **`SessionCard`** — `composite`. One agent session: status, title,
  last-activity, unread marker. The reusable unit of the rail.
- **`RailFooter`** — `composite`. Settings + account affordance.

### Flow / IA

Root-level surface, mounted in the app shell; always present alongside the
stage. Clicking a `SessionCard` selects that session and swaps the stage to
its detail view. "New session" in `RailHeader` opens the session-type picker.
`RailFooter` → settings opens the settings surface over the stage.

### Component sub-parts

- **`RailHeader`** = project-switcher dropdown (`composite`, reused in settings)
  + new-session button (`layout`, kit `Button` instance).
- **`SessionCard`** = status pill (`composite`, reused everywhere a session
  status shows) + title/subtitle block (`layout`) + unread dot (`layout`).
- **`RailFooter`** = avatar (kit instance) + settings icon-button (`layout`).
