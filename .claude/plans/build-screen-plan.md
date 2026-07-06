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

## Open risks carried from the design doc
1. Screen reference screenshot path/naming (blocks S3) — confirm in figma-sync.
2. Stale disposition vs frozen contract (S2 mitigates by re-linting at entry).
3. Composition-code shape + location (`componentsPath` vs screens dir) and the
   ONE writer for it — a code-target recipe concern, decide in S4.
