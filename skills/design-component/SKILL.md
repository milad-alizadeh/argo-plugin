---
name: design-component
description: Create or edit a component in Figma following the design pack's authoring conventions — base instances, Semantic bindings only, Auto Layout, semantic names, D18 variant naming, a one-line description on every set root — then self-audit, visually self-review against design intent, and fix violations before reporting done. The skill behind the component-create and component-edit playbooks (verb taxonomy: design-* = Figma surface, build-* = code surface). Use when the user asks to design, create, or edit a component in a live Figma file.
---

<!-- INCLUDE: packages/toolkit/packs/design/craft/design-component.md -->
# design-component

Creates a component or screen in Figma to the design-pack's authoring
conventions, then self-audits and fixes before reporting done — never hand
back a component that would fail its own hard gate. Builds on the mechanics
of node creation, variable binding, and variant-set assembly.

## Design intent (aesthetic profile)

If the host project has an `aesthetic-profile.md` in its `design/` directory,
read it before creating anything — it carries the design intent that is not
expressible as tokens (mood, material composition logic, light logic,
reference anchors, motion feel). It references token NAMES only; values still
come solely from the Semantic collection. During visual self-review, re-read
its condensed re-injection block before each critique iteration and critique
against it. No profile file → skip; never invent one.

## Authoring rules (what "good" looks like)

- **Base instances + Semantic bindings only.** The project's design file
  already contains the full shadcn-mirror base component set locally —
  compose from instances of those base components. Every fill/stroke/radius
  binds the project's Semantic collection — never a Primitive directly,
  never a literal. The committed semantic-manifest (~60 semantic token
  names + purposes) is the authoring vocabulary — read it instead of
  enumerating the file's ~1800 local primitives.
- **Typography = a preset text style, never à-la-carte type tokens.** Every
  text node must carry a defined text style from the file's type ramp
  (`Text-<size>/<weight>`, e.g. `Text-sm/Medium`) — discover them and pick
  the one matching the design intent. Never set size/line-height by binding
  raw `fontSize`/`lineHeight` variables directly: a preset bundles size,
  line-height, weight and letter-spacing as one reusable decision, which is
  what keeps typography consistent. Applying a style overwrites those fields
  from the ramp — color still comes from a Semantic fill binding, which the
  style does not touch. `textStyleId` silently clears if `fontName` is set
  after it, so apply the style LAST and re-read it back to confirm.
- **Auto Layout** on every frame-like container — no absolute positioning.
  Every non-zero gap/padding field must be bound to a spacing variable —
  Primitives `spacing/*`, or a Semantic spacing token where one exists. Never
  leave spacing as a literal, on-scale or not — binding is the only legal
  authoring state.
- **Code-friendly names** — never Figma's auto-generated `Frame 12`/
  `Rectangle 4` defaults, and never a vague `box`/`container`/`wrapper`/
  `content` that passes a naming check but says nothing. Every structural
  frame/group carries a role name that maps cleanly to a code identifier:
  kebab-case or camelCase, no spaces (`file-diff-header`, `change-counts`,
  `viewed-cluster`), so the generated component's slots/props inherit those
  names instead of a code author having to invent them. A dynamic TEXT slot
  is named for its ROLE, not the sample content it currently shows — a
  filename slot is `filename`, not `src/auth/guard.ts`; a count slot is
  `change-counts`, not `+12 / -3`.
- **Variant naming** — component property `Size` → prop `size`; Title-Case
  variant values → lowercase literal unions. Mechanical, not judgment: name
  it this way from the start.
- **Icons come from the design system, used AS-IS.** Every icon is an
  INSTANCE of the design file's own icon components — the Lucide set the
  starter ships locally (discover via the file's icon page; instance the
  local component directly, no cross-file import). Never draw an icon as
  ad-hoc vectors, never redraw one, never edit stroke weight or internal
  geometry, and — the observed failure mode — never rebind an icon's
  INTERNAL properties to satisfy binding rules: icon internals keep their
  starter-authored bindings. The only legal touches are the instance's size
  and its top-level color (fills/strokes bound to a Semantic token). No
  suitable icon in the file → pick the closest and flag it in the report; do
  not invent one.
  **Sizing an icon means SCALE semantics, never a bare width/height resize**
  (a live sweep once found 85 icon instances carrying the master's 2px
  stroke at 12-16px sizes): a width/height resize keeps the absolute
  strokeWeight while the glyph shrinks — visually wrong. The Plugin API has
  no scale-tool equivalent, so when placing an icon at a non-native size,
  set `strokeWeight = baseStroke * (size / nativeSize)` on its vectors in
  the same write that resizes it.
- **Icons inside components are SLOTS, not hard-placed glyphs.** When a
  component you author contains an icon, expose it as an INSTANCE_SWAP
  component property so consumers switch the glyph per usage without editing
  the component. A fixed decorative glyph that consumers must never change
  is the only exception, and the report must say so explicitly.
- **Prefer base components over custom builds**: before authoring any
  component, check whether the design file already ships it (the starter's
  shadcn mirrors — Switch, Badge, etc.) — a custom component is justified
  ONLY by something the base set doesn't have. Using a base component means
  using it as-is, not wrapping it for styling.
- **Screens are composition, not generation.** A screen frame may only
  contain instances of library/project components + layout containers — no
  loose rectangles/text with raw styles. If an instance needed for the
  screen doesn't exist yet as a component, stop and build the component
  first — don't invent one-off styling inline in the screen. The
  component-first screen path below sequences this. Inlining a composite as
  loose structure is the reskin-the-wireframe smell to avoid.
- **No variant clipping after combining variants** (a live defect once
  observed: status-pill labels truncated — "needs inpu", "interrupte").
  Combining variants can leave individual variants stretched to a frozen set
  width, clipping their text content. After combining variants AND applying
  Auto Layout to the resulting set: re-assert HUG sizing on every variant
  and AUTO sizing on the set itself. Then verify no variant clips: compare
  each variant's rendered width against its text content's natural width
  before reporting done. This stays an authoring rule, not a mechanical
  check — detecting actual clipping deterministically would need live
  text-measurement the Plugin API doesn't expose as a plain sizing-mode
  predicate, and the candidate signature (a text child under a
  FILL-stretched ancestor at the set boundary) also describes many
  correctly-sized components.

## Code-owned branch

Before building or editing a component, read its `@code-owned` annotation /
registry `kind:"code-owned"` metadata (`registry-lookup --names
'["Name"]'`). This decides which direction the work runs, for both
`component-create`'s `build` stage and `component-edit`'s `edit` stage:

- **Code-owned** (a flat screenshot standing in for a real code
  implementation — a Three.js scene, a canvas viz, anything Figma can't
  faithfully hold): change the code first, then mirror the result back into
  the placeholder screenshot. Never edit the Figma placeholder directly and
  call it done — the code is the real artifact.
- **Not code-owned**: edit Figma-first, as this doc's authoring rules
  describe. Code generation reads the Figma component afterward.

A component with no `@code-owned` marker and no `kind:"code-owned"` registry
entry is Figma-first by default.

## Check before you build (mandatory, not a suggestion)

Before assembling any composite/tree-like region:

0. **PRD Component Bindings first (optional).** If the feature's PRD names
   this region in a `Component Bindings` section, verify the entry once
   (the named component exists, is the right node type, and fits the brief)
   and use it. Absent, or failed verification, fall through to the steps
   below — the flow is standalone; the PRD hint is never required.
1. Consult what already exists first. Read each candidate's usage guidance:
   when a candidate's guidance matches the region/pattern being built, that
   candidate is presumptively THE component — use it (stop-and-ask only when
   multiple candidates' guidance match, or none carries guidance and several
   are plausible).
2. On deciding to build: match the intended component against known names
   and aliases (e.g. `chip`/`tag`/`pill` → `Badge`, `accordion`/`disclosure`
   → `Collapsible`). A match → live-confirm the local component's node and
   variant props before instancing — names are browse hints only; node ids
   are always resolved live, never guessed, reused from memory, or trusted
   from a committed file. Everything is LOCAL to the file — there is no
   cross-file library import.
3. **Stop-the-line:** if live confirmation of a chosen base component fails
   (name not found), stop and report — never fall back to building a custom
   component to route around a missing lookup; that recreates the exact
   duplication this check exists to prevent.
4. **Three-tier guardrail:**
   - **Always** — an existing component whose usage guidance matches the
     region/pattern: use it, no ask needed.
   - **Ask-first** — no candidate's guidance clearly matches (or plausible
     candidates carry none): stop and ask the human to confirm the binding
     before assembling — never silently assemble the region from primitives
     past a candidate, never silently trust a stale bindings entry that
     failed verification.
   - **Never** — invent a component name silently, or auto-create past what
     already exists.
5. The run report should carry a reuse-check line: `reusing base/X` |
   `extending base/X by composition` | `closest base matches A, B —
   insufficient because <concrete reason>, building custom`. This covers the
   extension-by-composition case a hard check alone can't see.

## Component-first screen path (the screen brief is a required input)

A screen is built from its brief, not traced from a layout sketch. The PRD's
ASCII wireframe is layout *intent*; the brief is the spec that names which
regions are reusable components. Read it before touching the screen — no
brief, stop and say so, never infer the decomposition from the sketch's boxes
alone (that IS the reskin-the-wireframe failure this path exists to kill).

**Reference image (optional-but-strongly-recommended brief input).** The
brief should carry a reference image — normally the PRD's ASCII wireframe
(cited or embedded), an annotated sibling screenshot, or the original design.
If the brief has none and the screen isn't a sibling-clone patch, stop and
ask for one — or for explicit permission to proceed prose-only. Never
silently interpret prose alone: the observed fidelity misses were
prose-misread failures.

Build in this order, every time:

1. **Inventory.** From the brief's regions → component map, list every
   composite region (and every composite sub-part). These are the components
   the screen is made of. For each one that's genuinely new, run the
   anti-recreation check above against its proposed name before building
   anything.
2. **Build + register each composite FIRST**, before any screen assembly.
   Each goes through this skill's full component flow — authoring rules,
   self-audit hard gate, visual self-review, registry upsert. A composite
   that already exists is reused as-is, not rebuilt. Only once every
   composite the brief names exists as an audited component do you move on.
   Prefer base components for any region that maps to one; a composite is
   justified only by structure the base set doesn't ship.
3. **Compose the screen region-by-region, with a checkpoint per region.**
   Compose purely from component INSTANCES + layout containers (Auto
   Layout, bound spacing). A region the brief tagged `composite` should
   appear as an instance of the matching component; inlining it as a loose
   container full of atoms is the reskin-the-wireframe smell to avoid. Work
   through the brief's region list in order: after each major region lands,
   take one inline screenshot and fix any visible defect before starting the
   next region — a defect caught at region scope can't compound into the
   assembled screen.

The point of building components first is that the screen becomes a thin
composition sheet — if you find yourself styling anything directly on the
screen frame beyond plain layout containers, a composite is missing: go back
to step 2.

4. **Mark the screen's identity.** A screen frame is a plain FRAME, and
   plain frames are NOT `PublishableMixin` — they have no `description`
   field, so a marker-in-description model cannot be reused. Screen identity
   lives instead on a Dev Mode annotation.
5. **Report DRAFT, request verification — never done on your own pass.**
   Under a supervising session, report draft and request blind
   verification; apply its findings and re-check before reporting done.
   Standalone, never self-verify and self-approve: present the draft
   screenshot to the human for review or explicit draft-state acceptance.

## Design-physics gotchas (recurring live-observed failures)

Each is `symptom → cause → exact preventive action`:

- **Icon looks chunky/thin after resizing** → a plain resize (width/height
  override) left the original strokeWeight in place → use the instance's
  Scale action (or set width/height AND strokeWeight together to hold
  `strokeWeight = baseStroke * (size / nativeSize)`).
- **`itemSpacing` silently ignored** → the frame's `primaryAxisAlignItems`
  is `SPACE_BETWEEN`, which computes gaps from available space and
  overrides any set `itemSpacing` → never combine `SPACE_BETWEEN` with a
  bound `itemSpacing`; use `MIN`/`CENTER`/`MAX` with an explicit bound gap
  instead.
- **A variant's width looks frozen after combining variants** → the
  operation snapshots each variant's frame size at combine time → after
  combining, re-assert HUG/AUTO sizing rather than trusting the pre-combine
  sizing to survive.
- **A bound effect's color/opacity resets after rebinding** → binding an
  effect (shadow/glow) to a Semantic color variable resets the effect's own
  alpha channel to the variable's alpha, discarding a previously hand-tuned
  opacity → re-set the effect's opacity explicitly immediately after the
  bind, in the same edit, and verify it in the same read-back.
- **A text node's shared text style silently clears after setting
  `fontName`** → setting `fontName` after applying a `textStyleId` clears
  the style link → always set `textStyleId` LAST, after any `fontName`/size
  changes, and re-read it back to confirm it's still set.
- **A freshly created Auto Layout frame is invisible-on-light /
  blinding-on-dark** → the Plugin API's auto-layout creation leaves Figma's
  default solid white fill in place → set `fills = []` (or the intended
  bound fill) immediately on creation, in the same edit, never a later pass.
- **A base-component instance permanently fails the override check with no
  edit you recognize** → an explicit variable mode was set on that instance
  at some point, and the override history persists even after clearing the
  value back to `{}` → never set an explicit variable mode on a
  base-component INSTANCE (the owner mandate forbids explicit variable
  modes anywhere); if it already happened, recreate the instance — clearing
  the value does not clear the override history.

## Where things go

Components go on the `Custom Components` page; screens go on their `D<NN>
<group>` page. Category placement is a rubric-driven, deterministic lookup —
resolve the component's category, validate it against the app's configured
category enum (an out-of-enum category is a stop-and-ask, never a silent new
bucket), then place it in that category's shelf frame; the frame's own
layout does the rest — never compute a column/row position by hand.

**Description**, set once: one-line purpose plus category ONLY. Never write a
status word into the description (status is registry-side lifecycle state,
never in-file).

**Usage marker — mandatory on every component you author.** Add a one-sentence
usage note: which region/pattern this component is the solution for (e.g.
"the children-tree section of a session detail screen"). This is what makes
the resolution index self-describing later — a later designer resolving
components reads it instead of guessing among look-alikes.

**Code-owned placeholders.** When a component is a flat screenshot standing in
for something whose real implementation is code (a Three.js/WebGL scene, a
canvas viz — anything Figma can't faithfully hold), mark it as code-owned with
the path to its real implementation. This is the single source of truth for
the code↔design link, and it makes the component exempt from binding rules (a
screenshot can't satisfy them) and tells code-generation to import the
existing component instead of generating one.

## Efficiency (round-trips are the cost driver)

Each Figma tool call is a full round trip — observed live runs spent most of
their wall-clock on call COUNT, not call size. Batch several logical
operations per call (build a whole variant, or several small variants, per
call — never one property per call). Capture verification screenshots inline
in the same call as the last fix instead of a separate round trip. Cap the
visual self-review at two fix→re-shoot iterations unless the critique found a
concrete defect.

**Read protocol — token-optimized read first.** To inspect any node, read its
pre-resolved design context first. The lightweight id/structure map is the
FALLBACK only, for when that result is too large — use it to narrow, then
re-fetch only the specific node(s) you need. Never dump a whole page or heavy
frame — that has overflowed a live session before; target a node id and
narrow a large subtree before reading.

## Visual self-review (after the mechanical audit is clean, before reporting done)

This is the step that catches intent-level defects no deterministic rule can
encode — e.g. a glow color that clashes with its own element's fill even
though both are individually bound correctly. Mechanical/numeric checks
(hug-overflow, touch-target sizing, contrast, bound-spacing gaps, icon
stroke-thickness) are somebody else's job by the time you get here; this
review covers only composition, mood, and intent-level judgment.

- **Cadence: the montage is the mandatory deliverable, not the prose.** One
  screenshot per component SET (all variants visible side by side), rendered
  against the project's real app background (e.g. near-black for a dark
  theme) — never bare Figma canvas white. Not per-variant, not per-write,
  nothing mid-build. Skip entirely for a change with no visual delta
  (renames, variable rescoping, doc-frame edits).
- **Before looking:** restate the design intent in one visual sentence (e.g.
  "the label glows like a small colored light"). If the project has an
  aesthetic profile, re-read its condensed re-injection block first and
  critique against it. Include the fixed question: did I search for an
  existing composite/design-system component before hand-assembling any
  region from primitives? If not, go back to "check before you build" before
  reporting done.
- **Escalate, don't default to it:** a zoomed close-up (single variant) only
  when something looks suspicious.
- **Mechanics:** prefer an inline screenshot call inside the same write call
  as the last fix over a separate round trip — a single script may return
  2-3 set captures. A shared-style edit late in the task (an effect or text
  style) invalidates earlier captures of every component using that style —
  re-shoot those at the end of the task; untouched components are not
  re-rendered.
- Report what was created (node names/ids), confirm the mechanical checks
  and geometry are clean, note the visual review's findings (or that it
  wasn't spawned because there was nothing to check), and attach the final
  montage screenshot.

## Recording the audit

The named audit procedure (see `figma-audit`'s craft doc for the full
prepare → bundle → run sequence) ends with a receipt, not just a clean
in-session result. After `use_figma` returns the violations array:

```
argo design record-audit-receipt --record '{"componentNames":["Name", ...],"violations":[...],"nonce":"<nonce>"}'
```

The `nonce` is one-time and minted by the same `bundle-design-rules-audit`
call that produced the bundle the audit ran — it comes back in that call's
own JSON output. A receipt submitted without the matching nonce is refused:
this is what stops a session from hand-writing a "clean" receipt without a
real bundled audit having run against exactly the components it claims.

## Registry card refresh

`component-edit`'s `registry-card` stage keeps an existing custom component's
registry card current after an edit:

```
argo design refresh-card --component <Name>
```

This re-fetches the live Figma component, re-derives `variantMatrix` and
`whenToUse`, re-stamps `lastSyncedAt`, and writes back the one named entry.
It refuses to create a new entry — a brand-new component's card is written
once by `component-create`'s `registry-card` stage (the create flow), never
by `refresh-card`.

## Instance impact

`component-edit`'s `instance-impact` stage is read-only: after the card
refresh, enumerate every INSTANCE of the edited component across the file
(`query('INSTANCE[mainComponent=<id>]')`, or `findAll` filtered to
`type === 'INSTANCE'` and matching `mainComponent.id`) and report which
screens/pages they sit on. This never edits anything — it's a blind
spot-check so the human ship call knows the edit's blast radius before
signing off, not a trigger for further changes in this run.
<!-- /INCLUDE -->
