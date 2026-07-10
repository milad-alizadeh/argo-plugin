---
status: draft
updated: 2026-07-10
---

# Design fan-out architecture — implementation plan

Source design doc: `.argo/design/design-fanout-architecture.md` (D1–D6, work
items 1–5). This plan grounds those decisions against the actual repo and
resolves the doc's one open question (HOW the fan-out workflows are
packaged) with a concrete recommendation.

## Load-bearing contradiction the design doc doesn't resolve (read first)

D4/D5 describe "a Workflow script" that "owns the fan-out: DAG computation,
layering, parallel batches, barriers" and maps onto "Workflow primitives:
`parallel()` within a layer, a barrier between layers, a verify `pipeline()`
per screen." **No such primitive exists in this repo, and none can**: the
only thing in `argo-plugin` that runs deterministic code is
`@argohq/toolkit` (a Node CLI, `packages/toolkit/`), and a Node process
cannot invoke the `Agent`/`Task` tool — only an LLM turn holds that tool.
Spawning N designers in parallel is, mechanically, "the orchestrating
session issues N `Agent` tool_use blocks in one assistant message" — that
capability already exists today (it's what `skills/orchestrate/SKILL.md`'s
"Flat fan-out" bullet is trying, and failing, to get an agent to do
reliably from prose alone).

There **is** a real, already-built executable vehicle in this repo that the
design doc doesn't mention: the playbook engine
(`packages/toolkit/src/core/` + `packages/toolkit/src/packs/design/playbooks/`,
landed per `.argo/plans/playbook-engine-phase1.md` +
`playbook-rename-phase2.md`, item 1 "DONE"). It already ships pack-design's
six specs (`screen-create`, `component-create`, `component-edit`,
`screen-edit`, `design-to-code`, `code-to-design` —
`packages/toolkit/src/packs/design/playbooks/index.ts:6-11`) matching D6's
table 1:1. But it is a **single-target, linear-stage state machine**
(`PlaybookInstance` has one `target: string`, one `stage`, sequential
`history[]` — `packages/toolkit/src/core/state.ts:70-82`;
`playbookStart` derives one instance key from one name+target,
`packages/toolkit/src/core/cli/playbook-start.ts:52`). There is no
multi-instance "layer" or "batch" concept anywhere in `core/` — grepped, none
exists.

**Resolution (recommendation, not a re-litigation of D4/D5's intent):** don't
invent a new "Workflow script" runtime. Split the concern exactly the way
this repo already splits every other concern:

1. **Deterministic part → toolkit.** A new pure module computes the change
   set, the `composedOf` DAG, and the two-layer plan (shared components,
   then screens) from `registry.json` (+ optionally a PRD feature→screen
   matrix), and exposes it via a new `argo design fanout-plan` CLI verb.
   Zero LLM judgment, fully unit-testable, mirrors `registry-reconcile.ts`'s
   style.
2. **Orchestration part → a skill, prose-driven but now mechanical, not
   judgment-driven.** The calling session (main session or an `orchestrate`-
   style supervisor) runs `argo design fanout-plan`, then must spawn **exactly**
   the layer-0 batch it returns in ONE message (bounded to the shared
   subscription's concurrency ceiling — batch it if the layer is larger),
   wait for all of layer 0, run `argo design fanout-plan --after-layer 0` (or
   equivalent) to get layer 1, spawn exactly that batch, then the existing
   per-screen verify pipeline (`fidelity-verifier`, already documented in
   `skills/orchestrate/SKILL.md` §5) fires per screen as it returns — this
   part already exists and needs no change. The judgment call moves from "is
   this parallel-safe" (removed — the plan says so) to "did I spawn the exact
   batch the plan named."
   **"Mechanically checkable" must actually be mechanically checked.** Counting
   Agent calls against the plan array is only a property of the design if a hook
   enforces it; a prose instruction to "spawn exactly this array" is the same
   unenforced-prose failure mode this redesign exists to kill (council BLOCKING
   #1). So the split has a **fourth** deterministic piece the earlier draft
   omitted: a spawn-conformance PreToolUse hook (Slice 7) that reads the active
   `fanout-plan` from session state and warns/blocks when a turn's concurrent
   `Agent` spawns don't match the current layer or violate `sameMasterGroups`.
   Enforcement in the hook, never in the skill prose.
3. **Per-unit work → unchanged.** `design-component`/`design-screen` skills
   and the `designer` agent are the leaves; they don't change shape, only
   who calls them (a script-driven batch instead of ad-hoc supervisor
   judgment).

This is why the DAG-enabling schema change (work item 1) is the prerequisite
for everything else, and why "author a Workflow script" (D4's phrasing) is
retargeted below to "add a CLI verb + a skill update," the only vehicle this
plugin actually has for shipping deterministic orchestration logic.

## Other doc/code gaps found

- The design doc's D3 says `pull-registry` should compute `composedOf` from
  `mainComponent` links. The current REST marshal
  (`pull-registry.ts:29-58`, `RestNode`) does not fetch or carry
  `mainComponent` at all — this is new REST-field plumbing, not a rename of
  an existing field. Confirmed: `grep -n mainComponent packages/toolkit/src/packs/design/figma-rest/pull-registry.ts` (file doesn't even exist at that path; real path is
  `packages/toolkit/src/packs/design/skill-scripts/registry/pull-registry.ts`) returns nothing.
- `agents/designer.md:68` already says "A PreToolUse hook
  (`hooks/block-designer-spawn.mjs`) backstops this" — the `.mjs` extension is
  stale (the real file is `.ts`,
  `packages/toolkit/src/hooks/block-designer-spawn.ts`, built to
  `dist/hooks/block-designer-spawn.js` per the toolkit's build). Work item 3
  must fix this reference too (design doc names it but doesn't cite the line).
- `hooks/hooks.json:6` matcher is the literal string `"Task"` — confirmed the
  guard never fires on an `Agent`-named tool call, matching the design doc's
  claim.

## File layout (new files this plan adds)

```
packages/toolkit/src/packs/design/
  design-kit/
    schemas.ts                       (edit: composedOf field)
    fanout.ts                        (new: DAG + layer computation, pure)
    fanout.test.ts                   (new)
  skill-scripts/registry/
    pull-registry.ts                 (edit: composedOf + usedBy from mainComponent; whenToUseMigrationPending accumulator — mirrors codeOwnedMigrationPending, which lives here)
    pull-registry.test.ts            (edit: fixtures carry mainComponent)
  skill-scripts/fanout/
    fanout-plan.ts                   (new: `argo design fanout-plan` CLI entry)
    fanout-plan.test.ts              (new)
packages/toolkit/bin/
  design-verbs.js                    (edit: register 'fanout-plan')
packages/toolkit/src/hooks/
  block-designer-spawn.ts            (edit: accept Task|Agent)
  block-designer-spawn.test.ts       (edit: add Agent payload case)
  fanout-conformance.ts              (new: PreToolUse spawn-conformance check)
  fanout-conformance.test.ts         (new)
hooks/
  hooks.json                        (edit: matcher "Task|Agent"; register fanout-conformance)
agents/
  designer.md                       (edit: fix .mjs path + "Task tool" wording)
skills/orchestrate/
  SKILL.md                         (edit: Flat fan-out bullet rewritten mechanical)
templates/design/
  design-system.md (or wherever the annotation rule lives — confirm path at build time)
```

No new top-level flat files: `fanout.ts` lives under the existing
`design-kit/` domain folder (peer of `registry-reconcile.ts`), and the CLI
entry lives under `skill-scripts/` in its own `fanout/` subfolder (peer of
`registry/`, `audit/`, `assembly/`, `session-guard/` — matching the existing
`skill-scripts/*/` grouping, never a bare new file at `skill-scripts/` root).

## Work items, in dependency order

### Slice 1 — Guard fix (isolated, no dependency on anything else)

`argo:build-plan` metadata: `testable: true`, `requiresLaunch: false`.

Files:
- `packages/toolkit/src/hooks/block-designer-spawn.ts:18` — change
  `hook?.tool_name !== 'Task'` to accept both: `!['Task', 'Agent'].includes(hook?.tool_name)`.
- `packages/toolkit/src/hooks/block-designer-spawn.test.ts` — add a test case
  with `tool_name: 'Agent'` and a transcript containing `DESIGNER_MARKER`,
  asserting exit code 2 and the stderr message; keep the existing `Task` case
  passing.
- `hooks/hooks.json` — change the PreToolUse matcher from `"Task"` to
  `"Task|Agent"` (grep-confirmed the entry is `hooks/hooks.json:6`).
- `agents/designer.md:68` — fix `hooks/block-designer-spawn.mjs` → the real
  built path is irrelevant to a project author (hooks.json wires it); rewrite
  the sentence to say "A PreToolUse hook (`block-designer-spawn`, matching
  both `Task` and `Agent`) backstops this" — drop the stale file-extension
  reference entirely rather than replace it with another path that could
  drift again.

Test-first: write the `Agent`-payload test case FIRST (it fails against the
current `'Task'`-only check), then make the source edit.

Verify: `cd packages/toolkit && bun test src/hooks/block-designer-spawn.test.ts`.

### Slice 2 — Wording fix (isolated)

`testable: false` (prose-only, no runtime behavior to gate red-green).

Files:
- `skills/orchestrate/SKILL.md`, the "Flat fan-out" bullet
  (`skills/orchestrate/SKILL.md:118-122`). Rewrite to state plainly: "flat" is
  a topology constraint (designers never nest), not a serialization
  instruction — independent same-layer work is spawned as multiple `Agent`
  calls in ONE assistant message. Fold in the mechanical hand-off to Slice 4's
  `fanout-plan` output once that lands (this slice can ship the wording fix
  now and Slice 4 tightens it further — don't block the wording fix on the
  CLI verb).

**This slice does NOT close the flat-vs-serial defect** (council MAJOR #7). The
design doc blames prose-only instruction for the original bug; a better-worded
prose bullet is necessary but not sufficient. The defect is closed only when
Slices 5 (the plan the prose points at) and 7 (the hook that enforces the
spawn) land. Do not mark the fan-out defect resolved in the progress doc on
Slice 2 alone.

Verify: no automated check (a prose skill file); manual read-back that the
bullet no longer reads as "one designer at a time."

### Slice 3 — Annotation rule (isolated)

`testable: false`.

Files:
- Locate the design-system rule file at build time (`Grep -r "code-owned"
  templates/design/` first — the design doc doesn't cite a path and neither
  does this exploration; confirm before editing). Add an explicit statement:
  annotation is the sole authoring surface for `@code-owned:`/`@when-to-use:`/
  `@screen`; `description` is read-only fallback for pre-migration files, never
  a place to author new markers. This mirrors the prose already in
  `agents/designer.md:140-153` and `registry-reconcile.ts:162-198`'s
  docstrings — the rule file is the one place this isn't yet stated as
  project policy.

Verify: none automated; confirm the statement doesn't contradict the
docstrings already grounded above.

### Slice 4 — Sync: instance edges (`composedOf`) — the DAG-enabling change

`testable: true`, `requiresLaunch: false`. Depends on nothing above; can run
in parallel with slices 1–3, but MUST land before Slice 5.

Files:
- `packages/toolkit/src/packs/design/design-kit/schemas.ts` — add
  `composedOf: z.array(z.string()).optional()` to `RegistryEntrySchema`
  (written on **both** screen and component entries — a component can compose
  other components; JSDoc: absent only on leaf entries that instance nothing),
  plus `usedBy: z.array(z.string()).optional()` (derived reverse index,
  component entries only).
- `packages/toolkit/src/packs/design/skill-scripts/registry/pull-registry.ts`:
  - Extend `RestNode` (line 29-36) with `mainComponent?: { id: string }` (or
    the actual REST shape — confirm against a live `GET /v1/files/:key`
    response before assuming the field name/shape; the design doc asserts it's
    REST-readable but this plan hasn't independently verified the exact JSON
    key on an INSTANCE node — **flag this as a build-time verification step**,
    not an assumption to code against blind).
  - Add a new pure function (in `design-kit/fanout.ts`, not inline in
    `pull-registry.ts`, so it's independently testable and reusable by Slice
    5's DAG builder): `computeComposedOf(frameSubtree): string[]` — walks a
    frame's descendant INSTANCE nodes and collects each one's resolved
    component/component-set nodeId, **DIRECT-ONLY: stop descending at the first
    INSTANCE boundary** (council MAJOR #5 — Figma nests the full instance
    sub-tree inline, so an unbounded walk yields the transitive closure and
    false-shares nested primitives into layer 0). Run it over both screen
    frames AND component/component-set nodes.
  - Add `computeUsedBy(entriesWithComposedOf): Map<nodeId, string[]>` — inverts
    every `composedOf` into the reverse index; wire onto component entries.
  - Wire both into `marshalScreenFrames`/`buildScreenEntries` (+ the component
    marshal path) so screen AND component entries carry `composedOf`, and
    component entries carry `usedBy`.
- `packages/toolkit/src/packs/design/skill-scripts/registry/pull-registry.ts` —
  add a `whenToUseMigrationPending` accumulator mirroring the existing
  `codeOwnedMigrationPending` (which lives HERE, ~lines 159-177/213/251, as a
  top-level pull-result field, NOT in registry-reconcile.ts — council re-review
  MAJOR): when `resolveWhenToUse` returns a value sourced from a `description`
  fallback rather than an annotation, accumulate it as pending so retiring the
  fallback (D1) can't silently drop it. `registry-reconcile.ts` only owns the
  resolver (`resolveWhenToUse`); if it needs to signal "this came from the
  fallback" to the pull-registry accumulator, extend the resolver's return
  shape there — but the tracker field itself is a pull-registry concern.
- `pull-registry.test.ts` — add fixtures with nested INSTANCE nodes under a
  `@screen`-annotated frame, assert the resulting registry entry's
  `composedOf` lists ONLY the directly-instanced component nodeIds (a
  Button-inside-a-Card fixture proves the direct-only boundary — the Card is
  listed, the Button-inside-Card is NOT on the screen's list but IS on the
  Card's); assert `usedBy` inverts correctly; add a case with zero instances
  (empty array vs omitted — confirm the schema's actual on-empty behavior).

Test-first: write `fanout.test.ts` for `computeComposedOf` (incl. the
direct-only boundary case) + `computeUsedBy` first (red), then implement; then
the `pull-registry.test.ts` integration cases (red), then wire. Add a
`registry-reconcile.test.ts` case for `whenToUseMigrationPending`.

Verify: `cd packages/toolkit && bun test src/packs/design/design-kit/fanout.test.ts src/packs/design/skill-scripts/registry/pull-registry.test.ts && bun run typecheck`.

**Checkpoint review after Slice 4** — this is the schema/data-shape decision
every downstream slice depends on; confirm the REST field assumption against
a live file before Slice 5 builds on it.

### Slice 5 — Fan-out CLI verb (`argo design fanout-plan`)

`testable: true`, `requiresLaunch: false`. Depends on Slice 4.

Files:
- `packages/toolkit/src/packs/design/design-kit/fanout.ts` (extend from
  Slice 4's `computeComposedOf`) — add:
  - `deriveChangeSet({ registry, workflow, changedScreenNames?, changedComponentNames?, prdMatrix? }): { changedScreens: string[], changedComponents: string[] }`
    — for `edit-screens`/`create-screens`, the caller passes the screen name
    list; for `edit-component` (council BLOCKING #2), the caller passes the
    changed component names and the change set expands via the component's
    `usedBy` to the consuming screens (which become layer 1 for re-verify — a
    changed component with no changed screen must still verify its consumers,
    NOT produce an empty layer 1); for `apply-PRD`, `prdMatrix` (feature→screen
    rows) derives it. Confirm the actual PRD matrix's on-disk shape
    (`templates/product/prd.md`'s "feature→screen matrix" section) before
    coding the parser — read that template at build time, don't guess its
    field names.
  - `layerFanoutPlan({ registry, changedScreens, changedComponents }): { layer0: OrderedNode[], layer1: string[], sameMasterGroups: string[][] }`
    — layer 0 = components appearing in ≥2 changed screens' *direct*
    `composedOf` UNION the explicitly-changed components (D3's shared-component
    definition + the `edit-component` entry set); layer 1 = the changed +
    consumer screens. **Layer 0 is ordered, not flat** (council MAJOR #4): a
    layer-0 component that directly `composedOf`-instances another layer-0
    component is serialized behind it (topological order over the intra-layer
    `composedOf` edges — an inner master must bank before the outer master that
    instances it). `sameMasterGroups` partitions layer 0 by nodeId for
    same-master mutual exclusion (a separate constraint from the topo order).
    **Kind cross-check** (council MINOR #8): every nodeId placed in layer 0 must
    resolve to a registry entry whose `kind` is a component kind
    (`kit`/`custom`/`code-owned`), never `screen` — fail loud if a resolved
    `mainComponent` nodeId points at a non-component entry (a data-integrity
    signal that the composedOf walk or the registry is wrong).
- `packages/toolkit/src/packs/design/skill-scripts/fanout/fanout-plan.ts` —
  CLI entry: reads `registry.json` (via the existing
  `readDesignJsonOrRebuild` helper, matching `pull-registry.ts:198-200`'s
  pattern), takes `--workflow apply-prd|edit-screens|create-screens|edit-component`,
  `--screens <comma-list>` | `--components <comma-list>` | `--prd <path>`,
  prints the layered plan as JSON (`{ layer0, layer1, sameMasterGroups }`) to
  stdout — no side effects, no Figma calls (D2: registry is the only read path).
- `packages/toolkit/bin/design-verbs.js` — register
  `'fanout-plan': '../dist/packs/design/skill-scripts/fanout/fanout-plan.js'`.
- `fanout-plan.test.ts` — fixture registry with 3 screens sharing one
  component + 1 screen with a unique component; assert the shared one lands
  in `layer0`, the unique one does not, and all 4 screens land in `layer1`.
  Add an `edit-component` case: a changed component whose `usedBy` names 2
  screens produces a layer-1 of those 2 screens (NOT empty). Add a
  component-composes-component case: two layer-0 components where A instances B
  produces an order with B before A. Add a kind-mismatch fixture: a
  `mainComponent` nodeId pointing at a `screen`-kind entry fails loud.

Test-first: `fanout.test.ts`'s `deriveChangeSet`/`layerFanoutPlan` cases
(red) before implementation; then the CLI wrapper test.

Verify: `cd packages/toolkit && bun test src/packs/design/design-kit/fanout.test.ts src/packs/design/skill-scripts/fanout/fanout-plan.test.ts && bun run typecheck && node bin/argo.js design fanout-plan --help`.

### Slice 6 — Wire the orchestrator to the plan (mechanical fan-out)

`testable: false` (prose/skill-only; the CLI verb it calls was already
red-green tested in Slice 5). `requiresLaunch: false`.

Files:
- `skills/orchestrate/SKILL.md` §5 — add a subsection after "Flat fan-out"
  (or fold into it, superseding Slice 2's interim wording): for any
  apply-PRD/edit-screens/create-screens request, the supervisor MUST run
  `argo design fanout-plan` first, spawn exactly `layer0` (respecting
  `sameMasterGroups` — never two designers in the same group concurrently),
  barrier, spawn exactly `layer1`, then the existing verify-pipeline
  language (unchanged, already correct per D5 point 5).
- Decide whether this is three separate design skills (`apply-prd`,
  `edit-screens`, `create-screens`) or one skill with a `--workflow` arg
  mirroring the CLI verb's own flag: **recommendation — no new skill files**.
  `orchestrate` already owns "supervise a fleet of designers"; adding the
  mechanical fanout-plan step to its existing §5 is strictly smaller than
  minting three new skill files that would each restate the same
  spawn/barrier/verify loop (DRY — one authored procedure, three CLI
  `--workflow` values, matching D6's "same DAG executor, different
  entry-derivation" framing exactly).

The skill prose is the *interface* to the plan; Slice 7's hook is what makes
following it non-optional. Slice 6's prose without Slice 7's hook is the
unenforced-instruction failure mode the redesign exists to kill — sequence 7
alongside/before 6, and do not consider the fan-out defect closed until both
land.

Verify: manual dry run — with a project checked out with a populated
`registry.json`, run `argo design fanout-plan --workflow edit-screens
--screens A,B` and confirm the JSON shape a human/agent following the
rewritten SKILL.md section would consume correctly.

### Slice 7 — Spawn-conformance hook (the enforcement backstop)

`testable: true`, `requiresLaunch: false`. Depends on Slice 5 (the plan shape
it validates against). This is the slice that makes the whole redesign
deterministic rather than hopeful (council BLOCKING #1) — without it, Slices 5
and 6 compute and describe a plan nothing forces the session to follow.

Design of the mechanism (confirm exact wiring at build time):
- The plan must be **recorded in session state** so a stateless PreToolUse hook
  can read it. Reuse the same session-local `.argo/` state surface the design
  guard already uses (per the memory note on per-session-local gate state);
  `fanout-plan` writes the active plan (its `layer0`/`layer1`/`sameMasterGroups`
  and a cursor for the current layer) there, or the orchestrator skill writes it
  immediately after reading the CLI output. Decide which at build time — prefer
  the CLI writing it (deterministic, not prose-dependent) if the CLI already has
  a write path to session state; otherwise the skill writes it and the hook
  treats "no active plan" as pass-through (fail-open, so non-fan-out sessions
  are never gated).
- `packages/toolkit/src/hooks/fanout-conformance.ts` — PreToolUse hook on
  `Agent|Task`. When an active fan-out plan exists in session state: collect the
  `Agent` spawns in the current tool-use batch, and warn/block when the spawned
  set doesn't match the current layer's membership (a spawn outside the layer,
  or the wrong count) or violates `sameMasterGroups` (two designers targeting
  the same master concurrently). Fail-open when no plan is active. Mirror
  `block-designer-spawn.ts`'s exit-code contract (exit 2 + stderr).
  - **Open question to resolve at build time — warn vs block, and how a single
    PreToolUse invocation sees a whole batch.** A PreToolUse hook fires per
    tool_use; whether it observes the sibling `Agent` calls in the same
    assistant message determines whether "count matches the layer" is even
    checkable in-hook, or whether the check must be per-spawn ("is THIS spawn a
    member of the current layer, and not same-master-colliding with an
    already-recorded in-flight spawn"). The per-spawn form is robust to the
    one-at-a-time firing model: the hook records each approved spawn's target in
    session state and rejects a spawn whose master collides with an in-flight
    one. Verify the harness's PreToolUse batching semantics before committing to
    a design; the per-spawn membership+collision check is the safer default.
- `hooks/hooks.json` — register `fanout-conformance` as a PreToolUse hook on
  matcher `Task|Agent` (alongside `block-designer-spawn`).
- `fanout-conformance.test.ts` — cases: (a) no active plan → pass-through;
  (b) spawn matching current layer → allow; (c) spawn of a node not in the
  current layer → block; (d) second concurrent spawn colliding on a
  `sameMasterGroups` master → block; (e) layer-1 spawn while layer 0 still has
  in-flight members → block (barrier enforcement).

Test-first: write the conformance test cases first (red against a no-op hook),
then implement.

Verify: `cd packages/toolkit && bun test src/hooks/fanout-conformance.test.ts && bun run typecheck`.

## Constraints preserved (carried from the design doc, unchanged)

- Same-master serialization: enforced via `sameMasterGroups` in the plan
  output AND the Slice 7 conformance hook (data alone was unenforced — council
  MAJOR #3).
- Intra-layer dependency order: a layer-0 component that instances another
  layer-0 component banks after it (topological order over intra-layer
  `composedOf` edges, Slice 5 `layerFanoutPlan`).
- Shared-subscription concurrency ceiling: the orchestrator batches a layer
  larger than the ceiling into sub-batches; the plan itself doesn't cap size
  (that's a runtime concern, not a data concern).
- Component-before-screen ordering, shell-template banking, pending-rulings
  drain: all already documented in `skills/orchestrate/SKILL.md` §5 and
  untouched by this plan.

## Risks / assumptions to confirm at build time

1. **REST `mainComponent` field shape unverified.** This plan assumes an
   INSTANCE node's REST payload carries a `mainComponent` reference the sync
   can resolve to a component/component-set nodeId. Confirm against a live
   `GET /v1/files/:key` response (or Figma's REST API docs) before Slice 4
   codes against it — if the field is actually `componentId` or requires a
   second `GET /v1/components/:key` round-trip, that changes Slice 4's shape
   but not its test-first order.
2. **PRD feature→screen matrix's on-disk shape unread.** Slice 5's
   `apply-prd` change-set derivation needs the matrix's actual field names
   from `templates/product/prd.md` — read it before writing the parser, not
   assumed from the design doc's prose.
3. **`fanout-plan`'s concurrency ceiling isn't in the CLI's control** — it's
   a runtime property of the calling session's subscription tier, so the CLI
   intentionally does NOT bake in a batch-size cap; Slice 6's skill prose
   owns respecting it. Flag if a future slice wants the ceiling itself
   config-driven (`.argo/config.json`) rather than orchestrator-judgment —
   out of scope here, YAGNI until observed as a real failure mode.
4. **Session-state write path for the active plan (Slice 7) unverified.**
   Whether the CLI can write the active plan to session-local `.argo/` state
   deterministically (preferred) or the orchestrator skill must write it after
   reading stdout — resolve before Slice 7. If only the skill can write it, the
   hook must fail-open on "no plan," and that's a real hole (a session that
   skips the write is unenforced) to note explicitly, not paper over.
5. **PreToolUse batching semantics (Slice 7) unverified.** Whether one
   PreToolUse invocation observes all sibling `Agent` calls in one assistant
   message decides whether the conformance check is batch-level ("count matches
   layer") or per-spawn ("this spawn is a layer member and not same-master
   colliding with an in-flight one"). The per-spawn form is the safer default —
   confirm the harness behavior before committing.

## Verification summary (full-graph, run once all slices land)

```
cd packages/toolkit
bun run typecheck
bun run lint
bun run test
node bin/argo.js design fanout-plan --help
```
