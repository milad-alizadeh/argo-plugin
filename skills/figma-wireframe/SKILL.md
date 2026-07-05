---
name: figma-wireframe
description: Author lo-fi wireframes in Figma, layout and information design only, grayscale, no brand styling or design-system token bindings, so every project's wireframes come out the same shape. Use when the user asks to wireframe, sketch a layout, do a layout study, or lay out lo-fi/greybox screens before hi-fi design.
---

# figma-wireframe

Authors lo-fi wireframes to a fixed shape so they read the same across every
project, and stay obviously separate from hi-fi design work. Builds on
`figma:figma-use` for node creation.

## The screen brief is the spec — read it first

A wireframe is a lo-fi **layout expression of a screen's brief**, never the
spec itself. Before wireframing any screen, read its brief (host repo, e.g.
`apps/desktop/design/briefs/<screen>.md`, format in
`templates/design/screen-brief.md`):

- Lay out exactly the regions the brief's **Regions → component map** lists,
  in that order — a `composite` region is one greybox block labelled with the
  component's name (`RailSessionCard`), a `layout` region is its container.
  Wireframe the region NAMES from the brief, so the decomposition survives into
  hi-fi instead of being re-inferred from anonymous boxes.
- Realize the brief's **Flow / IA**: which screen this flows to/from, what each
  affordance triggers. The brief pins the flow; the wireframe shows it.

**No brief, no wireframe.** If a screen has no brief, stop and author the brief
first (or record an explicit decision to skip it for a trivial variation of an
already-briefed screen). A wireframe drawn without a brief is exactly the
failure this guards against: a layout with no product intent, which hi-fi then
traces.

## What a wireframe is (and isn't)

Wireframes are **layout and information design only**: what's on the screen,
where it sits, what state it's in, how it flows to the next screen. They are
never brand design:

- Grayscale only, no brand colors, no design-system token bindings. Wireframe
  pages are exempt from the tier-0 hard gate (`figma-audit`) for exactly this
  reason: they are never synced to code, so unbound fills/strokes are
  expected, not a violation.
- Fixed lo-fi palette, the standard for every project:
  - Background: `#fafafa`
  - Panel: `#f4f4f4`
  - Card/surface: `#ffffff`, stroke `#d8d8d8` or `#cfcfcf`
  - Text: primary `#111111`, secondary `#555555`, tertiary `#999999`
  - Selected state: `#f0f0f0`
  - Pills/tags: `#ececec`

## Frame naming and layout

- Name every frame `WF / <area> · <focus>` (e.g. `WF / Shell · stage + rail`,
  `WF / Onboarding · step 2`).
- Default to 1440x900 for desktop surfaces.
- One concern per frame. A variation on a frame (empty state, error state, a
  different data density) is a **separate frame**, never a stacked/hidden
  state layered inside the same frame.
- Pages follow `templates/design/file-structure.md`: one `W<NN> <group>`
  page per surface group, frames laid out horizontally with 200-240px
  gutters between them. When a page grows past roughly seven frames, split
  the group into a new `W<NN>` page rather than keep piling on.

## Vocabulary discipline

The `Cover` page's design-language legend defines the canonical state names
and marker semantics for the project (see `file-structure.md`). Wireframes
use that vocabulary verbatim: the same word for the same state everywhere,
one visual language per concept. Never invent a synonym or a new marker
convention inside a wireframe page; if the legend doesn't cover a concept
yet, add it to the legend first.

## Iteration rule

Iterate **one thing at a time** with the user. When a frame is superseded,
**delete it** rather than keep it around as a stale variant next to the
current one: dead frames lie about what's current and rot a page fast.

## Auto Layout still applies

Wireframes are cheap to keep structurally sound: use Auto Layout on every
frame-like container, same as hi-fi work. What does **not** apply is
variable binding, colors and type stay as hand-set grayscale hex values from
the fixed palette above, never bound to the Semantic collection.

## Procedure

1. **Read the screen brief** (`design/briefs/<screen>.md`) — no brief, stop and
   author it first. The brief's region map and flow are what you lay out.
2. Confirm the surface group and its `W<NN>` page per `file-structure.md`
   (create the page if it doesn't exist yet).
3. Build each concern as its own `WF / <area> · <focus>` frame, grayscale
   only, Auto Layout, using the legend's vocabulary for any labeled state.
   Label each region with its brief name; keep a `composite` region as one
   named block, not a pre-decomposed pile of atoms.
4. Lay frames out horizontally with 200-240px gutters; split to a new
   `W<NN>` page once a page passes roughly seven frames.
5. When iterating, change one thing, delete superseded frames, never keep
   both.

## Verification

Manual dry-run only, no Figma file lives in this repo to create anything
in. Real verification is a live project actually wireframing a surface with
this skill loaded.
