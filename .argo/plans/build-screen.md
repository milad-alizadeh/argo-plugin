# build-screen — design doc

Status: design (grilled 2026-07-06). Next: hand to `argo:planner` for the
implementation plan. Not yet built.

## Problem

The design→code path is asymmetric. On the Figma side, `design-screen` (the
renamed `build-design`) already orchestrates a whole screen: it walks a
dependency order, builds every composite component-first via `figma-create`,
then composes the screen, with completeness verified against an independent
frozen contract. On the code side there is no equivalent. `figma-to-code`
generates exactly one component and must be invoked by hand, once per net-new
composite, then again for the composition. "design-to-code this screen" is a
manual, per-target chore with no screen-level completeness gate — the same
under-build failure mode `design-screen` exists to prevent, but for code.

`build-screen` closes that gap: say "design-to-code" + pick a screen (or a
single component) and it builds the screen's code end-to-end, component-first,
gated against an independent oracle.

## Chosen approach

`build-screen` is the **code analog of `design-screen`**, and it reuses that
skill's machinery rather than inventing a parallel stack.

**Naming (settled).** The verb signals the output surface: `design-*` produces
Figma, `build-*` produces code (as `build-plan` already does). `build-screen`
orchestrates `figma-to-code` the way `design-screen` orchestrates
`figma-create`.

|  | one component | whole screen |
|---|---|---|
| **Figma** | `figma-create` | `design-screen` |
| **code** | `figma-to-code` | `build-screen` |

**Ownership.** A dedicated, worktree-isolated builder session owns the whole
build (mirror `build-plan` / `design-screen`): one long-lived session, gates in
hooks, commits through a single writer, `integrator` lands. The voice / active
session only launches and monitors it via `orchestrate`. It does NOT drive the
build itself via the Workflow tool — that re-solves worktree isolation, commit
serialization, and gate arming from scratch, and re-triggers the exact
cross-session contention already observed (repo-global design-guard write
counter + session-rooted tdd-guard evidence collision, `build-plan` §1).

**Execution: sequential first, fan-out deferred.** The hard, valuable part —
walk the net-new subgraph, classify each node by the three-class model, build in
dependency order, compose from the built components — is identical whether
execution is sequential or parallel. Parallelism is a bolt-on to the leaf-
generation stage only, and `design-screen`'s own note applies verbatim:
front-loading is the token lever, parallelism is a wall-clock bonus. Ship the
sequential walker, prove it on a real screen, then add the fan-out stage as a
clean follow-on (independent leaf components generate concurrently; commits
still serialize through the gate).

**Where the component set comes from.** `StoryMapEntrySchema` is flat
(`{componentKey, nodeId, storyId, importPath, propMapping}`) — it maps one
component, it does not enumerate a screen's composition. So the screen's
required-component set comes from the artifact `design-screen` already froze:
`design/contracts/<screen>.json` (the region-contract) + the brief's
region-disposition block. The contract is stage-agnostic — "these regions must
exist on this screen" is equally true for the Figma build and the code build,
and it is the independent source the completeness gate needs (the code did not
descend from it). Build order = the disposition's components ordered by
`registry` category — the same source `design-screen` walks.

**Three-class handling** (per `figma-sync`'s model, applied per node):
- shadcn primitives → reuse existing code, never generate.
- RECONCILE composites → reuse existing code, never regenerate from Figma. A
  screen that needs a RECONCILE composite whose design was refreshed is an
  escalated, hand-applied case, out of `build-screen`'s scope.
- NEW class-3 composites → generate via `figma-to-code`, in dependency order.
- Screen composition → generated as a screen-level component that imports and
  places the children with props from the story-map / disposition.

**Completeness oracle** (mirrors `design-screen`, code-flavored):
1. **Structural — the gate of record (deterministic).** Walk the frozen
   contract's regions; each non-deferred region's mapped component must resolve
   to code (freshly generated NEW with a passing `spec-diff-receipt`, or an
   existing REUSE/RECONCILE). Region with no code = MISSING; code component with
   no region = UNACCOUNTED; both fail the commit. Direct analog of
   `region-coverage`.
2. **Visual — gestalt.** Rendered screen screenshot (light + dark) vs the
   committed Figma reference screen screenshot `figma-sync` captured →
   recorded PASS/FAIL. Non-circular: the reference is Figma-authored, the code
   is independent.
3. **Per-component.** `figma-to-code`'s existing tiered gates (spec-diff →
   gestalt → VRT) fire on each generated component, unchanged.
4. **Final.** One `reviewer` pass on the branch, like `build-plan`. No new
   verifier agent — the deterministic coverage gate + gestalt do the
   completeness work `design-verifier` does on the Figma side.

**Pipeline placement.** `design-screen` (freeze contract, build Figma) →
`figma-sync` (dump artifacts) → `build-screen` (read the *same* contract, build
code, gate against it).

**Resume / landing.** Inherit `build-plan`: worktree isolation,
`.argo/build-mode.json` arms the commit gates, a `…-progress.md` beside the
plan, `integrator` lands, `ExitWorktree`. Each component = one commit carrying
its `spec-diff-receipt`; the composition commit carries the coverage receipt +
gestalt verdict.

**Single-component case.** A one-node subgraph — `build-screen` degenerates to
a single `figma-to-code` run + its gates. Same entry, no special path.

## Rejected alternatives

- **Active session drives Workflow fan-out.** Rejected: re-solves worktree
  isolation / commit serialization / gate arming, and re-triggers the
  cross-session contention we watched false-block a session (global write
  counter, session-rooted tdd-guard evidence).
- **Fold code-gen into `design-screen` as an extra phase.** Rejected: couples
  two stages that must run independently (regenerate code without rebuilding
  Figma; build Figma now, code later). Different source-of-truth boundary,
  different gates.
- **Parallel-first execution.** Rejected as the starting point: parallelism is
  a wall-clock bonus on a bolt-on stage; the walker + classifier + compose is
  the value and is identical sequential. Defer fan-out to iteration 2.
- **A dedicated adversarial code-side screen verifier** (analog of
  `design-verifier`). Rejected for now: the deterministic region-coverage gate +
  screen gestalt + final `reviewer` cover completeness. Revisit only if
  under-build slips through in practice.
- **Force literal 2×2 name symmetry** (`figma-component` / `code-component` …).
  Rejected: breaks the established `figma-*` domain convention and misapplies
  `build-`/verb patterns to interactive per-unit skills, for near-zero clarity
  gain. Only `build-design → design-screen` was renamed.

## Open risks / to resolve in planning

- **Screen reference screenshot availability.** Gestalt at screen level assumes
  `figma-sync` commits a screen-level reference screenshot. `figma-sync` step 4
  captures screens (no mode duplicate). Confirm the path/naming the gate reads.
- **Region → component resolution when the disposition is stale.** If the brief
  disposition and the built Figma diverged, the code coverage gate inherits the
  divergence. Decide whether `build-screen` re-validates disposition vs the
  frozen contract at entry (cheap) or trusts it.
- **Composition-code shape.** How the screen-level composition component is
  generated and where it lives (`componentsPath` vs a screens dir) — a
  code-target-recipe concern; name the one writer, like `figma-sync` step 7.
- **`build-design-workflow.md` doc identifier.** Phantom tracking-doc citation
  left un-renamed in the rename commit; if that workflow doc is ever written it
  should be `design-screen-workflow.md`. Unrelated to build-screen but tracked.
