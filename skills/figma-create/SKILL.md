---
name: figma-create
description: Create a new component or screen in Figma following the design pack's authoring conventions — base instances, Semantic bindings only, Auto Layout, semantic names, D18 variant naming, mode copies for components — then self-audit, visually self-review against design intent, and fix violations before reporting done. Use when the user asks to design/create/mock up a new component or screen in Figma.
---

# figma-create

Creates a component or screen in Figma to the design-pack's authoring
conventions, then **self-audits and fixes before reporting done** (D8: never
hand back a component that would fail its own hard gate). Builds on
`figma:figma-use` and `figma:figma-generate-library` for the mechanics of
node creation, variable binding, and variant-set assembly.

## Authoring rules (what the self-audit checks)

- **Base instances (when the recipe has them) + Semantic bindings only.**
  When the installed recipe's `baseSource` is `external-library` or
  `same-file` with vendored base code, compose from those base component
  instances. Under `baseSource: none` — no base library exists to compose
  from — build components from scratch using Semantic bindings only, no
  base instances to reference. Either way: every fill/stroke/radius/type
  binds the project's Semantic collection — never a Primitive directly
  (§8's library-source distinction), never a literal.
- **Auto Layout** on every frame-like container — no absolute positioning.
  Every non-zero gap/padding field (`itemSpacing`, `paddingLeft/Right/Top/
  Bottom`) must be BOUND to a spacing variable — Primitives `spacing/*`, or a
  Semantic spacing token where one exists (e.g. `spacing/page-inline`) (D24,
  revised 2026-07-05). Never leave spacing as a literal, on-scale or not —
  binding is the only legal authoring state.
- **Semantic names** — never Figma's auto-generated `Frame 12`/`Rectangle 4`
  defaults.
- **D18 variant naming** — component property `Size` → prop `size`;
  Title-Case variant values → lowercase literal unions. Mechanical, not
  judgment: name it this way from the start.
- **Mode copies for components** (D11, generalized to mode copies, 2026-07-05)
  — every component gets one visible instance copy per mode of the project's
  Semantic collection BEYOND the default mode. The component itself renders
  in the default mode; each additional mode gets a copy directly beneath it,
  named `<Component> (<Mode>)`, with the Semantic collection's mode set to
  that mode via `explicitVariableModes`. A single-mode Semantic collection
  (e.g. a dark-only project whose sole mode is "Dark") needs zero copies: no
  hand-maintained duplicates at all until a second mode exists. **Screens do
  NOT get this** — a screen's non-default-mode rendering is a
  `figma-sync`-time capture artifact, never a hand-maintained duplicate
  frame.
- **Screens are composition, not generation** (design doc §6b): a screen
  frame may only contain instances of library/project components + layout
  containers — no loose rectangles/text with raw styles. If an instance
  needed for the screen doesn't exist yet as a component, stop and build
  the component first via this same flow — don't invent one-off styling
  inline in the screen.
- **No variant clipping after `combineAsVariants`** (live defect, 2026-07-05:
  status-pill labels observed truncated — "needs inpu", "interrupte").
  `combineAsVariants` can leave individual variants stretched to a frozen set
  width, clipping their text content. After combining variants AND applying
  Auto Layout to the resulting set: re-assert `layoutSizingHorizontal` /
  `layoutSizingVertical = 'HUG'` on **every variant**, and
  `primaryAxisSizingMode` / `counterAxisSizingMode = 'AUTO'` on the **set**
  itself. Then verify no variant clips: compare each variant's rendered
  width against its text content's natural width (e.g. via
  `get_screenshot`/`get_design_context` per variant) before reporting done.
  Kept as an **authoring rule, not a tier-0 mechanism rule** — detecting
  actual clipping deterministically would need live text-measurement (glyph
  metrics at audit time), which the Plugin API doesn't expose as a plain
  sizing-mode predicate. The candidate signature (a text child under a
  FILL-stretched ancestor at the set boundary) also describes many
  correctly-sized components, so a sizing-mode-only check would carry a high
  false-positive rate without per-node rendered-width comparison, an
  expense tier-0's cheap-check contract doesn't allow.

## Where things go

Page placement follows `templates/design/file-structure.md`, the canonical
file-organization convention: components (and their mode copies) go on the
`Custom Components` page; screens go on their `D<NN> <group>` page, mirroring
the `W<NN> <group>` wireframe page of the same group 1:1.

## Procedure

1. Create the component/screen per the rules above.
2. Call `figma-audit` on the new component(s) — named-component mode, hard
   gate.
3. **Fix every violation it reports before reporting done.** This is the
   self-audit loop: create → audit → fix → re-audit until clean. Never
   report success with a known-outstanding violation.
4. **Visual self-review** (after the audit is clean, before reporting done —
   catches intent-level defects no deterministic rule can encode, e.g. a
   glow color that clashes with its own element's fill even though both are
   individually bound correctly):
   - **Cadence:** one screenshot per component SET (all variants visible
     side by side), `scale: 2`, rendered against the project's real app
     background (e.g. near-black for a dark theme) — never bare Figma
     canvas white. Not per-variant, not per-write, nothing mid-build. Skip
     entirely for a change with no visual delta (renames, variable
     rescoping, doc-frame edits).
   - **Before looking:** restate the design intent in one visual sentence
     (e.g. "the label glows like a small colored light").
   - **Critique checklist**, answered in writing per screenshot: (a) does
     every glow/effect match the color of the element it's attached to? (b)
     does anything blow out, clip, or band? (c) does the material read as
     intended (e.g. glass vs. flat slab)? (d) is text contrast legible? (e)
     is spacing optically even?
   - **Escalate, don't default to it:** a zoomed close-up (`scale: 3`,
     single variant) only when the set-level critique flags a suspicion.
   - **Fix → re-audit → re-screenshot** until the critique passes. A
     shared-style edit late in the task (an effect or text style)
     invalidates earlier captures of every component using that style —
     re-shoot those at the end of the task; untouched components are not
     re-rendered.
   - **Mechanics:** prefer an inline `await node.screenshot({ scale: 2 })`
     inside the same `use_figma` call as the last fix over a separate
     `get_screenshot` round trip — a single script may return 2-3 set
     captures.
5. Report what was created (node names/ids), confirm the audit passed
   clean, write out the visual self-review's critique answers, and attach
   the final screenshots.

## Verification

Manual dry-run only — no Figma file lives in this repo to create anything
in. Real verification is argo-v2 Phase B/D actually invoking this against a
live Figma file.
