---
name: design-screen
description: Build out an EXISTING screen (or wave of screens) in Figma autonomously — ONE long-lived designer session works a BUILD-ORDER wave component-first, straight to hi-fi from the PRD, gated by a single hard tier-0 audit plus a cheap deterministic instance-presence check and an advisory completeness pass. The design analog of /argo:build-plan. Use when a screen's PRD exists (a rough wireframe is optional context) and you want the hi-fi built hands-off; for a single component jump straight to /argo:figma-create.
---

# Design a Screen (hi-fi in Figma, single-session, component-first, PRD-driven)

The **automated** design stage of the canonical loop: take a screen whose intent
already exists (a **PRD**, optionally a rough wireframe for reference) and build
its hi-fi in Figma, component-first, so it turns cleanly into code. This is the
simplified flow (design-process-simplification.md, 2026-07-07): the old
contract-freeze / region-coverage / structural-receipt / wireframe-verifier
machinery is retired. It was disproportionate bookkeeping — maintaining a second
synced lo-fi artifact per screen — for a solo designer with settled taste and a
known product shape.

Why one long-lived session (like `build-plan`): a wave's components are built in
dependency order, then composed — a fresh context per component re-reads the
inventory every time.

## What the PRD owns vs the design layer

- **The PRD is the spec and the completeness oracle.** Its feature→screen matrix
  and `Visible in build?` requirement rows define what each screen must DO. The
  PRD stays PURE semantic — product-owned, durable, independent of layout. It does
  NOT carry component names or arrangement.
- **Arrangement lives in the design layer, on the frame — no manifest to
  author.** There is no Dev Mode annotation contract here anymore (design doc
  decision 9): P4a's deterministic check resolves every INSTANCE in the
  composed frame's tree directly against `design/registry.json` by `nodeId` —
  there is nothing to declare up front, so nothing to keep in sync with what
  gets built. Reading the built tree to grade the builder is NOT the
  circularity the LLM check guards against — a structural "does every instance
  resolve" check is legitimate; the ban on grading a plan against itself is on
  the P4b advisory pass, which never sees this tree data.

## 1. Preconditions — check all, fail loudly
- **A PRD** for the feature (`.claude/prds/<feature>.md`) with a feature→screen
  matrix and `Visible in build?` rows for this screen. No PRD → stop; author it
  first (`/argo:write-prd`).
- **A wireframe is OPTIONAL** — reference context only, never frozen or verified
  against. Use one only when a screen's layout is a genuine open question; skip it
  when the shape is known.
- **INVENTORY / RECONCILIATION / BUILD-ORDER** mounted **READ-ONLY** — the
  anti-recreation authority. The net-new budget is a ceiling only a human raises.
- **design-guard armed** (the app's `design.<app>` block present in
  `.claude/argo.json`, so the tier-0 stop gate + commit gate fire).
- **Figma MCP reachable** (load tools via ToolSearch if deferred): `get_metadata`,
  `get_screenshot`, plus the create tools the designer uses.

## 2. Build component-first (P1), then compose (P2)
Walk BUILD-ORDER: `figma-create` each composite in dependency order — audit-gated,
registered, with the registry as the reuse authority (check it before proposing
anything NEW). An unmatched composite ESCALATES to a
human — NEVER auto-`NEW` past the budget. Only when the components exist do you
compose the screen from **instances** (not fresh frames). Right after composing
a screen, **mark its identity**: a screen frame is a plain FRAME with **no
`description` field** (plain frames are not `PublishableMixin`), so screen
identity rides a Dev Mode annotation, not the `@code-owned:` description model.
Set a `@screen`-labelled annotation on the top-level frame
(`node.setAnnotations([{ label: '@screen' }])`) AND run
`argo design register-screen --node <frameId> --name <name> --cwd <app-dir>` to
write its `kind:"screen"` entry into `design/registry.json` — that entry is what
exempts the screen's own artboard from the 3 tier-0 rules it structurally always
trips (`non-code-friendly-name`, `missing-auto-layout`, `non-semantic-binding`).
Then run `argo design mark-screen-composed --screen <name>` so the stop gate
knows its P4b completeness check is owed (re-composing re-owes it).

`design/registry.json` (component name → node id, committed on `main`) is the
**code bridge** — the mapping that lets code generation resolve each instance to
its real component. (This is the on-device substitute for Figma Code Connect,
which is Org/Enterprise-only; nothing here depends on the paid feature.)

## 3. tier-0 audit — the one hard gate (P3)
Run the named tier-0 audit on every component built and on the composed screen.
It enforces build hygiene: Semantic-token binding, auto-layout intent, semantic
names, variant naming, and **real instances, not traced frames** (the
`composite-region-traced-not-instance` check — advisory today, promoted to a hard
fail after one NEW-composite calibration wave confirms the wrapper-frame
exemption is clean). A hard violation fails loud; the session cannot end without a
clean per-session tier-0 receipt (`design-guard-stop`).

Auto-layout is checked for *intent*, not rigidly: a deliberate absolute-canvas
frame (backdrop / orb-scene / overlay whose children are all absolutely
positioned) is exempt — auto-layout would be a no-op there.

## 4. Completeness — deterministic pre-check + advisory check, then you (P4)
No frozen contract; completeness is a cheap layered check:
- **(a) Deterministic instance-presence pre-check (cheap, advisory-loud):**
  assert every INSTANCE in the composed frame's tree resolves to a
  `design/registry.json` entry by `nodeId` — no declared list, no manifest.
  Capture the frame's flat instance inventory in ONE `use_figma` read (each
  descendant's `{ nodeId, name, type }` — no `componentName`/`childCount`
  needed anymore, since there's no HOLLOW/cardinality concept), then run
  `argo design check-instance-presence --built '<inventory JSON>'` (reads
  `design/registry.json` Node-side). It reports each instance `resolved` or
  `unresolved` (resolved by `nodeId` first, falling back to a normalized name
  match). An unresolved instance fails here, for free, before any LLM spend —
  the cheapest catch, replacing the old region-coverage gate without a
  contract. It is **advisory-loud**: the command exits non-zero when not clean
  so you notice and fix (or override at ship), but NO hook consumes that exit
  — tier-0 stays the one hard gate.
- **(b) Advisory completeness check (must-exist, non-blocking on content):**
  generate the checklist **mechanically** with
  `argo design completeness-checklist --screen <name> --prd <path>` — it selects
  the PRD requirements the feature→screen matrix disposes `covered-by` this
  screen whose `Visible in build?` is `yes`/`partial` (deterministic; the
  verifier never picks its own scope). Spawn the **design-verifier** agent with
  that checklist + the built screenshots ONLY (never the arrangement note, never
  this transcript) → it rules each requirement present/absent. Then run
  `argo design record-completeness --screen <name> --result '<summary>'`. You MAY
  override an "absent" flag and ship, but the check MUST have RUN — the stop gate
  blocks a composed screen whose completeness was never recorded (existence only,
  never on what it found; closes the D01 "silent because skipped" gap without
  content-blocking). For a pure recompose of banked instances, (a) alone may
  suffice; for a NEW composite or high PRD-REQ density, always run (b).
- **(c) You** make the ship call, informed by (a) + (b). Never cut the visual
  self-review round.

## 5. Land (P5)
figma-sync → committed artifacts; the integrator commits the design worktree.

## Two-phase orchestration (DEFAULT — the efficient shape)
For a wave/batch of screens, do NOT build each screen end-to-end in isolation —
that re-pays the composite-build cost per screen. Instead:

1. **Composite front-load (SERIAL).** Build every NEW/EXTEND/RECONCILE composite a
   wave needs FIRST, in a few serial sessions (one writer — two sessions must
   never author the same NEW master). Each base master a wave touches must be
   `audit-clean` in `registry.json` before the wave starts. This amortizes the
   ~30–50k per-session context tax and banks the shared components once.
1b. **Bank ONE canonical shell template per wave (SERIAL, before fan-out).**
   Once the composites exist, assemble a single **shell-only** frame — the
   layout chrome every screen in the wave shares (outer frame/backdrop + the
   surrounding panels/bars around an empty content region), no
   screen-specific content — and audit it clean. Record in the wave's
   **BUILD-ORDER doc, once**: the shell template's `nodeId`, its frame
   dimensions, and its content-region slot map (region name → child node id).
   Fan-out screens then `.clone()` **that banked nodeId** and patch only the
   content region from the recorded slot map — they NEVER re-read the shell's
   metadata dump to rediscover its structure (a single such dump has run
   ~101KB — banking the structure in the BUILD-ORDER pays that read once for
   the whole wave, not once per screen). This is the structural form of the
   clone-not-rebuild rule below, and it structurally forecloses the
   stale-copy and backdrop-bleed defect classes that hit every screen that
   hand-reconstructs the shell.
2. **Compose fan-out (PARALLEL, ~3-wide).** Once a wave's composites AND the
   canonical shell template (1b) are banked, screens only place instances on
   their OWN frames — no shared master mutation, so parallel compose is
   collision-free with no lock needed. Serialize ONLY the P5 registry/receipt
   commit through the single on-device writer (integrator).

Front-loading is the dominant token lever (composition-dominant screens cost
~75k, not ~300k); parallelism is a wall-time bonus, not the strategy.

## Cost discipline (hard rules)
- **Clone the shared shell, never reconstruct it.** Clone the wave's banked
  canonical shell template (step 1b) by its recorded `nodeId` —
  `(await figma.getNodeByIdAsync('<banked-shell-id>')).clone()` — or, if no
  shell was banked, a sibling screen that already carries the shared layout
  chrome (its outer frame/backdrop and the surrounding panels/bars around the
  content region). Then swap ONLY the content region + the copy slots that
  differ, driven by the recorded slot map — do NOT re-read the shell's
  metadata to rediscover it, and do NOT re-derive the shared chrome
  node-by-node from an inspected reference — that re-pays the whole
  scaffold cost and re-discovers the same Plugin API constraints (e.g. an
  absolute-positioned backdrop is rejected under a `layoutMode:NONE` parent;
  a SLOT node ignores `.resize()` — size the containing instance) on every
  build. Cloning is materially cheaper in round-trips and tokens, and a clone
  inherits the shell's already-filled, opaque surfaces, so backdrop-bleed and
  stale-placeholder-copy defects can't reappear.
- **The full-tree read is reserved for the P4a instance-presence check ONLY** —
  a single `use_figma` walk of the composed frame's flat instance inventory.
  P1/P2 read the committed registry + the component-resolution
  manifest — NEVER re-pull the tree "to check structure" mid-build (the single
  largest redundant spend).
- **Pre-seed the component-resolution manifest** (region/composite → node id +
  variant + REUSE/EXTEND/NEW verdict, generated from INVENTORY + registry) into
  every designer session. Resolve by lookup; fire a live component-page search
  only on a genuine miss.
- **Never instance a component from a guessed/remembered/committed node id —
  resolve it LIVE** (figma-create §"check before you build"): everything is
  local to the design file, so a stale id is a `getNodeByIdAsync` null / failed
  `findAll`, which stop-the-line (R8) acts on. Re-resolve once, then stop; never
  retry the same id.
- **Read protocol — `get_design_context` FIRST, `get_metadata` is fallback
  only.** To inspect a node, read `get_design_context` on the exact node id
  first (token-optimized: tokens/components/styles pre-resolved). Only when that
  result is too large, fall back to `get_metadata` for a lightweight id/structure
  map, then re-fetch ONLY the required node(s). Never metadata-first, and NEVER
  `get_metadata`/select a whole page or heavy frame (documented #1 MCP failure —
  a whole-page dump has overflowed a live session at ~102k chars); target a node
  id and narrow a large subtree before reading.
- **Author tier-0-compliant up front** (naming / Semantic binding / auto-layout)
  rather than create→audit→fix→re-audit round-trips.
- **Capture screenshots inline** (`await node.screenshot()` in the finishing write
  call) — never the get_screenshot → curl → Read round-trip loop.

## Session shape & recovery
Durable on-disk state (registry, receipts, progress doc) + the Figma file survive
an interruption; wrap each designer session in `orchestrate`'s bounded-retry loop
so a crash restarts ONE screen, not the batch; rate-limit recovery inherits
`orchestrate` §4.
