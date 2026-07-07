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
- **Arrangement lives in the design layer, on the frame.** The per-screen
  "which components, arranged how" note is a **Figma Dev Mode annotation on the
  screen frame** (`node.annotations`), not a brief file and not a PRD column
  (Figma's own best practice: annotations convey design intent hard to capture
  visually). It carries two things: free prose (the arrangement) and a
  machine-readable **`argo-screen` manifest block** — a fenced list of the
  registry component keys the screen requires, one per line, optional trailing
  `xN` cardinality (`x0` = deliberately absent, e.g. an empty rail):

  ````
  ```argo-screen
  stage-orb-scene
  first-run-cta
  rail-session-card x0
  topbar
  ```
  ````

  The manifest is what the P4a deterministic check reads. Reading it to grade the
  builder is NOT the circularity the LLM check guards against — a structural
  "did you build what you declared" check is legitimate; the ban on grading a
  plan against itself is on the P4b advisory pass, which never sees this note.

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
registered, anti-recreation UNCHANGED (inventory citation, kit-name-collision
hard gate, RECONCILE-codegen denylist). An unmatched composite ESCALATES to a
human — NEVER auto-`NEW` past the budget. Only when the components exist do you
compose the screen from **instances** (not fresh frames). As you go, write the
frame's Dev Mode annotation: the arrangement prose plus the `argo-screen`
manifest block (the registry keys this screen requires, `xN`/`x0` as needed) —
set it in the same `use_figma` write that composes, via
`frame.annotations = [{ labelMarkdown: '```argo-screen\n…\n```' }]`. Right after
composing a screen, run `argo design mark-screen-composed --screen <name>` so the
stop gate knows its P4b completeness check is owed (re-composing re-owes it).

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
- **(a) Deterministic instance-presence pre-check (cheap, advisory-loud):** assert
  every component the frame's `argo-screen` manifest DECLARES resolves to a
  **non-empty registry instance** on the built frame. Capture two things in ONE
  `use_figma` read of the composed frame — its Dev Mode annotation text
  (`node.annotations[*].labelMarkdown`) and a flat instance inventory (each
  descendant's `{ name, type, componentName: mainComponent?.name, childCount:
  children?.length }`) — then run
  `argo design check-instance-presence --manifest '<annotation text>' --built '<inventory JSON>'`
  (reads `design/registry.json` Node-side). It reports each declared component
  `present` / `MISSING` / `HOLLOW` (a traced frame or empty instance shell) /
  `UNREGISTERED`, with cardinality shortfalls as advisory warnings. A missing or
  hollow component fails here, for free, before any LLM spend — the cheapest
  catch, replacing the old region-coverage gate without a contract. It is
  **advisory-loud**: the command exits non-zero when not clean so you notice and
  fix (or override at ship), but NO hook consumes that exit — tier-0 stays the
  one hard gate.
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
2. **Compose fan-out (PARALLEL, ~3-wide).** Once a wave's composites are banked,
   screens only place instances on their OWN frames — no shared master mutation,
   so parallel compose is collision-free with no lock needed. Serialize ONLY the
   P5 registry/receipt commit through the single on-device writer (integrator).

Front-loading is the dominant token lever (composition-dominant screens cost
~75k, not ~300k); parallelism is a wall-time bonus, not the strategy.

## Cost discipline (hard rules)
- **The full-tree read is reserved for the P4a instance-presence check ONLY** —
  a single `use_figma` walk of the composed frame (annotation + instance
  inventory). P1/P2 read the committed registry + the component-resolution
  manifest — NEVER re-pull the tree "to check structure" mid-build (the single
  largest redundant spend).
- **Pre-seed the component-resolution manifest** (region/composite → kit node id +
  variant + REUSE/EXTEND/NEW verdict, generated from INVENTORY + registry) into
  every designer session. Resolve by lookup; fire live `search_design_system` only
  on a genuine miss.
- **Author tier-0-compliant up front** (naming / Semantic binding / auto-layout)
  rather than create→audit→fix→re-audit round-trips.
- **Capture screenshots inline** (`await node.screenshot()` in the finishing write
  call) — never the get_screenshot → curl → Read round-trip loop.

## Session shape & recovery
Durable on-disk state (registry, receipts, progress doc) + the Figma file survive
an interruption; wrap each designer session in `orchestrate`'s bounded-retry loop
so a crash restarts ONE screen, not the batch; rate-limit recovery inherits
`orchestrate` §4.
