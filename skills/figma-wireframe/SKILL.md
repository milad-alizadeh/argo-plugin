---
name: figma-wireframe
description: Author lo-fi wireframes in Figma, layout and information design only, grayscale, no brand styling or design-system token bindings, so every project's wireframes come out the same shape. Use when the user asks to wireframe, sketch a layout, do a layout study, or lay out lo-fi/greybox screens before hi-fi design.
---

# figma-wireframe

Authors lo-fi wireframes to a fixed shape so they read the same across every
project, and stay obviously separate from hi-fi design work. Builds on
`figma:figma-use` for node creation.

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

1. Confirm the surface group and its `W<NN>` page per `file-structure.md`
   (create the page if it doesn't exist yet).
2. Build each concern as its own `WF / <area> · <focus>` frame, grayscale
   only, Auto Layout, using the legend's vocabulary for any labeled state.
3. Lay frames out horizontally with 200-240px gutters; split to a new
   `W<NN>` page once a page passes roughly seven frames.
4. When iterating, change one thing, delete superseded frames, never keep
   both.

## Verification

Manual dry-run only, no Figma file lives in this repo to create anything
in. Real verification is a live project actually wireframing a surface with
this skill loaded.
