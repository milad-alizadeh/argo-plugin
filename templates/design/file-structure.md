# Figma file organization (canonical page structure)

Every argo project's Figma design file uses the same page shape, so any
agent (or human) can find "where does X live" without re-deriving it per
project. This is the single source of truth for that shape: `figma-create`,
`figma-wireframe`, and (eventually) `setup-design`'s install-time scaffolding
all point here instead of restating it.

## Page order

1. **`Cover`**: file title, one-line purpose, and the project's
   design-language **legend**: canonical state/vocabulary names, marker
   semantics (what a dot/badge/color means), anatomy contract for recurring
   composite patterns. The legend is the consistency contract every other
   page is checked against, wireframes and designs both use its vocabulary
   verbatim, never a synonym invented in the moment.
2. **`──── Wireframes ────`**: divider page, name only, no content. Marks
   the start of the lo-fi section.
3. **`W01 <group>`, `W02 <group>`, …**: one page per surface group, lo-fi
   wireframes only (see `figma-wireframe`). Frames laid out horizontally
   left to right with 200-240px gutters between them.
4. **`──── Designs ────`**: divider page, name only.
5. **`D01 <group>`, `D02 <group>`, …**: one page per surface group,
   **mirroring the wireframe group names 1:1**: the same group gets the same
   number across both sections (`W03 Onboarding` matches `D03 Onboarding`),
   so the pairing is positional, not just nominal. Hi-fi screens here are
   composition only: component instances and layout containers, never loose
   rectangles or raw styles (figma-create's screen rule).
6. **`Custom Components`**: every project-owned component, plus its D11
   mode copies when the Semantic collection has 2+ modes, plus imported
   raster assets named `asset/<name>`. This is the only page components live
   on; a screen never hosts a component definition inline.
7. **`Foundations`**: the token sticker sheet (a rendered swatch/type-scale
   page over the Primitives/Semantic collections). Kept as its own page, not
   folded into `Custom Components`, because it's a screen-like reference
   artifact (you look at it), not a component (you don't instance it).
   Projects choosing to co-locate it on `Custom Components` instead must say
   so explicitly in the project's own design docs: pick one placement and
   be consistent, never split foundations across both pages.

## Naming rules

- Divider pages use the literal `────` (box-drawing horizontal-rule
  characters) padding, not a plain label, so they read as visually distinct
  from content pages in the page list at a glance.
- `W`/`D` prefixes are always two digits (`W01`, not `W1`) so the page list
  sorts correctly past nine groups.
- Group names after the prefix are the surface's plain-English name (`W01
  Shell`, `D01 Shell`), not a ticket id or component name.

## Setup-time scaffolding (TODO, not yet implemented here)

`setup-design`'s install flow could create this page skeleton (`Cover`, the
two dividers, an empty `Custom Components`, an empty `Foundations`) in a
freshly-connected Figma file at setup time, before any `W`/`D` pages exist.
Not implemented in this change, owned by whoever next touches
`setup-design`'s install-time steps.
