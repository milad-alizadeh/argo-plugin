---
name: design-screen
description: Build out an EXISTING screen (or wave of screens) in Figma autonomously — ONE long-lived designer session works a BUILD-ORDER wave component-first, straight to hi-fi from the PRD, gated by a single hard design-rules audit plus a cheap deterministic instance-presence check and an advisory completeness pass. The design analog of /argo:build-plan. Use when a screen's PRD exists (carrying its HTML wireframe + flow as layout intent) and you want the hi-fi built hands-off; for a single component jump straight to /argo:design-component.
---

<!-- INCLUDE: packages/toolkit/packs/design/craft/design-screen.md -->
# Design a Screen (hi-fi in Figma, single-session, component-first, PRD-driven)

Build a screen whose intent already exists (a PRD, carrying its ASCII
wireframe + flow) into hi-fi Figma, component-first, so it turns cleanly into
code. One long-lived session works a build-order wave component-first,
straight to hi-fi from the PRD — like `build-plan`'s code analog: a wave's
components are built in dependency order, then composed. A fresh context per
component would re-read the inventory every time, which is the expensive way.

## Authoring the brief

`screen-create`'s `brief` stage and `screen-edit`'s `update-brief` stage both
produce `design/briefs/<key>.md`, gated by `brief-check`. Copy
`templates/design/screen-brief.md`'s sections verbatim: Reference image,
Purpose, Regions → component map, Flow / IA, Component sub-parts, Stage
arrangement. Derive the content, don't invent it — the PRD's feature→screen
matrix says what this screen must do, the PRD's ASCII wireframe + flow says
roughly where things sit; the brief turns both into the region list and the
composite/layout tagging the build stage reads.

`brief-check` is structural lint only, never a quality judge: it requires
three headings present verbatim (`Purpose`, `Sections`, `Acceptance
Criteria`, matched case-insensitively) and every backtick-quoted file path in
the brief to actually exist in the repo. The template's richer heading set
(`Regions → component map`, `Flow / IA`, etc.) is the real content — make
sure a literal `Purpose` heading, a `Sections` heading, and an `Acceptance
Criteria` heading are also present so the gate passes; don't rely on the
richer headings alone to satisfy it.

`update-brief` (screen-edit) is a DIFF, not a rewrite: read the existing
brief, diff the PRD's current feature→screen matrix + wireframe against it,
and record what changed (region added/removed/retagged, flow changed, stage
arrangement changed) before editing. `targeted-edits` later reads exactly
that diff to scope its work — an update-brief pass that silently rewrites the
whole file with no record of what changed leaves the edit stage no way to
stay scoped.

## What the PRD owns vs the design layer

- **The PRD is the spec and the completeness oracle.** Its feature→screen
  matrix and `Visible in build?` requirement rows define what each screen must
  DO. The PRD stays PURE semantic — product-owned, durable, independent of
  layout. It does NOT carry component names or arrangement.
- **The component/copy DECISIONS live in the binding manifest; the
  arrangement lives on the frame.** The binding manifest declares which
  registry component realizes each requirement (the decision) — never
  coordinates or arrangement.
- **The PRD's ASCII wireframe + flow is the layout reference** — intent,
  never frozen or verified against. A hand-drawn Figma wireframe is not an
  argo-owned artifact; a human may still produce one out-of-band as an extra
  reference image.
- **A reference image is optional-but-strongly-recommended** on every screen
  brief (the PRD's ASCII wireframe, an annotated sibling screenshot, or the
  original design). If a brief has no reference image and the screen is not a
  sibling-clone patch, stop and ask for one — or for explicit permission to
  proceed prose-only — rather than silently interpreting prose alone. The
  observed fidelity misses were prose-misread failures; when a reference image
  is present, it is the comparison target for any content self-check.

## Deciding first: the binding manifest + copy deck

The two highest-risk decisions — which existing component, and what copy —
are made as a written, checkable artifact, never inside the authoring turn.
Per screen, before touching `use_figma`:

1. One row per PRD requirement/region this screen realizes:
   `requirement → registry component → variant/states → purpose in ONE
   clause`. Resolve each component by reading its `whenToUse` guidance
   (re-read the entry again right before authoring that component). For the
   single highest-risk row (the composite most likely to be confused), list
   the top-2 candidates and pick by `whenToUse` overlap, recording the
   one-line comparison as justification.
2. Copy is authored from the PRD's wave-scoped copy deck section — **from the
   BRIEF/PRD ONLY, BEFORE any canvas read.** All authored canvas text comes
   from this deck; a string the deck doesn't carry means stop and ask, never
   invent filler; a string used in >1 region rides a shared-terms block and is
   referenced by key, never retyped.
   **Anti-pattern (measured failure): never add deck entries to make
   existing canvas text pass.** Text found on a cloned shell that isn't in the
   deck is a DEFECT to fix — retitle it to the deck's copy — not an entry to
   add; a deck authored from the canvas launders stale clone text straight
   through.

**Three-tier component-choice guardrail (the contract, decidable at
generation time):**

- **Always** — the row names an existing registry component whose
  `whenToUse` matches the region/pattern: use it, no ask needed.
- **Ask-first** — no registry candidate's `whenToUse` clearly matches (or the
  candidate carries none): stop and ask before composing; record the answer
  on the row.
- **Never** — invent a component name silently, or hand-assemble a region
  from primitives past an existing candidate. No exceptions.

**Component Bindings (PRD hint layer).** The PRD's optional `Component
Bindings` section pre-seeds manifest rows: verify each entry once (exists,
right type, fits the brief) before writing it into the manifest. Absent or
failed → fall back to your own lookup pass per the tiers above. The PRD
section is a hint layer; the manifest flow is standalone and works without
it.

## Missing components / component impact

`screen-create`'s `missing-components` stage and `screen-edit`'s
`component-impact` stage both do the same cross-playbook dependency
resolution: check every brief-referenced component against the design
registry, then spawn a run per gap. Don't build a missing composite inline in
the screen run — that's exactly the reskin-the-wireframe failure the
component-first path exists to kill.

1. Look up each brief-named composite against the registry:
   `argo design registry-lookup --names '["CompositeName", ...]'`. A result
   with `missing: true` is a gap.
2. For `screen-create`: every gap spawns a `component-create` run —
   `argo playbook start --name component-create --target <Name>`.
3. For `screen-edit`: a component the PRD diff changed (not just missing)
   spawns `component-edit` instead — `argo playbook start --name
   component-edit --target <Name>`. A component that's genuinely new to this
   edit still goes through `component-create`.
4. Wait for every spawned run to reach `done` before advancing to
   `build`/`targeted-edits` — that stage composes from instances, and an
   instance can't be placed until its component exists.

## Registry sync

`screen-create`'s `registry-sync` stage runs after `review` passes: register
the built screen frame so it's addressable and audit-exempt as a screen.

```
argo design register-screen --node <screenFrameNodeId> --name <key>
```

This mirrors the screen's `@screen` Dev Mode annotation into
`design/registry.json` as a `kind:"screen"` entry — the same entry
`registry-lookup --kind screen` lists and the audit reads to exempt a
registered screen's own artboard from the three rules every top-level frame
structurally trips.

## Building component-first, then composing

Walk build-order: build each composite in dependency order, with the registry
as the reuse authority (check it before proposing anything NEW). An unmatched
composite escalates to a human — never auto-invent past the budget. Only when
the components exist do you compose the screen from **instances** (not fresh
frames).

**Compose region-by-region with a checkpoint per region:** work through the
brief's region list in order; after each major region lands, take one inline
screenshot of that region and fix visible defects before the next region.
This replaces an end-only self-review of the composed frame — it stays
lightweight: one screenshot per region, no per-region re-audits.

Right after composing a screen, mark its identity: a screen frame is a plain
FRAME with no `description` field (plain frames are not `PublishableMixin`),
so screen identity rides a Dev Mode annotation, not the `@code-owned:`
description model. The registry mapping (component name → node id) is the
code bridge — the mapping that lets code generation resolve each instance to
its real component (the on-device substitute for Figma Code Connect, which is
Org/Enterprise-only).

## Hygiene expectations

Every component and the composed screen must carry: semantic-token binding,
auto-layout intent, semantic names, correct variant naming, and real
instances (never traced frames standing in for a component). Auto layout is
checked for *intent*, not rigidly: a deliberate absolute-canvas frame
(backdrop / orb-scene / overlay whose children are all absolutely positioned)
is exempt — auto-layout would be a no-op there.

## Completeness is layered, and a screen is never done on the first pass

No frozen contract; completeness is judged in layers, cheapest first:

- **A structural pre-check** — does every instance in the composed frame
  resolve to a real registered component (no declared list, no manifest)?
  This is the cheapest catch and it's free of any LLM spend.
- **An in-loop, mechanically-scoped completeness pass** — the PRD
  requirements this screen's matrix row disposes as visible must each be
  checked for presence in the built screen, structural-presence only (is the
  enumerated thing there at all), no fidelity judgement. This is the
  designer's own job before reporting done; a **blind** completeness checker
  (never given the build transcript or the arrangement note, only the built
  screenshot + the mechanically-scoped checklist) rules each requirement
  present/absent independently, narrowed to "does the canvas match the
  manifest" rather than an open-ended re-derivation of intent.
- **A visual content self-check against the reference image** — never
  against your own reading of the prose, when a reference image exists
  (prose-misread was the observed fidelity failure mode).
- **Draft → blind verify → fix, once.** Measured rounds showed every
  structural gate gets satisfied formally while defects move to the nearest
  unchecked seam, and first-pass blind-verify-clean essentially never
  happens. So a screen is treated as **DRAFT**, not done, until an
  independent blind pass has looked at it once and any findings have been
  fixed. The point isn't first-pass perfection — it's the cheapest loop to
  clean. A second blind failure is a signal to escalate to a human, not to
  keep looping.
- **Standalone (no supervising session to route a blind check through):**
  never self-verify and self-approve — you've read your own build and can't
  un-read it. Present the draft screenshot to a human and let *them* make the
  ship call.
- **The ship call is always a human's**, informed by every layer above —
  never skip the visual self-review round to save time.

## Screen-edit specifics

`screen-edit`'s `targeted-edits` stage is never a rebuild. It runs against the
UPDATED brief from `update-brief` (so `review`'s fresh-eyes pass judges the
finished screen against the current brief, not the one `screen-create`
originally produced), and it touches only the regions the brief diff named as
changed. A region the diff didn't flag stays untouched — don't re-derive or
re-lay-out a region just because you're already in the file. If a diff turns
out to have missed a region that visibly needs to change too, stop and update
the brief again rather than editing past what it documents.

## Two-phase orchestration — the efficient shape for a wave

For a wave/batch of screens, do NOT build each screen end-to-end in
isolation — that re-pays the composite-build cost per screen.

1. **Composite front-load (serial).** Build every new/extended/reconciled
   composite a wave needs FIRST, in a few serial sessions (one writer — two
   sessions must never author the same new master). This amortizes the
   per-session context tax of discovering/inventorying components and banks
   the shared components once.
2. **Bank one canonical shell template per wave, before fan-out.** Once the
   composites exist, assemble a single shell-only frame — the layout chrome
   every screen in the wave shares (outer frame/backdrop + surrounding
   panels/bars around an empty content region), no screen-specific content.
   Record its node id, frame dimensions, and content-region slot map once.
   Fan-out screens then clone that banked shell and patch only the content
   region from the recorded slot map — they never re-read the shell's
   metadata to rediscover its structure. This structurally forecloses the
   stale-copy and backdrop-bleed defect classes that hit every screen that
   hand-reconstructs the shell.
3. **Compose fan-out (parallel).** Once a wave's composites and canonical
   shell are banked, screens only place instances on their own frames — no
   shared master mutation, so parallel compose is collision-free.

Front-loading is the dominant cost lever (composition-dominant screens cost
far less than component-heavy ones); parallelism is a wall-time bonus, not
the strategy.

## Cost discipline (hard rules)

- **Clone the shared shell, never reconstruct it.** Swap only the content
  region + the copy slots that differ, driven by the recorded slot map. Do
  not re-derive the shared chrome node-by-node from an inspected reference —
  that re-pays the whole scaffold cost and re-discovers the same Plugin API
  constraints (e.g. an absolute-positioned backdrop is rejected under a
  `layoutMode:NONE` parent; a SLOT node ignores `.resize()` — size the
  containing instance instead) on every build. A clone inherits the shell's
  already-filled, opaque surfaces, so backdrop-bleed and stale-placeholder-
  copy defects can't reappear.
- **Reserve the full-tree read for the completeness pre-check only.** Normal
  build/compose reads the committed registry + the component-resolution
  manifest — never re-pull the tree "to check structure" mid-build; that's
  the single largest redundant spend observed.
- **Pre-seed the validated binding manifest into every designer session.**
  Resolve by lookup against it; fire a live component search only on a
  genuine miss.
- **Never instance a component from a guessed/remembered/committed node id —
  resolve it live.** Everything is local to the design file, so a stale id is
  a failed lookup you re-resolve once, then stop; never retry the same id.
- **Read protocol — token-optimized read first, structural fallback only on
  overflow.** To inspect a node, read its pre-resolved design context first.
  Only fall back to a lightweight id/structure map when that result is too
  large, then re-fetch only the required node(s). Never dump a whole page or
  heavy frame — a whole-page dump has overflowed a live session; target a
  node id and narrow a large subtree before reading.
- **Author compliant up front** (naming / semantic binding / auto-layout)
  rather than create→check→fix→re-check round-trips.
- **Capture screenshots inline** in the same write call that finishes a
  region/component, rather than a separate screenshot round trip.
<!-- /INCLUDE -->
