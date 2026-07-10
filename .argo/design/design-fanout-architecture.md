# Design fan-out architecture — deterministic, parallel, registry-driven

## Problem

Applying a design change of any breadth (apply-PRD, edit a set of screens,
create a set of screens) currently routes through a **model-driven supervisor**
that reads `skills/orchestrate/SKILL.md` and decides, turn by turn, what to
spawn and when. That single design choice is the root of every observed failure:

- **Serialized fan-out.** "Flat fan-out" (a topology rule: no nesting) is
  misread as "one designer at a time." Independent, parallel-safe work runs
  sequentially — design runs take far longer than they should.
- **Spontaneous nesting.** The model offloads finding-fixes to a sub-designer
  (`argo:designer` spawning `argo:designer`), violating the leaf rule R1. The
  `block-designer-spawn` hook that should stop it matches the legacy tool name
  `Task`; the harness spawns via `Agent`, so the guard never fires.
- **No shared-work factoring.** A PRD touching many screens usually changes
  shared component masters. Nothing computes "what is shared" and does it once,
  first — so shared edits are redone per screen or serialized behind judgment.

Better wording will not fix this. Model judgment is the defect surface. The
orchestration must move **into deterministic code** — a Workflow script — where
parallelism is structural and nesting is impossible (the script spawns leaves;
designers never hold the spawn tool).

## Settled decisions

### D1. Metadata: annotation is the sole authoring surface

- **Figma Dev-Mode annotation** is the one authored surface for component/screen
  metadata (`@code-owned:`, `@when-to-use:`, `@screen`). It is the only surface
  that exists on **both** components and frames (screens have no `description`
  field), and it **is** REST-readable via `GET /v1/files/:key`
  (`node.annotations`) — verified empirically against the live file (14 nodes
  carry markers today). The stale Figma forum claim that annotations are not
  REST-accessible is wrong for the file endpoint.
- **`description` is demoted to fallback-only *for markers*.** New marker
  authoring (`@code-owned:`/`@when-to-use:`) goes to annotations exclusively.
  The description read stays as tolerance for old data, slated for removal —
  safe, because the winning source (annotation) comes through REST. **Scope
  guard:** this demotion applies ONLY to the marker-parse of `description`.
  `description` also carries free-text owner addendum (a human note on the
  component) that is not a marker and is not being retired — the "safe to
  remove" claim is about the marker-fallback path, not the whole field. The
  annotation rule (work item 5) must say "author markers in annotations," never
  "stop writing descriptions."
- **Migration-pending tracking survives the fallback retirement.** Retiring the
  description marker-fallback must not silently drop a marker that lives only in
  a description. `resolveCodeOwnedPath` already has `codeOwnedMigrationPending`;
  `resolveWhenToUse` has no equivalent and must gain a
  `whenToUseMigrationPending` tracker, so a `@when-to-use:` still sitting in a
  description surfaces as a pending-migration warning rather than vanishing when
  the fallback is removed.
- **No duplication.** Do not maintain both surfaces and do not project one into
  the other. One authored input.

### D2. Registry is the single derived read-model

```
Figma  ──(sync, REST)──▶  registry.json  ──▶  LLM + workflows read this
```

- `registry.json` is **machine-written only, never hand-edited.** Anything typed
  into it (including the schema-less `notes` passthrough) is clobbered on the
  next pull. All authored data originates in Figma annotations.
- **REST is the sync's tool, never the runtime's.** No workflow or agent reads
  Figma ad-hoc during orchestration. If orchestration needs a fact, the sync
  must put it in the registry. This keeps one read path, offline and cacheable,
  and keeps raw Figma JSON out of the agent loop.

### D3. Registry gains instance edges (the enabling change)

The registry has no composition data today — screen entries are bare
(`nodeId`, `kind`, `status`). The layered DAG needs "which components a screen
composes." `mainComponent` links are REST-readable, so:

- `pull-registry` computes the component→screen graph during the normal pull and
  writes it to the schema. Direction: `composedOf: string[]` (nodeIds) is the
  primary store, written on **both** screen entries AND component entries (a
  component can compose other components — a Card instancing an Avatar and a
  Button — so the edge is not screen-only). `usedBy` is the derived reverse
  index, materialized on component entries during the same pull (inverting every
  `composedOf`). It is not "derivable either way at read time" — it must be
  written, because the `edit-component` workflow (D6) starts from a changed
  component and needs its consumers with zero graph-walking at orchestration
  time (D2: registry is the only read path).
- **`composedOf` is direct-only, not transitive.** Figma's REST payload nests an
  instance's entire sub-tree inline, so a naive descendant-INSTANCE walk yields
  the transitive closure and would pull implementation-detail primitives (every
  Icon inside a Button inside a Card) into a screen's `composedOf` — false-
  sharing them into layer 0. The walk therefore **stops descent at the first
  INSTANCE boundary**: a node's `composedOf` lists only the components it
  *directly* instances, and those components carry their own `composedOf` for
  what they instance. Transitive reach is reconstructed by following edges when
  needed, never baked into one node's list.
- A **shared component** is one appearing in ≥2 changed screens' *direct*
  `composedOf`. That set seeds layer 0.
- **Intra-layer ordering from component→component edges.** Because a component
  can compose another shared-and-changed component, layer 0 is not flat: within
  it, a component is serialized behind any component it directly instances that
  is also in the changed set (a master edit ripples to its instances, so the
  inner master must bank first). This is a per-component topological order over
  the `composedOf` edges restricted to layer-0 members, not just the
  same-master mutual-exclusion constraint.

### D4. Orchestration splits: a deterministic CLI verb + an enforced skill

There is no "Workflow script" runtime in this plugin — a Node CLI cannot hold
the `Agent` tool, only an LLM turn can. So the fan-out concern splits three
ways, and the split only removes model judgment if the third piece exists:

- **Deterministic part → `@argohq/toolkit` CLI (`argo design fanout-plan`).**
  Computes the change set, the `composedOf` DAG, the two layers, the intra-
  layer order, and `sameMasterGroups` from `registry.json`. Pure, unit-tested,
  zero LLM judgment.
- **Per-unit work → skills (unchanged).** `design-component`/`design-screen`
  and the `designer` agent are the leaves.
- **Orchestration part → a skill, but backstopped by a hook (the load-bearing
  piece).** The supervising session runs `fanout-plan` and spawns exactly the
  batch it names. Prose alone asking an agent to "spawn exactly this array" is
  the *same class of instruction* that produced today's serialized-fan-out and
  spontaneous-nesting bugs — a redesign that terminates in an unenforced prose
  instruction relocates the defect, it does not remove it. Therefore the plan
  is recorded in session state and a **PreToolUse spawn-conformance hook**
  (deterministic, ~free, the same lever as `block-designer-spawn`) checks each
  turn's concurrent `Agent` spawns against the active plan: it warns/blocks when
  the spawned set doesn't match the current layer's membership or violates
  `sameMasterGroups` (two designers on the same master concurrently). Enforcement
  lives in the hook, never in agent narration — mirroring the whole plugin's
  "gates in hooks, not prose" stance.
- Designers are **leaves** — spawned by the session, never nesting
  (`block-designer-spawn`, fixed to match `Agent`).

### D5. Execution model — dependency-layered DAG

For any breadth change (apply-PRD / edit-screens / create-screens):

1. **Derive change set + edges** — offline from `registry.json` (+ the PRD
   feature→screen matrix for apply-PRD). Output: changed components, changed
   screens, and the `composedOf` edges among them. Zero Figma round-trips.
2. **Layer 0 — shared component masters, parallel.** Built/edited once, first.
   Within the layer, parallel — with the one hard constraint that **two
   designers never touch the same master** (a master edit ripples to every
   instance).
3. **Barrier.** Screens cannot start until the masters they instance are banked.
4. **Layer 1 — screens, parallel.** Distinct frames/nodes → full fan-out. Each
   leaf designer reads the now-updated components as instances.
5. **Verify pipeline (not a barrier).** Fidelity/completeness check fires the
   moment a screen returns, while others still build.

Maps directly onto the Workflow primitives: `parallel()` within a layer, a
barrier between layers, a verify `pipeline()` per screen. Bounded by the shared
subscription's concurrency ceiling (parallel = a bounded batch, not unbounded).

Both Figma access paths here are the **cloud MCP** — no local plugin sandbox
lock, so no per-device serialization reason. The only genuine concurrency hazard
is same-master writes (handled in layer 0).

### D6. The six design workflows

Same DAG executor, different entry-derivation of the change set:

| Workflow | Change-set source |
|---|---|
| new feature → screens | PRD feature→screen matrix; components derived from briefs |
| new component | single component (degenerate DAG — no fan-out) |
| edit component | the component + its `usedBy` screens (re-verify consumers) |
| edit screen(s) | the screen set + their `composedOf` components |
| design → code | registry `code-owned` + `codePath` mapping |
| code → design | code components → Figma masters |

Code Connect carries **no** "when to use" semantics — it maps a node to a code
snippet + props only. Our `codePath` (node→source) is the Code-Connect analog;
`whenToUse` in the registry is the reuse-guidance layer Code Connect lacks.
Reuse only improves when the registry is read **at authoring time** and
`whenToUse` is populated for scenario-triggered components (`Command`, the
floating family, composites) — not visually-obvious primitives.

## Work items

1. **Sync — instance edges.** Extend the registry Zod schema with
   `composedOf?: string[]` on **both** screen and component entries, plus a
   derived `usedBy?: string[]` reverse index on component entries;
   `pull-registry` computes both from `mainComponent` links during the pull,
   **direct-only** (stop descent at INSTANCE boundaries). Add a
   `whenToUseMigrationPending` tracker alongside the existing
   `codeOwnedMigrationPending`. (`packages/toolkit/src/packs/design/`
   `skill-scripts/registry/pull-registry.ts`, `design-kit/schemas.ts`,
   `design-kit/registry-reconcile.ts`)
2. **Fan-out CLI verb.** `argo design fanout-plan` computes the layered DAG
   (change set → layer 0 shared components with intra-layer order → layer 1
   screens → `sameMasterGroups`) from `registry.json`. Covers **all** the
   change-set entry points, not just the screen-first three: `edit-component`
   starts from a changed component, uses `usedBy` to find consumers, and re-
   verifies them — a changed component with no changed-screen entry must NOT
   produce an empty layer 1.
3. **Spawn-conformance hook (the enforcement backstop, per D4).** Record the
   active plan in session state; a PreToolUse hook checks concurrent `Agent`
   spawns against the current layer's membership and `sameMasterGroups`. Without
   this, items 2 and 4 are prose with no teeth.
4. **Guard fix (test-first).** `block-designer-spawn`: match `Task|Agent` in
   `hooks/hooks.json` and accept both tool names in
   `packages/toolkit/src/hooks/block-designer-spawn.ts:18`; add an `Agent`
   payload test case; fix the stale `.mjs` path + "Task tool" wording in
   `agents/designer.md`.
5. **Wording fix.** `skills/orchestrate/SKILL.md` "Flat fan-out" bullet: state
   that "flat" is topology (un-nested), and independent same-level work spawns
   concurrently in one message. **Not a standalone fix** — the flat-vs-serial
   defect is only closed once items 2+3 land (the design doc itself blames
   prose-only instruction; better prose is necessary, not sufficient).
6. **Annotation rule.** Make annotation the sole authoring surface *for markers*
   explicit in the design-system rule; confirm the description marker-read is
   fallback-only (scoped to markers, not the whole description field — see D1).

## Constraints preserved (do not relax)

- Dependency ordering: components before the screens that instance them; shell
  template banked before compose fan-out; pending rulings drained into
  `aesthetic-profile.md` before the next dependent designer.
- Same-master serialization (ripple conflict).
- Shared-subscription concurrency ceiling.
