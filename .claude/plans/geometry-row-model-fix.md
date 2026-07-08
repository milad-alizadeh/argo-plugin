# Fix: geometry row/depth model (declared rows, x-clustered depth)

Grounded against `/Users/milad/Developer/argo-plugin` at the current state of
`packages/kit@0.41.0+` (post the 2026-07-08 per-target opt-in bug fix, which is
already landed and unaffected by this plan). Fixes the defect recorded in
`.claude/plans/geometry-row-model-mismatch.md`, implementing the fix direction
already resolved there and in the task brief. Builds directly on
`.claude/plans/fidelity-geometry-verifier.md`'s Layer A (landed) — this plan
edits that layer's row/depth model only; nothing outside `geometry-rules.ts`,
`tier0-audit.ts`'s geometry wiring, `role-tags.ts`, and their test/fixture
files changes.

## Confirmed against the real code (2026-07-08)

- `packages/kit/src/design-kit/tier0-audit.ts:429-449` still has the exact two
  heuristics the defect doc describes: `marshalRowGroups` = "any child with
  children" (line 429-431), `groupRowsByDepth` = BFS DOM-nesting depth (line
  440-449). **Not yet fixed** — this plan is still live work, not already done.
- `packages/kit/src/design-kit/geometry-rules.ts:96-112`
  (`indentAndRowConsistencyViolations`) still produces BOTH
  `indent-inconsistent` and `row-height-inconsistent` from one same-depth-row
  comparison — the row-height rule the design direction says to drop.
- `role-tags.ts:10` (`Role` union) has exactly `'content-start' | 'rail' |
  'anchor' | 'hit-target'` — no `'row'` role yet.
- `geometry-corpus.json` (`test/fixtures/geometry-corpus.json`) rows are plain
  children with a `children` array and no `#row` tag — depends on the
  "has-children" heuristic this plan deletes; every fixture row needs a `#row`
  suffix added or it silently stops being detected as a row after the fix.
- `geometry-corpus.test.js`'s rule-coverage list includes `indent-inconsistent`
  and `row-height-inconsistent` — both must be removed/renamed once the rules
  they assert on are deleted/renamed.
- `runPureGeometryAudit.mjs` (`test/helpers/`) duplicates `marshalRowGroups`/
  `groupRowsByDepth` verbatim (its own doc comment requires it stay in
  lock-step with `composeGeometryChecks`) — must change in the same slice as
  `tier0-audit.ts`, never deferred.
- `geometryViolationsForTarget`/`isGeometryCheckedCategory`/per-target opt-in
  (`geometry-rules.ts:241-273`, wired in `tier0-audit.ts:596-604,628-630`) are
  unrelated to this defect and untouched by this plan.
- The reproduction script (`/Users/milad/.claude/jobs/749776d3/tmp/geo-dogfood.mjs`)
  is confirmed to exist and reconstructs the exact live TreeNode geometry
  (2 phase rows @28px, x=2941 row-box / content descendants at various x;
  4 agent rows @36px) — ported into the corpus as the regression fixture
  (Slice 5), using the exact numbers the task brief specifies (phase
  content-start x=2949, agent content-start x=2973, itemSpacing 0).
- `skills/figma-audit/SKILL.md:47-69` documents the geometry checks in prose
  ("same-depth rows share one indent/height") — this line goes stale the
  moment `row-height-inconsistent` is dropped and depth becomes
  cluster-derived; updated in Slice 6.

## Design direction (resolved, not reopened)

1. **Rows are declared, never inferred.** New `#row` role tag on the `Role`
   union in `role-tags.ts`. Rows for every geometry rule = `findAllByRole(root,
   'row')`, sorted by `y` for deterministic paint order. This fully replaces
   `marshalRowGroups`'s "has children" heuristic.
2. **Depth = clustering rows by their own `#content-start` x.** No new depth
   tag, no DOM-nesting walk, no variant-property read. Rows whose
   `#content-start` x falls within `geometryTolerancePx` of a cluster's
   anchor value belong to that cluster; clusters are sorted by x ascending,
   each one *is* a depth level. This fully replaces `groupRowsByDepth`.
3. **Checks after the redesign:**
   - (a) `contentStartAlignmentViolations` — now takes the clustered groups
     and asserts every row in a cluster matches the cluster's baseline x
     within tolerance. Kept as an explicit, independently-testable invariant
     even though the clustering algorithm's own construction (anchor-value +
     tolerance membership) already guarantees it can't fire on
     cluster-produced input — see "Known limitation" below. Never deleted:
     the design direction explicitly names it as check (a) and a future
     clustering algorithm change could stop guaranteeing the invariant.
   - (b) `indentStepUniformityViolations` (**new**, replaces the
     `indent-inconsistent` half of `indentAndRowConsistencyViolations`) —
     distinct cluster x-values, sorted, must be evenly spaced: the delta
     between the first two clusters is the *derived* indent unit (no
     hardcoded step), and every subsequent delta must match it within
     tolerance.
   - (c) `interRowContinuityViolations` — unchanged logic, now fed the
     declared+sorted row list instead of `marshalRowGroups`' output.
   - (d) `railAnchorSpanViolation` — unchanged, per the task brief ("rail span
     unchanged"), now fed the declared row list.
   - **Dropped entirely:** the `row-height-inconsistent` rule (the
     cross-kind-row-height-uniformity half of `indentAndRowConsistencyViolations`)
     — kind-varying row height (28px phase vs 36px agent) is legitimate and
     must never be flagged. `indentAndRowConsistencyViolations` itself is
     deleted, split into (a) revised + (b) new.
4. **`missing-role-tags` precondition.** `#row` is added to `role-tags.ts`'s
   `ALL_ROLES` (so `hasAnyRoleTag`/`missingRoleTagsViolation` see it too) —
   same "opt-in, silent no-op until tagged" posture the mismatch doc's own
   Risks section already accepts for the other three roles, extended
   consistently rather than carved out as a special case.

### Known limitation (accepted, not a blocker)

`contentStartAlignmentViolations` (check a) cannot fire when fed clusters
produced by `clusterRowsByContentStartX`, because cluster membership is
defined by "within tolerance of the cluster's anchor value" — the same
condition the alignment check re-verifies. It remains a real, independently
meaningful, independently unit-tested pure function (called directly in
`geometry-rules.test.ts` with hand-built cluster objects, not only through the
composed pipeline) and stays wired into `composeGeometryChecks` per the
design direction's explicit (a)/(b) split, but it will not appear as a
reachable rule in `geometry-corpus.json`'s inverse-fixture coverage (a
misaligned row instead lands in its own singleton cluster and is caught by
indent-step-uniformity or, if it happens to match the derived unit exactly, is
indistinguishable from a real deeper row — the same edge case the original
plan's Risks section already accepted for the pre-fix design). Flagged here
per this agent's mandate to surface anything the code makes infeasible; not
re-litigated, because the design direction was explicit about keeping both
checks (a) and (b) as separate, and dropping (a) would contradict the brief
without a concrete blocker (it degrades gracefully, it isn't broken).

## Approach — no architect panel

This is a scoped bugfix inside an already-decided module boundary (the Layer
A geometry pass), not a new architectural surface — same file, same pure-
predicate-function convention, same fixture-corpus test contract every other
`geometry-rules.ts` function already follows. No new module, no new data
model, no cross-cutting pattern introduced. Single-pass plan.

## Files to change

Edited:
- `packages/kit/src/design-kit/role-tags.ts` — add `'row'` to `Role` and
  `ROLE_SUFFIX`/`ALL_ROLES`.
- `packages/kit/src/design-kit/role-tags.test.ts` — new case: `roleTagOf`
  recognizes `#row`.
- `packages/kit/src/design-kit/geometry-rules.ts` — add
  `clusterRowsByContentStartX`, rewrite `contentStartAlignmentViolations` to
  take clusters, add `indentStepUniformityViolations`, delete
  `indentAndRowConsistencyViolations`. `railAnchorSpanViolation`,
  `interRowContinuityViolations`, and everything else unchanged.
- `packages/kit/src/design-kit/geometry-rules.test.ts` — replace the
  `indentAndRowConsistencyViolations` describe block with
  `clusterRowsByContentStartX`/`contentStartAlignmentViolations` (new
  signature)/`indentStepUniformityViolations` blocks; update the
  `row`/`anchorRow`/`offsetRow` helpers' names to carry `#row` where they
  stand in for a declared row.
- `packages/kit/src/design-kit/tier0-audit.ts` — delete `marshalRowGroups` and
  `groupRowsByDepth`; add `marshalRows(tree)` (declared rows, sorted by y);
  rewire `composeGeometryChecks` to call `clusterRowsByContentStartX` once and
  feed clusters to (a)/(b), the flat row list to (c)/(d)/cross-axis/hug.
- `test/helpers/runPureGeometryAudit.mjs` — mirror the exact same
  `marshalRows`/clustering wiring change (its own header mandates lock-step,
  same slice, never deferred).
- `test/fixtures/geometry-corpus.json` — add `#row` to every existing row
  fixture's row-node name; rename the `indent-inconsistent` inverse fixture to
  exercise `indent-step-inconsistent` (3+ clusters, one step off); delete the
  `row-height-inconsistent` inverse fixture; add a new top-level
  `regressions.flatTreeNodeList` fixture (the ported dogfood reproduction:
  6 rows, 2 phase @28px content-start x=2949, 4 agent @36px content-start
  x=2973, itemSpacing 0) that must produce `[]`.
- `packages/kit/src/design-kit/geometry-corpus.test.js` — update the
  rule-coverage list (`indent-inconsistent`/`row-height-inconsistent` →
  `indent-step-inconsistent`; drop `content-start-misaligned` from the
  composed-pipeline coverage list per the Known Limitation above, but keep a
  comment pointing at where it's unit-tested); add the regression describe
  block asserting `regressions.flatTreeNodeList` → `[]`.
- `skills/figma-audit/SKILL.md` — update the geometry-checks paragraph
  (line 47-69): replace "same-depth rows share one indent/height" with the
  new depth model (content-start-x clustering) and drop the height-uniformity
  claim.

No new files. No changes to `geometryViolationsForTarget`,
`isGeometryCheckedCategory`, `prepare-tier0-audit-options.ts`,
`bundle-tier0-audit.ts`, `component-categories.ts`, `contrast.ts`, or any
non-row rule (`loadBearingVisibilityViolations`, `hugOverflowViolations`,
`touchTargetViolation`, `wcagContrastCheckViolation`) — all untouched by the
row/depth defect.

## Step-by-step work items

### Slice 1 — `#row` role tag (`testable: true`, `requiresLaunch: false`)

1. `role-tags.ts`: add `'row'` to `Role`, extend `ROLE_SUFFIX` to
   `/#(content-start|rail|anchor|hit-target|row)$/`, add `'row'` to
   `ALL_ROLES`.
2. `role-tags.test.ts`: add `it('recognizes #row', ...)` alongside the other
   3 role cases; add `#row` to the `hasAnyRoleTag` true-case tree (or a
   second case) so the new role is proven to count.
3. Verify: `cd packages/kit && bun test src/design-kit/role-tags.test.ts`
   (red first: write the `#row` test against the current regex, confirm it
   fails, then add the regex change).

### Slice 2 — clustering + revised content-start-alignment (`testable: true`)

1. `geometry-rules.ts`: add
   ```ts
   export type RowCluster = { x: number; rows: any[] }

   /**
    * Groups rows by their own #content-start x — the row's rendered indent
    * IS its depth signal (design direction: no DOM-nesting inference, no
    * separate depth tag, no component-specific variant read). A row within
    * tolerancePx of a cluster's anchor x (the first row assigned to it)
    * joins that cluster; anything further starts a new one. Clusters are
    * returned sorted ascending by x, so cluster[0] is the shallowest depth.
    * A row with no #content-start descendant is skipped (missing-role-tags'
    * job to flag total absence, not this function's).
    */
   export function clusterRowsByContentStartX(rows: any[], tolerancePx: number): RowCluster[] {
     const withStart = rows
       .map((row) => ({ row, x: findAllByRole(row, 'content-start')[0]?.x }))
       .filter((r): r is { row: any; x: number } => typeof r.x === 'number')
       .sort((a, b) => a.x - b.x)
     const clusters: RowCluster[] = []
     for (const { row, x } of withStart) {
       const current = clusters[clusters.length - 1]
       if (current && x - current.x <= tolerancePx) {
         current.rows.push(row)
       } else {
         clusters.push({ x, rows: [row] })
       }
     }
     return clusters
   }
   ```
2. Rewrite `contentStartAlignmentViolations` to take `RowCluster[]`:
   ```ts
   /**
    * Every row WITHIN one x-cluster (same declared depth, see
    * clusterRowsByContentStartX) must place its own #content-start at the
    * cluster's baseline x. By construction, clusterRowsByContentStartX only
    * ever assigns a row to a cluster it's already within tolerance of — see
    * this plan's "Known limitation" — so this check is a defense-in-depth
    * invariant on the pipeline's own clustering guarantee, not dead code:
    * it is independently meaningful and independently tested against
    * hand-built clusters that violate the invariant directly.
    */
   export function contentStartAlignmentViolations(clusters: RowCluster[], tolerancePx: number): GeometryViolation[] {
     const violations: GeometryViolation[] = []
     for (const cluster of clusters) {
       if (cluster.rows.length < 2) continue
       for (const row of cluster.rows) {
         const node = findAllByRole(row, 'content-start')[0]
         if (node && Math.abs(node.x - cluster.x) > tolerancePx) {
           violations.push({
             rule: 'content-start-misaligned',
             nodeId: node.id,
             detail: `row "${row.name}"'s #content-start is at x=${node.x}, expected x=${cluster.x} (matching its depth cluster) — a conditional leading element likely shifted this row's content`
           })
         }
       }
     }
     return violations
   }
   ```
3. `geometry-rules.test.ts`: replace the existing `contentStartAlignmentViolations`
   describe block (which called it with a flat `rows` array) with:
   - `clusterRowsByContentStartX`: 3 rows all x=24 → one cluster of 3; rows at
     x=24,24,48 → two clusters ([24,24], [48]); rows within 1px of each other
     (23,24) with tolerance 1 → one cluster; a row missing `#content-start` →
     excluded from all clusters, not a crash.
   - `contentStartAlignmentViolations`: a hand-built cluster whose `rows`
     array contains a row whose actual `#content-start` x doesn't match
     `cluster.x` (constructing the input directly, bypassing
     `clusterRowsByContentStartX`, to exercise the invariant per the Known
     Limitation note) → 1 violation citing that row's node id; a clean
     cluster → `[]`; a singleton cluster (nothing to compare) → `[]`.
4. Verify: `cd packages/kit && bun test src/design-kit/geometry-rules.test.ts`

### Slice 3 — indent-step uniformity (replaces `indentAndRowConsistencyViolations`, `testable: true`)

1. `geometry-rules.ts`: delete `indentAndRowConsistencyViolations` entirely;
   add:
   ```ts
   /**
    * Distinct content-start-x cluster values, sorted ascending, must be
    * evenly spaced by ONE indent unit — derived from the first two clusters'
    * delta, never hardcoded (a project's indent unit is whatever its rows
    * actually render at). Needs at least 3 clusters (2 deltas) to have
    * anything to compare; row-height uniformity is deliberately NOT checked
    * here (dropped per design direction — kind-varying row height, e.g.
    * 28px phase vs 36px agent rows, is legitimate).
    */
   export function indentStepUniformityViolations(clusters: RowCluster[], tolerancePx: number): GeometryViolation[] {
     if (clusters.length < 3) return []
     const sorted = [...clusters].sort((a, b) => a.x - b.x)
     const unit = sorted[1].x - sorted[0].x
     const violations: GeometryViolation[] = []
     for (let i = 2; i < sorted.length; i++) {
       const delta = sorted[i].x - sorted[i - 1].x
       if (Math.abs(delta - unit) > tolerancePx) {
         const citedRow = sorted[i].rows[0]
         violations.push({
           rule: 'indent-step-inconsistent',
           nodeId: citedRow?.id,
           detail: `indent step from x=${sorted[i - 1].x} to x=${sorted[i].x} is ${delta}px, expected ${unit}px (matching the first indent step)`
         })
       }
     }
     return violations
   }
   ```
2. `geometry-rules.test.ts`: replace the `indentAndRowConsistencyViolations`
   describe block with `indentStepUniformityViolations`: 2 clusters (nothing
   to compare, needs 3) → `[]`; 3 evenly-spaced clusters (x=0,24,48) → `[]`;
   3 clusters with an uneven third step (x=0,24,60) → 1 violation citing the
   third cluster's first row; exactly-at-tolerance step → `[]`.
3. Verify: `cd packages/kit && bun test src/design-kit/geometry-rules.test.ts`

### Slice 4 — rewire `tier0-audit.ts` + `runPureGeometryAudit.mjs` (`testable: true`, both files same slice)

1. `tier0-audit.ts`: delete `marshalRowGroups` and `groupRowsByDepth`. Add:
   ```ts
   /**
    * Rows = every #row-declared node in the subtree (role-tags.ts), sorted
    * by y for deterministic paint order. Replaces marshalRowGroups' "any
    * child with children" heuristic entirely (fidelity-geometry-verifier.md
    * defect fix, see geometry-row-model-fix.md) — a real component
    * instance's internal frames (StatusDot, summary, ProgressBar, connector)
    * are never mistaken for rows now, because nothing infers row-ness from
    * DOM shape.
    */
   export function marshalRows(tree: any): any[] {
     return findAllByRole(tree, 'row')
       .slice()
       .sort((a: any, b: any) => (a.y ?? 0) - (b.y ?? 0))
   }
   ```
2. Import `clusterRowsByContentStartX`, `indentStepUniformityViolations` from
   `./geometry-rules.js`; remove the now-deleted
   `indentAndRowConsistencyViolations` import.
3. Rewrite `composeGeometryChecks`'s body:
   ```ts
   const rows = marshalRows(root)
   const clusters = clusterRowsByContentStartX(rows, geometryTolerancePx)
   for (const v of contentStartAlignmentViolations(clusters, geometryTolerancePx)) report(v)
   report(railAnchorSpanViolation(root, rows, geometryTolerancePx))
   const itemSpacing = typeof root.itemSpacing === 'number' ? root.itemSpacing : 0
   for (const v of interRowContinuityViolations(rows, itemSpacing, geometryTolerancePx)) report(v)
   for (const v of indentStepUniformityViolations(clusters, geometryTolerancePx)) report(v)
   ```
   (the rest — `loadBearingVisibilityViolations`, `crossAxisAnchorOffsetViolations`,
   `hugOverflowViolations` over `[root, ...rows]`, `#hit-target` scoping —
   unchanged, still fed `rows`/`roleTagged` exactly as before).
4. `test/helpers/runPureGeometryAudit.mjs`: apply the identical change —
   delete its local `marshalRowGroups`/`groupRowsByDepth`, add the same
   `marshalRows`/clustering wiring, import `clusterRowsByContentStartX` and
   `indentStepUniformityViolations` from `geometry-rules.js` alongside the
   existing imports. This file's own header requires it never drift from
   `composeGeometryChecks` — done in this same slice, not deferred.
5. Verify: `cd packages/kit && bun run build` (typecheck — `tier0-audit.ts`
   has no direct unit test, documented accepted gap, same as every other
   Plugin-API walker function in this file).

### Slice 5 — corpus: retag existing fixtures + real flat-list regression (`testable: true`)

1. `test/fixtures/geometry-corpus.json`: add `#row` to every row node's
   `name` across `pristine` and every entry in `inverse` (e.g. `"Row 0"` →
   `"Row 0 #row"`) — these fixtures currently rely on the "has children"
   heuristic this plan deletes; without the tag they'd silently stop being
   rows and every fixture's expected violation would vanish.
2. Rename the `indent-inconsistent` inverse fixture key to
   `indent-step-inconsistent`; adjust its row-1 x-offset so it forms a THIRD,
   unevenly-spaced cluster relative to row-0/row-2 (clusters need 3 to have
   two deltas to compare) rather than a same-depth misalignment (the old
   model's shape) — e.g. shift row-1's `#content-start` x by +8 relative to
   row-0/row-2's shared x, so it becomes its own cluster whose step from
   row-0's cluster doesn't match the row-2 cluster's step.
3. Delete the `row-height-inconsistent` inverse fixture entirely (the rule it
   proved is gone).
4. Add a new top-level key `regressions` with one fixture,
   `flatTreeNodeList`, porting the exact geometry from
   `/Users/milad/.claude/jobs/749776d3/tmp/geo-dogfood.mjs`: a root
   (`itemSpacing: 0`) with 6 `#row`-tagged children in document/paint order —
   2 phase rows (height 28, `#content-start` x=2949) and 4 agent rows (height
   36, `#content-start` x=2973) — each row also carrying a `#rail`/`#anchor`
   pair consistent with the pristine fixture's shape so the rail/anchor rules
   don't spuriously fire on this fixture (this regression targets the
   row/depth model specifically, not rail-span). y-values follow the real
   component's stacked layout (row N's y = sum of previous rows' heights,
   `itemSpacing` 0).
5. Verify: no test run yet (corpus wiring happens in Slice 6) — just
   `cat test/fixtures/geometry-corpus.json | node -e "JSON.parse(require('fs').readFileSync(0))"`
   to confirm valid JSON before the test slice consumes it.

### Slice 6 — corpus test wiring + regression assertion (`testable: true`)

1. `packages/kit/src/design-kit/geometry-corpus.test.js`: update the
   rule-coverage array in both the `it('covers every geometry rule...')`
   assertion and the `for (const rule of [...])` loop: replace
   `'indent-inconsistent'` with `'indent-step-inconsistent'`, remove
   `'row-height-inconsistent'`, remove `'content-start-misaligned'` from this
   list (per the Known Limitation — add a one-line comment: "not reachable
   through the composed pipeline by construction; unit-tested directly in
   geometry-rules.test.ts, see geometry-row-model-fix.md").
2. Add:
   ```js
   describe('regression: flat instance-list (geometry-row-model-mismatch.md, 2026-07-08 dogfood)', () => {
     it('produces zero violations on a real 6-row flat tree/list render', () => {
       expect(runPureGeometryAudit(corpus.regressions.flatTreeNodeList)).toEqual([])
     })
   })
   ```
3. Verify: `cd packages/kit && bun test src/design-kit/geometry-corpus.test.js`
   — this is the actual red-green proof the defect is fixed: red before Slice
   4-5 land (the old heuristics would produce ~40 false positives on this
   fixture, matching the live dogfood finding), green after.

### Slice 7 — docs (`testable: false`, `requiresLaunch: false`)

1. `skills/figma-audit/SKILL.md:47-69`: replace "same-depth rows share one
   indent/height" with: "rows are declared via `#row`, never inferred from
   DOM shape; depth is derived by clustering rows on their own
   `#content-start` x (no DOM-nesting inference, no variant-property read);
   distinct depths must be evenly spaced by one derived indent unit; row
   height is NOT required to be uniform across rows (kind-varying height,
   e.g. a 28px phase row next to a 36px agent row, is legitimate)."
2. Verify: re-read the edited paragraph; `grep -n "indent/height" skills/figma-audit/SKILL.md`
   → no hits after the edit.

## Verification (whole plan)

- `cd packages/kit && bun test src/design-kit/role-tags.test.ts src/design-kit/geometry-rules.test.ts src/design-kit/geometry-corpus.test.js && bun run build`
  after Slice 6; re-run once more after Slice 7's doc-only edit (no behavior
  change expected).
- The regression fixture (Slice 5-6) going from would-be ~40 violations
  (pre-fix heuristics) to `[]` (post-fix) is the actual proof this defect is
  closed — this is the ONE assertion that matters most in this plan; every
  other slice exists to make it pass without breaking the existing pristine/
  inverse corpus contract.
- Every existing geometry rule NOT touched by this plan
  (`loadBearingVisibilityViolations`, `crossAxisAnchorOffsetViolations`,
  `hugOverflowViolations`, `touchTargetViolation`, `wcagContrastCheckViolation`,
  `railAnchorSpanViolation`, `interRowContinuityViolations`,
  `missingRoleTagsViolation`, `geometryViolationsForTarget`,
  `isGeometryCheckedCategory`) keeps passing unmodified in
  `geometry-rules.test.ts` and `geometry-corpus.test.js` — confirms this fix
  is scoped to row/depth only, no collateral regression.

## Risks & assumptions

- **`contentStartAlignmentViolations` is unreachable through the composed
  pipeline** (Known Limitation, above) — accepted per the design direction's
  explicit (a)/(b) split; a future change to the clustering algorithm (e.g.
  chained nearest-neighbor instead of anchor-value clustering) could make it
  reachable again, at which point its existing unit tests already prove it
  correct.
- **A real misaligned row that happens to land exactly one derived indent
  unit away from an existing cluster is indistinguishable from a legitimate
  deeper row** — same edge case the pre-fix design already accepted
  (mismatch doc's own Risks section), not newly introduced by this fix.
- **`#row` tag adoption is manual, forward-only** — a project whose component
  author tags `#content-start`/`#rail`/`#anchor` but never tags `#row` gets
  zero row-based geometry checks silently (rows resolve to `[]`), because
  `#row` counts toward `hasAnyRoleTag` alongside the other three roles, so
  `missing-role-tags` won't fire either. This is the same opt-in/silent-no-op
  posture already accepted for the other three roles in the original plan's
  Risks section, now extended consistently to `#row` rather than special-
  cased — flagged here per this agent's mandate, not a new gap this plan
  introduces without precedent.
- **`geometryTolerancePx` (default 1px) is reused as both the clustering
  distance threshold AND the indent-step tolerance** — no new tolerance
  concept introduced (matches the original plan's single-global-tolerance
  decision and its own accepted "split later if a live finding demands it"
  stance).
