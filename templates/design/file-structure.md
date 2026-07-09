# Figma file organization (canonical page structure)

Every argo project's Figma design file uses the same page shape, so any
agent (or human) can find "where does X live" without re-deriving it per
project. This is the single source of truth for that shape: `figma-create`
and (eventually) `setup-design`'s install-time scaffolding
point here instead of restating it.

## Page order

1. **`Cover`**: file title, one-line purpose, and the project's
   design-language **legend**: canonical state/vocabulary names, marker
   semantics (what a dot/badge/color means), anatomy contract for recurring
   composite patterns. The legend is the consistency contract every other
   page is checked against, every design page uses its vocabulary
   verbatim, never a synonym invented in the moment.
2. **`──── Designs ────`**: divider page, name only, no content.
3. **`D01 <group>`, `D02 <group>`, …**: one page per surface group,
   numbered sequentially. Hi-fi screens here are
   composition only: component instances and layout containers, never loose
   rectangles or raw styles (figma-create's screen rule).
4. **`Custom Components`**: every project-owned component, plus imported
   raster assets named `asset/<name>`. This is the only page components live
   on; a screen never hosts a component definition inline.

   **Category shelves (design-memory-placement.md Mechanism 1).** Within
   this page, each category in the app's `design.<app>` block's
   `componentCategories` (in `.claude/argo.json`)
   (a closed, project-defined enum — see `packages/figma-design-kit/
   component-categories.js`) is rendered as its own named **Auto-Layout
   WRAP frame**: `layoutMode: 'HORIZONTAL'`, `layoutWrap: 'WRAP'`, a FIXED
   `itemSpacing` (never `SPACE_BETWEEN` — it swallows a set `itemSpacing`,
   see the R6 gotcha in `figma-create/SKILL.md`). Placement is one
   deterministic op: `appendChild` the new/moved component to the frame
   resolved as a pure function of its category — never coordinate math, a
   bare `SECTION` can't Auto Layout so any "next slot" instruction would
   overlap the moment a human rearranges a neighbor or a component resizes.
   A project with no `design.componentCategories` configured defaults to the
   thin `['primitive', 'composite']` enum; the mode copies of a component sit
   in a vertical Auto-Layout directly beneath it, inside the same shelf.

   **Category rubric.** Ambiguous cases default to the MORE GENERAL category
   — the registry pins the final choice once assigned, it doesn't need to be
   perfect at creation time. Worked examples over a sample domain set
   (`rail`, `controls`, `status`, `foundation-atoms`):
   - `status-pill` → `status` (communicates a state, not an input).
   - `rail-session-card` → `rail` (serves the cockpit's session rail surface).
   - `button` → `controls` (a generic interactive primitive, not tied to one
     surface).
   - A component with no clear surface owner → `foundation-atoms` (the
     catch-all; more general than guessing a surface it doesn't yet serve).

   **Revisit trigger.** When `Custom Components` exceeds ~30-40
   project-owned components, revisit per-category PAGES instead of shelves
   on one page — a numeric threshold, not a per-agent judgment call. Below
   that, per-category pages fragment the node-id namespace (the audit
   reconcile sweep would need to traverse N pages instead of one `findAll`)
   for no benefit at this scale.

   **`unsectioned-component` advisory rule** (kept, repointed at the shelves,
   `figma-audit`): any top-level component on this page that isn't a child
   of a category shelf frame is flagged advisory — never blocking, it's the
   reconciliation for a human manually rearranging components.
5. **`Foundations`**: the token sticker sheet (a rendered swatch/type-scale
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
- The `D` prefix is always two digits (`D01`, not `D1`) so the page list
  sorts correctly past nine groups. (Legacy `W##` lo-fi pages from before the
  wireframe stage was retired may still exist in older files; they are
  tier-0-exempt and no longer authored.)
- Group names after the prefix are the surface's plain-English name
  (`D01 Shell`), not a ticket id or component name.

## Setup-time scaffolding (TODO, not yet implemented here)

`setup-design`'s install flow could create this page skeleton (`Cover`, the
divider, an empty `Custom Components`, an empty `Foundations`) in a
freshly-connected Figma file at setup time, before any `D` pages exist.
Not implemented in this change, owned by whoever next touches
`setup-design`'s install-time steps.
