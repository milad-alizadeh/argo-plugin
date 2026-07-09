# build-screen — implementation plan

Grounded plan for the `build-screen` skill designed in `build-screen.md`. Built
via `/argo:build-plan` itself (dogfood). Slices are ordered so the completeness
gate exists before the orchestrator that depends on it.

## Grounding (what already exists, verified in packages/kit/src)

The design-screen coverage stack is **pure and reusable**:
- `design-kit/region-contract.js` — `classifyCoverage(contract, builtRegions,
  dispositions)` → `{present, deferred, unaccounted, missing}`; `summarize`;
  `reconcileBrief`; `screenMatchesReceipt`; `deriveExpectedScreensFromStagedFiles`;
  `evaluateCoverageReceipt`; `coverageReceiptFilename`. All off-Figma, unit-tested.
- `skill-scripts/record-coverage-receipt.js` — `buildCoverageReceipt({contract,
  builtRegions, dispositions, producedBy})` → writes
  `design/coverage-receipt-<screen>.json`; rejects `producedBy === 'compose'`.
- `hooks/design-coverage-gate.js` — PreToolUse `git commit`; arms per-app from
  `.claude/argo.json` `design.<app>` when staged files touch the app; requires a
  fresh, screen-matched, `figmaFileVersion`-matched, non-compose coverage receipt.
- `skill-scripts/region-coverage.js` — P2 pre-build lint: contract regions vs
  `design/dispositions/<screen>.json` rows (100% accounted).
- `skill-scripts/extract-built-regions.js` — Figma-side `get_metadata` →
  `builtRegions`. **This is the piece that has no code-side analog.**

**Consequence:** `build-screen`'s structural gate is NOT new machinery. It is the
existing coverage gate fed a code-derived `builtRegions`. Only the extractor is new.

## Slices

### S1 — code-side built-regions extractor (the linchpin)
New kit module + `skill-scripts/extract-built-regions-code.js`: given the
generated screen composition + `registry.json` + `story-map.json`, produce the
same `builtRegions` shape `classifyCoverage` consumes, from CODE not Figma.
- **Decision to make (open risk #_composition-shape_):** DOM-based (render the
  screen story, read `data-region`/registry-instance markers from the DOM) vs
  source-AST-based (parse the composition's imports/JSX for registry-backed
  component instances). Recommend **DOM-based** — it matches how gestalt already
  renders stories, and "present REQUIRES a registry-backed instance" (design-
  screen's rule) maps to a rendered instance, not just an import that might be
  dead. AST is the fallback if rendering per-region markers proves noisy.
- Pure function unit-tested in the kit (fixture DOM/source → builtRegions);
  CLI is fs glue, like the other skill-scripts.
- Downstream is unchanged: `buildCoverageReceipt(..., producedBy:
  'build-screen-coverage')` + `design-coverage-gate` accept it as-is.

### S2 — entry reconciliation lint (reuse, no new logic)
At `build-screen` entry, run `region-coverage.js` (contract vs disposition) to
catch a stale/divergent disposition before generating anything (open risk
#_stale-disposition_). Pure reuse; slice is wiring + the SKILL step.

### S3 — screen-level gestalt verdict
Render the screen story (light + dark) via the VRT walker; compare against the
committed Figma reference screen screenshot; record a PASS/FAIL verdict artifact
checkable by the receipt hooks (mirror figma-to-code Tier 2).
- **Confirm first (open risk #_screenshot-path_):** `figma-sync` writes a
  screen-level reference screenshot and its path/naming. figma-sync step 4
  captures screens (single, no mode dup) — verify the on-disk path the gate reads.
- Likely extends figma-to-code's gestalt to screen scope rather than net-new.

### S4 — the build-screen SKILL.md (orchestrator)
Author `skills/build-screen/SKILL.md`, mirroring `build-plan` + `design-screen`:
- **Preconditions:** PRD + brief + frozen `design/contracts/<screen>.json` +
  synced artifacts (story-map, specs, screenshots) + `registry.json`;
  design-guard armed; reviewer available; runners execute here.
- **Isolate:** EnterWorktree; fresh-worktree checklist (deps, runner proof).
- **Arm gates:** `.argo/build-mode.json` per component (the design-commit-gate +
  new coverage receipt gate both fire on componentsPath commits).
- **Resolve subgraph:** from contract regions → disposition components → order by
  `registry` category. Classify each (three-class): primitive/RECONCILE → reuse
  (skip generation); NEW → generate.
- **Build loop (sequential):** per NEW component, run `figma-to-code` (its Tier
  1/2/3 gates unchanged) → commit with its `spec-diff-receipt`.
- **Compose:** generate the screen composition from built components (props from
  story-map/disposition).
- **Verify:** run S1 extractor → `record-coverage-receipt` (producedBy
  non-compose) → S3 gestalt verdict → commit (coverage gate + gestalt gate).
  Then one `reviewer` pass on the branch.
- **Land:** integrator per `.claude/argo.json` `landing`; ExitWorktree; archive
  plan. Resume protocol inherited verbatim from build-plan §5.
- **Single-component case:** one-node subgraph → degenerates to one figma-to-code
  run + gates; same entry.

### S5 — routing + docs
Add `build-screen` to PIPELINE.md (a new code-build row after figma-sync), README
routing, the canonical-loop card / SessionStart routing, and the CLAUDE.md loop.
Pair it with `design-screen` in the 2×2 wherever that grid appears.

### S6 — DEFERRED: compose fan-out
Parallel leaf-component generation (independent net-new leaves) with commits still
serialized through the gate. Separate iteration; do not build until S1-S5 are
proven on a real screen. Log any coverage cap when added (no silent truncation).

## Verification strategy
Kit pure functions (S1) unit-tested in the kit's Vitest. S2-S3 gate behaviour
tested against fixtures (contract + built-regions + dispositions → receipt
exit code). S4-S5 are skill prose + wiring — true test is a real argo-v2 screen
generated end-to-end (no fixture exists in-plugin; same posture as figma-to-code).

## FINDING (2026-07-06, from grounding S1) — path-matching does not cross to code

`classifyCoverage` matches built→contract regions by **`path`** (`findBuiltMatch`:
`built.path === region.path`). Contract paths are ancestry-qualified from the
**Figma metadata tree** — every node name including non-instance wrappers (see
`promoteNodes.visit`: path grows on *every* child, region or not). design-screen
works because BOTH sides are Figma trees, so paths align by construction. C3a
deliberately chose path over name so one instance can't satisfy multiple
same-named contract rows.

A code screen's rendered DOM is a different tree (wrapper divs, different
nesting, no Figma node names), so **path identity does not survive the jump to
code**. So S1 is NOT a mechanical mirror of `buildBuiltRegions`, and
`classifyCoverage` cannot be reused verbatim. The matching key has to change.
Three options, with the tradeoff being independence vs robustness:

- **(A) Replicate Figma paths in code.** Generator emits `data-region-path` on
  every instance, verbatim from the contract. Extractor reads it → paths align →
  `classifyCoverage` unchanged. Con: self-annotated — the generator declares
  which contract path each instance fulfills, so extraction reads the generator's
  claims (weakens the independent-oracle property). Also must annotate wrapper
  nesting to match Figma paths — fragile.
- **(B) Component-identity via disposition (RECOMMENDED).** Base kit components
  self-identify at their root (`data-argo-component="<key>"`, emitted by the
  component, not the screen generator). Extractor collects the registry
  instances actually rendered. A new *code-side classifier* matches each contract
  region to its disposition's `component` and checks that component rendered:
  present / MISSING / UNACCOUNTED / deferred, same output shape as
  `classifyCoverage` → feeds `summarize`/`buildCoverageReceipt`/the gate
  unchanged. Pros: robust (no Figma-path replication), reasonably independent
  (components self-identify; disposition is frozen), matches how code composes
  (by component, not Figma ancestry). Con: a new classifier, so "only S1 is new"
  becomes "S1 + a small code-side classifier are new" (receipt + gate +
  `summarize` still reused).
- **(C) Name-based matching.** Match by region name. Rejected: reintroduces
  exactly the one-instance-satisfies-many-rows bug C3a fixed.

**Recommendation: (B).** Revises S1 to: base-component self-ID marker + a
`classifyCoverageByComponent(contract, renderedComponents, dispositions)` code
classifier reusing `summarize`. This is a design decision that must land before
S1 is coded — it changes what S1 is.

## S1 landed (b55c762) + known limitations (from opus review)

`classifyCoverageByComponent` is built and tested (option B). Two deliberate,
delegated limitations a future reader must know — both documented in the
function's docstring too:
- **Placement-blind.** Proves the right components rendered in the right
  QUANTITY, never that they sit in the correct regions (option B discarded
  path/position matching — a DOM has no matching path). Right-components /
  wrong-regions passes the coverage gate; **placement is delegated to the
  screen-level gestalt gate + reviewer.** A clean coverage receipt is NOT proof
  of layout — this is the core tradeoff of component-identity over path.
- **Name-keyed.** Matches on `region.name`, so two contract regions sharing a
  name (C3a's repeated-composite case) collapse to one disposition row,
  distinguishable only by consumption count. Mitigated (N same-named regions
  need N instances) but the Figma side's path-level distinction is not
  recoverable on the code side.

The DOM extractor (`data-argo-component` → rendered list) remains thin CLI
glue, deferred until a real screen exists to exercise it.

## Open risks carried from the design doc
1. Screen reference screenshot path/naming (blocks S3) — confirm in figma-sync.
2. Stale disposition vs frozen contract (S2 mitigates by re-linting at entry).
3. Composition-code shape + location (`componentsPath` vs screens dir) and the
   ONE writer for it — a code-target recipe concern, decide in S4.
