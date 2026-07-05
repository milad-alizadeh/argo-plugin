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

## Design intent (aesthetic profile)

If the host project has an `aesthetic-profile.md` next to its
`design/config.json`, **read it before creating anything** — it carries the
design intent that is not expressible as tokens (mood, material composition
logic, light logic, reference anchors, motion feel). It references token
NAMES only; values still come solely from the Semantic collection. During
the visual self-review (step 4 below), re-read its condensed re-injection
block before each critique iteration and critique against it. No profile
file → skip; never invent one.

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
- **Icons come from the design system, used AS-IS** (2026-07-05, backed by
  the tier-0 `hand-drawn-icon` + `kit-instance-override` hard rules): every
  icon is an INSTANCE of the kit library's icon components (discover via
  `search_design_system` or the kit's icon page; import via
  `importComponentByKeyAsync`). NEVER draw an icon as ad-hoc vectors, never
  redraw one, never edit stroke weight or internal geometry, and — the
  observed failure mode — NEVER rebind an icon's INTERNAL properties to
  Primitives/Semantic tokens to satisfy the binding rules: kit internals
  keep their own remote kit bindings, which the audit accepts. The ONLY
  legal touches are the instance's size and its top-level color
  (fills/strokes bound to a Semantic token). Anything else hard-fails the
  gate. No suitable icon in the kit → pick the closest and flag it in the
  report; do not invent one.
- **Icons inside components are SLOTS, not hard-placed glyphs** (2026-07-05):
  when a component you author contains an icon, expose it as an
  INSTANCE_SWAP component property (`addComponentProperty('icon',
  'INSTANCE_SWAP', <defaultIconId>)` + `componentPropertyReferences` on the
  instance) so consumers switch the glyph per usage without editing the
  component. A fixed decorative glyph that consumers must never change is
  the only exception, and the report must say so explicitly.
- **Prefer kit components over custom builds**: before authoring any
  component, check whether the kit already ships it (Switch, Badge, etc.) —
  a custom component is justified ONLY by something the kit doesn't have.
  Using a kit component means using it as-is, not wrapping it for styling.
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
- **Design-physics gotchas (R6)** — recurring live-observed failures, each
  `symptom → cause → exact preventive API action`:
  - **Icon looks chunky/thin after resizing → resize (width/height override)
    instead of proportional rescale left the original strokeWeight in place
    → use the instance's Scale action (or set width/height AND strokeWeight
    together to hold `strokeWeight = baseStroke * (size / nativeSize)`); the
    tier-0 `stroke-scale-mismatch` rule (NEW-3) hard-fails a mismatch and
    doubles as this predicate's post-write check (R3(a) above).**
  - **`itemSpacing` silently ignored → the frame's `primaryAxisAlignItems`
    is `SPACE_BETWEEN`, which computes gaps from available space and
    overrides any set `itemSpacing` → never combine `SPACE_BETWEEN` with a
    bound `itemSpacing`; use `MIN`/`CENTER`/`MAX` with an explicit bound gap
    instead (this is also why category shelf frames use a fixed
    `itemSpacing`, never `SPACE_BETWEEN` — see "Where things go").**
  - **A variant's width looks frozen after `combineAsVariants` → the
    operation snapshots each variant's frame size at combine time → after
    combining, re-assert `layoutSizingHorizontal`/`layoutSizingVertical`
    (see the clipping rule above) rather than trusting the pre-combine
    sizing to survive.**
  - **A bound effect's color/opacity resets after rebinding → binding an
    effect (shadow/glow) to a Semantic color variable resets the effect's
    own alpha channel to the variable's alpha, discarding a previously
    hand-tuned opacity → re-set the effect's opacity explicitly immediately
    after the bind, in the same edit, and verify it in the same
    `get_design_context` read-back.**
  - **A text node's shared text style silently clears after setting
    `fontName` → setting `fontName` after applying a `textStyleId` clears
    the style link (Figma treats the family/weight override as
    de-linking) → always set `textStyleId` LAST, after any `fontName`/size
    changes, and re-read `textStyleId` back to confirm it's still set.**
  - **A freshly `createAutoLayout()`-ed frame is invisible-on-light /
    blinding-on-dark → `figma.createAutoLayout()` leaves Figma's default
    solid white fill in place → set `fills = []` (or the intended bound
    fill) immediately on creation, in the same edit, never a later pass.**
  - **A kit instance permanently fails `kit-instance-override` with no
    edit you recognize → `setExplicitVariableModeForCollection` was called
    on that instance at some point; `instance.overrides` keeps
    `explicitVariableModes` in its override history even after clearing
    the value back to `{}` → never call `setExplicitVariableModeForCollection`
    on a kit INSTANCE (mode copies use it on locally-authored components
    only, per D11); if it already happened, recreate the instance —
    clearing the value does not clear the override history.**

## Where things go

Page placement follows `templates/design/file-structure.md`, the canonical
file-organization convention: components (and their mode copies) go on the
`Custom Components` page; screens go on their `D<NN> <group>` page, mirroring
the `W<NN> <group>` wireframe page of the same group 1:1.

**Category placement (design-memory-placement.md, step 6) — one deterministic
op, no coordinate math:**
1. Resolve the component's category using the rubric in `file-structure.md`.
2. Validate it is a member of `design/config.json`'s
   `design.componentCategories` (`isCategoryInEnum` from
   `figma-design-kit/component-categories`) — an out-of-enum category is a
   stop-and-ask, never a silent new bucket.
3. `appendChild` the component (and its mode copies, in a nested vertical
   Auto Layout beneath it) to that category's Auto-Layout WRAP frame on
   `Custom Components`. That's the entire placement step — the frame's fixed
   `itemSpacing` and `layoutWrap: 'WRAP'` do the rest; never compute a
   column/row position.

**Description (step 7) — set once, batched into the same `use_figma` call
that creates the component:** `component.description = "<one-line purpose>. Category: <category>."`
— purpose plus category ONLY. Never write a status word into the
description (status is registry-side lifecycle state, never in-file — see
`templates/design/memory-model.md`).

**Registry read-order (step 9, cold-start optimization).** Before creating
anything, read `design/registry.json` once (~40 lines) — a cold-start agent
should reach an EXISTING component in ≤3 calls, not 15-20 discovery calls:
1. If the component's name is already in the registry, verify its `nodeId`
   via `getNodeByIdAsync` before touching it — never trust a cached id
   blind.
2. On a `null` result (a common node-id invalidation cause: a
   `combineAsVariants`/variant restructure minted a new `COMPONENT_SET`
   id), `findAll` by name within that category's shelf frame first; found ⇒
   persist the corrected `nodeId` back to the registry and continue; not
   found ⇒ fall back to a full Custom-Components scan once, and report the
   drift in the task output — never silently delete the stale entry.

**Registry upsert (step 8, final step of every create/edit task).** After
the audit is clean: bootstrap `design/registry.json` with the versioned
schema if it doesn't exist yet, then a **single-key** read-modify-write —
re-read the file immediately before writing and merge only this component's
key (never overwrite the whole file from a stale in-memory copy; flat
concurrent designer sessions make last-write-wins a real entry-loss risk).
Entry shape (`RegistryEntrySchema`, `packages/figma-design-kit/schemas.js`):
`{ nodeId, category, status: 'audit-clean', description, provenance: {
createdBy: 'figma-create', lastTask, lastAudit: { auditedAt, clean: true }
} }`. `status` is Figma-side lifecycle ONLY — this skill only ever writes
`audit-clean` (the outcome of its own self-audit loop); `synced`/`coded` are
owned by other skills' outputs and never written here.

## Efficiency (round-trips are the cost driver)

Each `use_figma` call is a full MCP round trip — observed live runs spent
most of their wall-clock on call COUNT, not call size. Batch up to the
10-logical-operation limit: build a whole variant (or several small
variants) per call, never one property per call. Capture verification
screenshots inline (`await node.screenshot()`) in the same call as the last
fix instead of separate `get_screenshot` round trips. Cap the visual
self-review at two fix→re-shoot iterations unless the critique found a
concrete defect. Reuse `design/tier0-audit.bundle.js` if it exists and is
current (the assembler skips rebuilds when the source hash matches) instead
of re-bundling per audit.

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
   - **Numeric predicates FIRST (R3)** — run via `get_design_context` before
     any prose question; a prose-only checklist caught 0/3 real defects
     because it self-grades against restated intent:
     - **(a) icon stroke-thickness match:** the authored icon instance
       beside a bare unmodified kit instance of the same glyph at the same
       px/script must read the same stroke thickness (the tier-0
       `stroke-scale-mismatch` rule already hard-fails this; this is the
       visual confirmation, not a substitute).
     - **(b) bound-spacing match:** the icon-to-title (or equivalent
       adjacent-element) gap equals the bound spacing token's actual value
       — read both back, don't eyeball it.
     - **(c) no clipping/misalignment:** no variant's rendered width is less
       than its text content's natural width; column leading-edges align
       across variants.
   - **Cadence (the montage is the mandatory deliverable, not the prose):**
     one screenshot per component SET (all variants visible side by side),
     `scale: 2`, rendered against the project's real app background (e.g.
     near-black for a dark theme) — never bare Figma canvas white. Not
     per-variant, not per-write, nothing mid-build. Skip entirely for a
     change with no visual delta (renames, variable rescoping, doc-frame
     edits).
   - **Before looking:** restate the design intent in one visual sentence
     (e.g. "the label glows like a small colored light"). If the project has
     an aesthetic profile (see "Design intent" above), re-read its condensed
     re-injection block first and critique against it.
   - **Prose critique** (secondary, non-gating — the montage + numeric
     predicates are the gate), answered in writing per screenshot: (a) does
     every glow/effect match the color of the element it's attached to? (b)
     does anything blow out, clip, or band? (c) does the material read as
     intended (e.g. glass vs. flat slab)? (d) is text contrast legible? (e)
     is spacing optically even?
   - **Escalate, don't default to it:** a zoomed close-up (`scale: 3`,
     single variant) only when the set-level critique flags a suspicion.
   - **Fix → re-audit → re-screenshot** until the numeric predicates, the
     montage, and the prose critique all pass. A shared-style edit late in
     the task (an effect or text style) invalidates earlier captures of
     every component using that style — re-shoot those at the end of the
     task; untouched components are not re-rendered.
   - **Mechanics:** prefer an inline `await node.screenshot({ scale: 2 })`
     inside the same `use_figma` call as the last fix over a separate
     `get_screenshot` round trip — a single script may return 2-3 set
     captures.
5. Report what was created (node names/ids), confirm the audit passed
   clean, write out the numeric predicate results and the prose critique
   answers, and attach the final montage screenshot.

## Verification

Manual dry-run only — no Figma file lives in this repo to create anything
in. Real verification is argo-v2 Phase B/D actually invoking this against a
live Figma file.
