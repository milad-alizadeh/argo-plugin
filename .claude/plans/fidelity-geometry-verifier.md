# Blind design-fidelity verifier: geometry layer + VLM layer + two design-guard fixes

Grounded against `/Users/milad/Developer/argo-plugin` at `packages/kit@0.18.0`.
Builds directly on top of `.claude/plans/verification-hardening.md` (landed,
all 6 slices done per `verification-hardening-progress.md`) — that plan
already shipped `screen-viewport-mismatch`, `text-truncation`,
`unclipped-overflow`, and the `agents/fidelity-verifier.md` blind agent this
plan promotes from prose-only to structured (geometry fact sheet + category
rubric). Read `tier0-audit.ts`, `tier0-rules.ts`,
`recipes/shadcn-tailwind/tier0-{rules,walker}.ts`,
`skill-scripts/prepare-tier0-audit-options.ts`, `hooks/design-guard-{record,stop}.ts`,
`lib/session-guard.ts`, `agents/{design,fidelity}-verifier.md`,
`skills/figma-create/SKILL.md`, `test/fixtures/kit-corpus.json`,
`test/helpers/runPureTier0Audit.mjs`, `component-categories.ts`, `bin/argo.js`
end to end before writing this.

## Owner mandate (repeated so every slice is graded against it)

Very simple, effective checks. No em dashes. Dead/redundant work deleted, not
deprecated. No speculative features, no gates beyond the ones named in the
task brief. Simplest reliable version wins over completeness.

## Approach — no architect panel

This is a settled council design (per the task brief) being implemented, not
designed from scratch, and its shape is also the only shape consistent with
the codebase's own established convention: **pure predicate functions,
walker-marshaled plain-object node shapes, wired through `report()`,
unit-tested via an R7-style fixture corpus** — exactly `tier0-rules.ts` +
`tier0-audit.ts` + `kit-corpus.json`'s existing pattern. The one real
architectural choice is **where the geometry pass lives relative to the
existing per-node walk**, because geometry rules are inherently
cross-sibling/cross-row, not per-node:

- **Per-node walk (rejected).** `auditNode` runs once per node with no
  visibility into siblings or the whole subtree; sibling-alignment/rail-span
  checks structurally cannot be expressed as a per-node predicate.
- **New subtree-pass module, run once per audited component root (chosen).**
  A new `geometry-rules.ts` (pure functions, same unit-test contract as
  `tier0-rules.ts`) takes one fully-marshaled plain tree (not a stream of
  individual node calls) and returns violations for the whole subtree at
  once. A new walker function `marshalGeometryTree` (in `tier0-audit.ts`,
  same file/pattern as the existing `marshalGapPaddingField`) builds that
  tree once per named-audit target, mirroring the recipe-extension-point
  shape (`options.runRecipeTier0Checks`) already used for the shadcn-tailwind
  recipe's own hook: `runTier0Audit` grows a **new, symmetric extension
  point** `options.runGeometryChecks(rootNode)`, wired only when the caller
  opts in (a category-scoped audit — see Slice 9), so a plain-button
  named-audit that has no geometry-relevant rows never pays the marshal cost.

This is minimal-change relative to the existing mechanism (same file
conventions, one new sibling extension point, no new package, no new data
model) — the two other lenses (clean-architecture: a whole new tier;
pragmatic: bolt geometry into `auditNode` per-node with global mutable
accumulators) both cost more for no behavioral gain the owner asked for, so
no panel vote is needed; this is presented as the chosen shape, flagged for a
one-line confirm rather than a full council pass.

## Grounded facts this plan depends on

- `tier0-audit.ts:376-483` (`runTier0Audit`) is the single entry every
  caller (`figma-audit`, `figma-sync`, `figma-create`) shares; its
  `options` object is the ONLY channel data crosses the `use_figma` sandbox
  boundary (doc comment, `tier0-audit.ts:10-17`).
- Node/variable shapes are `AnyNode = Record<string, any>` throughout
  `tier0-rules.ts:21` — this plan's new functions follow the exact same
  typing convention, no new domain model.
- The R7 fixture corpus (`test/fixtures/kit-corpus.json`) is **"one pristine
  instance per rule category... NOT a general snapshot framework"**
  (`kit-corpus.test.js:12-13`) — new geometry fixtures follow that same
  economy, not one fixture per rule variant.
- `test/helpers/runPureTier0Audit.mjs` "must stay in lock-step with which
  rules the real walker runs" (its own header, line 8-9) — every new rule
  wired into `tier0-audit.ts` gets a matching call added here in the same
  slice, never deferred.
- `component-categories.ts` is the existing config-driven-enum precedent
  (`componentCategories` in `design.<app>`, `resolveComponentCategories`,
  `isCategoryInEnum`) — this plan's new `geometryCategories` config follows
  the identical shape.
- `bin/argo.js:64-76` (`DESIGN_VERBS`) is the CLI-verb registration point for
  every new skill-script this plan adds.
- The Figma `use_figma` MCP tool's `tool_input` schema is **owned by the
  Figma MCP plugin, not this repo** — `design-guard-record.ts` only reads
  the fields it already knows exist (`fileKey`, `skillNames`) via optional
  chaining; this repo has never had visibility into whether the tool_input
  carries the executed JS source under a stable field name. **This is a
  load-bearing open decision for Slice 13 (design-guard defect 1) — flagged
  there, not guessed past.**

## Open decisions — RESOLVED 2026-07-08 (owner approved all recommendations)

All five resolved as the planner recommended; build proceeds on these:
1. Role tags = `#content-start` / `#rail` / `#anchor` layer-name suffix (regex).
2. Tolerance = a single `geometryTolerancePx` (default 1); rail-continuity gap allowance = the row's real `itemSpacing` + `geometryTolerancePx`.
3. Generic-check scope = contrast/touch-target opt in via a `#hit-target` tag; HUG-overflow auto-applies to HUG nodes.
4. Rubric authoring = `templates/design/category-rubrics/<category>.md`, human-authored once per category.
5. Read/write distinction (defect 1) = Option A, reuse the existing `skillNames` opt-in tag mechanism (no new schema dependency).

## Open decisions (flagged, not guessed past)

1. **Role-tag syntax.** Task brief allows "layer-name suffix or component
   property." **Recommendation: layer-name suffix**, `#<role>` at the end of
   `node.name` (e.g. `Row Content #content-start`, `Connector #rail`,
   `Icon #anchor`), parsed by a plain regex — zero new Plugin-API surface,
   matches the existing regex-based convention (`nonSemanticNameViolation`,
   `isDesignPageName`). Component-property tagging would need
   `componentPropertyDefinitions` reads + variant-consistency handling for no
   behavioral gain at this scope. Confirm before Slice 1; the rest of this
   plan assumes the suffix form.
2. **Geometry tolerance/epsilon values.** The task says "0-1px tolerance" for
   coordinate checks and "token-derived epsilon" for rail continuity. No
   token collection name for a "connector gap" spacing value is grounded in
   this repo today (`design/registry.json`/semantic-manifest are host-project
   artifacts, not present here). **Recommendation:** ship a single configured
   `geometryTolerancePx` (default `1`) in `design.<app>`, and for rail
   continuity accept a gap up to `itemSpacing` (already a real, resolved
   field on the row's Auto Layout container) plus `geometryTolerancePx` —
   this makes "token-derived" concrete without inventing a new token concept.
   Confirm before Slice 4.
3. **Which node types opt into the generic checks (HUG-overflow, contrast,
   touch-target).** The task's role tags (`contentStart`/`rail`/`anchor`)
   don't cover interactivity. **Recommendation:** touch-target and contrast
   checks scope to nodes carrying a 4th, optional role tag `#hit-target` (an
   opt-in a component author adds only where relevant — a plain label or
   decorative icon never needs one); HUG-overflow scopes to any node with
   `layoutSizingHorizontal/Vertical === 'HUG'` (no tag needed, structural).
   Confirm before Slice 8.
4. **Category rubric authoring location.** No `design/` category-rubric
   artifact exists in this repo today (host-project concept). **Recommendation:**
   a new template `templates/design/category-rubrics/<category>.md` (one per
   `componentCategories`/list-shaped category, e.g. `list.md`, `tree.md`,
   `table.md`, `nav.md`), each with a fixed frontmatter shape
   (`category`, `visualCriteria: string[]`) — authored once per category by a
   human/design-system owner, never generated. Confirm before Slice 10.
5. **`use_figma` read/write distinction (defect 1).** No grounded field name
   for "this call is read-only" exists in this repo's visibility of the tool
   schema. Two real options, laid out in Slice 13 — **pick one before that
   slice is built**, this plan does not guess.

## Files to change

New:
- `packages/kit/src/design-kit/geometry-rules.ts` — pure geometry predicate
  functions (mirrors `tier0-rules.ts`).
- `packages/kit/src/design-kit/geometry-rules.test.ts`.
- `packages/kit/src/design-kit/role-tags.ts` — `roleTagOf`, `findByRole`,
  `groupByRole` helpers shared by every geometry rule.
- `packages/kit/src/design-kit/role-tags.test.ts`.
- `packages/kit/src/design-kit/contrast.ts` — WCAG relative-luminance +
  contrast-ratio pure math.
- `packages/kit/src/design-kit/contrast.test.ts`.
- `test/fixtures/geometry-corpus.json` — R7-style pristine + inverse fixtures
  for the geometry rules (kept separate from `kit-corpus.json` because its
  shape is subtree trees, not flat node lists — see Slice 9).
- `test/helpers/runPureGeometryAudit.mjs` — lock-step pure re-implementation,
  mirroring `runPureTier0Audit.mjs`.
- `templates/design/category-rubrics/list.md`, `tree.md`, `table.md`, `nav.md`
  — category visual-criteria templates (open decision 4).
- `packages/kit/src/skill-scripts/assemble-fidelity-rubric.ts` — mechanically
  assembles a category template + brief-named requirements into the rubric
  `fidelity-verifier` gets (never build-transcript content).
- `packages/kit/src/skill-scripts/assemble-fidelity-rubric.test.ts`.

Edited:
- `packages/kit/src/design-kit/tier0-audit.ts` — new `marshalGeometryTree`,
  new `options.runGeometryChecks` extension point, wiring in
  `runTier0Audit`'s named-audit path only.
- `packages/kit/src/skill-scripts/prepare-tier0-audit-options.ts` — reads
  `geometryTolerancePx`, `geometryCategories` from `design.<app>`.
- `packages/kit/src/skill-scripts/prepare-tier0-audit-options.test.ts`.
- `packages/kit/bin/argo.js` — register `assemble-fidelity-rubric` (and,
  for defect 2, `ack-pending-work`) in `DESIGN_VERBS`.
- `agents/fidelity-verifier.md` — fidelity-mode variant: category rubric
  input, geometry-FAIL short-circuit, spawn-only-when-non-empty-criteria,
  zoomed per-row crop requirement for icon-identity criteria, montage
  enumeration-or-fail-closed instruction, explicit typo-out-of-scope line.
- `skills/figma-create/SKILL.md` — step 4 rewritten: numeric predicates (a),
  (b), (c) replaced by "geometry audit passes" (Layer A call), prose critique
  replaced by "spawn `fidelity-verifier` in fidelity mode" (Layer B call).
- `skills/figma-audit/SKILL.md` — document the new `runGeometryChecks`
  extension point + `geometryTolerancePx`/`geometryCategories` options
  fields, same place the `viewport` field was documented.
- `packages/kit/src/hooks/design-guard-record.ts` — defect 1 fix (Slice 13).
- `packages/kit/src/hooks/design-guard-record.test.ts` — new cases.
- `packages/kit/src/hooks/design-guard-stop.ts` — defect 2 affordance
  (Slice 14).
- `packages/kit/src/hooks/design-guard-stop.test.ts` — new cases.
- `packages/kit/src/lib/session-guard.ts` — new pending-ack helpers
  (Slice 14).
- `packages/kit/src/lib/session-guard.test.ts` — new cases (file exists per
  the module's own test conventions; confirm exact path at Slice 14 start,
  create alongside `session-guard.ts` if it doesn't).

## Part 1 — Layer A: deterministic geometry checks

### Slice 1 — role-tagging contract (`testable: true`, `requiresLaunch: false`)

New tier-0 rule requiring the role-tag suffix wherever a geometry rule needs
one, so geometry never guesses which node is which (task's explicit ask).

1. `packages/kit/src/design-kit/role-tags.ts`:
   ```ts
   export type Role = 'content-start' | 'rail' | 'anchor' | 'hit-target'
   const ROLE_SUFFIX = /#(content-start|rail|anchor|hit-target)$/

   export function roleTagOf(node: { name?: string }): Role | null {
     const m = ROLE_SUFFIX.exec(String(node?.name ?? '').trim())
     return (m?.[1] as Role) ?? null
   }

   /** First descendant (depth-first, self included) carrying `role`, or null. */
   export function findByRole(tree: any, role: Role): any | null {
     if (roleTagOf(tree) === role) return tree
     for (const child of tree?.children ?? []) {
       const hit = findByRole(child, role)
       if (hit) return hit
     }
     return null
   }

   /** Every direct-or-nested descendant carrying `role`, depth-first order. */
   export function findAllByRole(tree: any, role: Role): any[] {
     const out: any[] = []
     const walk = (n: any) => {
       if (roleTagOf(n) === role) out.push(n)
       for (const c of n?.children ?? []) walk(c)
     }
     walk(tree)
     return out
   }
   ```
2. `packages/kit/src/design-kit/role-tags.test.ts`: `roleTagOf` recognizes
   each of the 4 roles, returns `null` for an untagged name and for an
   unknown `#foo` suffix (fails closed — never guesses a role); `findByRole`/
   `findAllByRole` over a small synthetic tree (3-4 nodes).
3. **New tier-0 rule** in `tier0-rules.ts`, near `nonSemanticNameViolation`:
   a node inside a category opted into geometry checks (see Slice 9's
   `geometryCategories`) that structurally NEEDS a role (its parent frame is
   named audited AND the category requires `content-start`/`rail`/`anchor`
   presence) but has zero role-tagged descendants at all is a **hard**
   violation `missing-role-tags` — this is the "arm the geometry pass"
   precondition, not a per-node check; wire it as a single check at the
   named-audit ROOT only (same place `screenViewportMismatchViolation` reads
   `isScreenFrame`), not per-node — add:
   ```ts
   export function missingRoleTagsViolation(
     root: AnyNode,
     { requiresRoleTags }: { requiresRoleTags: boolean }
   ): Violation | null {
     if (!requiresRoleTags) return null
     if (findAllByRoleAny(root)) return null
     return { rule: 'missing-role-tags', detail: 'component is in a geometry-checked category but has no #content-start/#rail/#anchor tagged nodes' }
   }
   ```
   (`findAllByRoleAny` — small local helper checking all 4 roles at once,
   defined alongside; kept in `role-tags.ts` as `hasAnyRoleTag(tree)`).
4. Tests: `missingRoleTagsViolation` flags a `requiresRoleTags: true` root
   with zero tags, passes with at least one, passes when `requiresRoleTags`
   is false (opt-in, non-breaking for a category that never geometry-checks).
5. Verify: `cd packages/kit && bun test src/design-kit/role-tags.test.ts src/design-kit/tier0-rules.test.ts`

### Slice 2 — geometry tree marshaling (`testable: true`, `requiresLaunch: false`)

1. In `tier0-audit.ts`, add (near `marshalGapPaddingField`):
   ```ts
   /**
    * Builds ONE plain-object subtree per audited component root, carrying
    * every field the geometry rules read directly off the real Plugin API
    * node (x/y/width/height come from absoluteBoundingBox, already resolved
    * post-layout — no live-measurement round trip needed, unlike the
    * text-clipping gap figma-create's step-4 doc calls out as untestable).
    * Runs once per named-audit root, not per node — the geometry rules
    * consume the WHOLE tree at once (see geometry-rules.ts's doc comment for
    * why a per-node walk can't express sibling/row comparisons).
    */
   function marshalGeometryTree(node: any): any {
     const box = node.absoluteBoundingBox ?? {}
     return {
       id: node.id,
       name: node.name,
       type: node.type,
       x: box.x, y: box.y, width: box.width, height: box.height,
       visible: node.visible,
       opacity: node.opacity,
       clipsContent: node.clipsContent,
       layoutSizingHorizontal: node.layoutSizingHorizontal,
       layoutSizingVertical: node.layoutSizingVertical,
       itemSpacing: node.itemSpacing,
       layoutMode: node.layoutMode,
       fills: node.fills,
       characters: node.type === 'TEXT' ? node.characters : undefined,
       children: (node.children ?? []).map(marshalGeometryTree)
     }
   }
   ```
2. Add `options.runGeometryChecks?: (root: any) => any[]` to
   `runTier0Audit`'s type/destructure, and call it ONLY in the
   `componentNodeIds`/`componentNames` named-audit branches (never the
   file-wide sweep — geometry checks are named-audit only, matching the
   task's category-scoped framing), right after `walk(match, ...)` for each
   resolved target:
   ```ts
   if (typeof runGeometryChecks === 'function') {
     violations.push(...runGeometryChecks(marshalGeometryTree(match)))
   }
   ```
3. No new unit test for `marshalGeometryTree` itself (same documented
   accepted gap as every other Plugin-API marshaling function in this file —
   `tier0-audit.ts` has zero unit coverage by design, proven only through the
   pure functions + `runPureGeometryAudit.mjs` + the fixture corpus).
4. Verify: `cd packages/kit && bun run build` (typecheck only — this file has
   no direct test).

### Slice 3 — content-start alignment (collapses rules 1+2, `testable: true`)

The task lists "sibling content-start x alignment" and "fixed-slot invariant
for conditional leading elements" as two separate bullets, but both reduce to
the SAME predicate: every sibling row's `#content-start` resolves to the same
absolute x. A row that gained/lost a leading icon and a row that's simply
misaligned are both caught by one comparison — shipping two rule names for
one check would be exactly the duplication the owner mandate forbids. One
rule, `rule: 'content-start-misaligned'`, covers both task bullets.

1. `packages/kit/src/design-kit/geometry-rules.ts`:
   ```ts
   import { findAllByRole } from './role-tags.js'

   export type GeometryViolation = { rule: string; detail: string; nodeId?: string }

   /**
    * Every sibling row at the same depth under `rows` (already-resolved by the
    * caller — see marshalRowGroups in tier0-audit.ts) must place its
    * #content-start descendant at the SAME absolute x. A conditional leading
    * icon that shifts one row's content relative to its siblings is exactly
    * what this catches (task's motivating example) — same predicate as the
    * "fixed-slot invariant," not a second rule.
    */
   export function contentStartAlignmentViolations(rows: any[], toleragePx: number): GeometryViolation[] {
     const starts = rows
       .map((row) => ({ row, node: findAllByRole(row, 'content-start')[0] }))
       .filter((r) => r.node)
     if (starts.length < 2) return []
     const baseline = starts[0].node.x
     const violations: GeometryViolation[] = []
     for (const { row, node } of starts.slice(1)) {
       if (Math.abs(node.x - baseline) > toleragePx) {
         violations.push({
           rule: 'content-start-misaligned',
           nodeId: node.id,
           detail: `row "${row.name}"'s #content-start is at x=${node.x}, expected x=${baseline} (matching its first sibling) — a conditional leading element likely shifted this row's content`
         })
       }
     }
     return violations
   }
   ```
2. In `tier0-audit.ts`, add a small row-grouping helper the geometry pass
   uses before calling the rule functions (this is the "caller resolves row
   groups" the doc comment above references):
   ```ts
   /** Rows = the marshaled tree's own direct children that are themselves
    * containers (have children) — the flat per-item unit every list/tree/
    * table/nav category renders. A leaf-only tree (no rows) yields []. */
   function marshalRowGroups(tree: any): any[] {
     return (tree.children ?? []).filter((c: any) => (c.children ?? []).length > 0)
   }
   ```
   Exported alongside `marshalGeometryTree` for the geometry-checks wiring in
   Slice 9 to call once and pass to every row-based rule (Slices 3-5, 7).
3. Tests (`geometry-rules.test.ts`): 3 sibling rows with matching
   content-start x → `[]`; one row shifted by icon presence → 1 violation
   citing that row's node id; a single row (nothing to compare) → `[]`;
   a row missing `#content-start` entirely → skipped, not a crash (that gap
   is `missing-role-tags`' job from Slice 1, not this rule's).
4. Verify: `cd packages/kit && bun test src/design-kit/geometry-rules.test.ts`

### Slice 4 — connector rail anchor-span (`testable: true`)

Confirm open decision 2 (tolerance) before starting.

1. Add to `geometry-rules.ts`:
   ```ts
   /**
    * A tree's connector rail (#rail) must span from the tree ROOT's own
    * #anchor y-center to the LAST child row's #anchor y-center — two-sided:
    * catches both overshoot (rail runs past the last item) and undershoot
    * (rail stops short of it). y-center, not y, because a rail visually
    * connects dot-centers, not box tops.
    */
   export function railAnchorSpanViolation(tree: any, rows: any[], tolerancePx: number): GeometryViolation | null {
     const rail = findAllByRole(tree, 'rail')[0]
     const rootAnchor = findAllByRole(tree, 'anchor').find((a) => !rows.some((r) => findAllByRole(r, 'anchor').includes(a)))
     const lastRow = rows[rows.length - 1]
     const lastAnchor = lastRow ? findAllByRole(lastRow, 'anchor')[0] : null
     if (!rail || !rootAnchor || !lastAnchor) return null
     const expectedStart = rootAnchor.y + rootAnchor.height / 2
     const expectedEnd = lastAnchor.y + lastAnchor.height / 2
     const actualStart = rail.y
     const actualEnd = rail.y + rail.height
     if (Math.abs(actualStart - expectedStart) <= tolerancePx && Math.abs(actualEnd - expectedEnd) <= tolerancePx) return null
     return {
       rule: 'rail-anchor-span-mismatch',
       nodeId: rail.id,
       detail: `rail spans y=${actualStart}..${actualEnd}, expected y=${expectedStart}..${expectedEnd} (parent anchor to last-child anchor center) — overshoot or undershoot`
     }
   }
   ```
2. Tests: exact match → null; rail 3px short (undershoot) → violation citing
   both ranges; rail 3px long (overshoot) → violation; no `#rail` tag present
   → null (Slice 1's `missing-role-tags` owns that gap, not a false crash
   here).
3. Verify: `cd packages/kit && bun test src/design-kit/geometry-rules.test.ts`

### Slice 5 — inter-row rail continuity + indent/row-consistency (`testable: true`)

1. Add to `geometry-rules.ts`:
   ```ts
   /** No vertical gap between consecutive rows' own bounding boxes beyond
    * itemSpacing + tolerancePx — a real rendered gap larger than the row
    * container's own configured gap means the rail visually breaks. */
   export function interRowContinuityViolations(rows: any[], itemSpacing: number, tolerancePx: number): GeometryViolation[] {
     const violations: GeometryViolation[] = []
     for (let i = 1; i < rows.length; i++) {
       const gap = rows[i].y - (rows[i - 1].y + rows[i - 1].height)
       if (gap > itemSpacing + tolerancePx) {
         violations.push({
           rule: 'rail-continuity-gap',
           nodeId: rows[i].id,
           detail: `gap of ${gap}px between row "${rows[i - 1].name}" and "${rows[i].name}" exceeds the configured itemSpacing (${itemSpacing}px) + tolerance`
         })
       }
     }
     return violations
   }

   /** Every row at the same tree DEPTH must share one x-offset delta from its
    * parent depth (indent step), and rows at any one depth must share one
    * height and one itemSpacing — computed from the marshaled rows, no
    * hardcoded step value (a project's indent unit is whatever its rows
    * actually render at). */
   export function indentAndRowConsistencyViolations(rowsByDepth: Map<number, any[]>, tolerancePx: number): GeometryViolation[] {
     const violations: GeometryViolation[] = []
     for (const [depth, rows] of rowsByDepth) {
       if (rows.length < 2) continue
       const baselineX = rows[0].x
       const baselineHeight = rows[0].height
       for (const row of rows.slice(1)) {
         if (Math.abs(row.x - baselineX) > tolerancePx) {
           violations.push({ rule: 'indent-inconsistent', nodeId: row.id, detail: `depth ${depth} row "${row.name}" is indented to x=${row.x}, expected x=${baselineX} (matching its depth siblings)` })
         }
         if (Math.abs(row.height - baselineHeight) > tolerancePx) {
           violations.push({ rule: 'row-height-inconsistent', nodeId: row.id, detail: `depth ${depth} row "${row.name}" has height ${row.height}, expected ${baselineHeight}` })
         }
       }
     }
     return violations
   }
   ```
2. In `tier0-audit.ts`, a `groupRowsByDepth(tree)` helper (BFS from root,
   tagging each row with its nesting depth) alongside `marshalRowGroups`,
   feeding `indentAndRowConsistencyViolations`.
3. Tests: 3 same-depth rows, one indented +8px → 1 `indent-inconsistent`;
   one row 4px taller → 1 `row-height-inconsistent`; a 40px gap against a
   16px itemSpacing + 1px tolerance → 1 `rail-continuity-gap`; a gap of
   exactly `itemSpacing` → `[]`.
4. Verify: `cd packages/kit && bun test src/design-kit/geometry-rules.test.ts`

### Slice 6 — visibility/opacity/clip predicate (`testable: true`)

The task calls this "the laziest cheat" — a node with correct coordinates
but invisible/clipped must fail.

1. Add to `geometry-rules.ts`:
   ```ts
   /** A role-tagged (load-bearing) node with correct coordinates but
    * invisible/zero-opacity/ancestor-clipped is a pass-the-coordinate-check
    * cheat — flag it explicitly rather than trusting geometry alone. Walks
    * the ancestor chain the caller supplies (tier0-audit.ts's marshal keeps
    * a parent pointer — see wireGeometryChecks) for opacity compounding and
    * clip-boundary containment. */
   export function loadBearingVisibilityViolations(taggedNodes: { node: any; ancestors: any[] }[]): GeometryViolation[] {
     const violations: GeometryViolation[] = []
     for (const { node, ancestors } of taggedNodes) {
       if (node.visible === false) {
         violations.push({ rule: 'load-bearing-node-hidden', nodeId: node.id, detail: `"${node.name}" is role-tagged but visible === false` })
         continue
       }
       const effectiveOpacity = [node, ...ancestors].reduce((acc, n) => acc * (typeof n.opacity === 'number' ? n.opacity : 1), 1)
       if (effectiveOpacity <= 0) {
         violations.push({ rule: 'load-bearing-node-transparent', nodeId: node.id, detail: `"${node.name}" resolves to effective opacity ${effectiveOpacity}` })
         continue
       }
       const clipper = ancestors.find((a) => a.clipsContent === true)
       if (clipper) {
         const outOfBounds = node.x < clipper.x || node.y < clipper.y || node.x + node.width > clipper.x + clipper.width || node.y + node.height > clipper.y + clipper.height
         if (outOfBounds) {
           violations.push({ rule: 'load-bearing-node-clipped', nodeId: node.id, detail: `"${node.name}" falls outside its clipping ancestor "${clipper.name}"'s bounds` })
         }
       }
     }
     return violations
   }
   ```
2. In `tier0-audit.ts`, a `collectRoleTaggedWithAncestors(tree)` helper
   (depth-first walk accumulating an `ancestors` array per role-tagged node)
   feeding this rule.
3. Tests: visible+opaque+unclipped → `[]`; `visible: false` → hidden;
   `opacity: 0` on the node itself → transparent; `opacity: 0` on an
   ancestor only (compounding) → transparent; positioned outside a
   `clipsContent: true` ancestor's box → clipped; positioned outside a
   NON-clipping ancestor's box → `[]` (not every overflow is a clip).
4. Verify: `cd packages/kit && bun test src/design-kit/geometry-rules.test.ts`

### Slice 7 — cross-axis anchor offset (`testable: true`)

1. Add to `geometry-rules.ts`:
   ```ts
   /** Every sibling row's #anchor must sit at the SAME y-offset RELATIVE to
    * its own row's top (not absolute y — rows are at different absolute y
    * by definition) — catches an anchor dot that's vertically off-center in
    * one row but not its siblings. */
   export function crossAxisAnchorOffsetViolations(rows: any[], tolerancePx: number): GeometryViolation[] {
     const offsets = rows.map((row) => {
       const anchor = findAllByRole(row, 'anchor')[0]
       return anchor ? { row, offset: anchor.y - row.y, anchor } : null
     }).filter(Boolean) as { row: any; offset: number; anchor: any }[]
     if (offsets.length < 2) return []
     const baseline = offsets[0].offset
     const violations: GeometryViolation[] = []
     for (const { row, offset, anchor } of offsets.slice(1)) {
       if (Math.abs(offset - baseline) > tolerancePx) {
         violations.push({ rule: 'anchor-cross-axis-offset', nodeId: anchor.id, detail: `row "${row.name}"'s #anchor sits ${offset}px from its row top, expected ${baseline}px (matching its siblings)` })
       }
     }
     return violations
   }
   ```
2. Tests: matching relative offsets across 3 rows → `[]`; one row's anchor
   3px lower relative to its own row top → 1 violation; rows with no anchor
   tag → skipped, `[]`.
3. Verify: `cd packages/kit && bun test src/design-kit/geometry-rules.test.ts`

### Slice 8 — generic checks: HUG-overflow, WCAG contrast, touch-target (`testable: true`)

Confirm open decision 3 before starting.

1. Add to `geometry-rules.ts`:
   ```ts
   /** A HUG-sized axis whose own children's combined box exceeds the node's
    * OWN rendered width/height is the combineAsVariants-freeze symptom
    * figma-create's step 4 flagged as untestable without live measurement —
    * but the walker already reads POST-LAYOUT absoluteBoundingBox, i.e. real
    * rendered geometry, not intent, so this is a plain comparison. */
   export function hugOverflowViolations(node: any): GeometryViolation[] {
     const violations: GeometryViolation[] = []
     for (const child of node.children ?? []) {
       if (node.layoutSizingHorizontal === 'HUG' && child.x + child.width > node.x + node.width) {
         violations.push({ rule: 'hug-overflow-horizontal', nodeId: node.id, detail: `"${node.name}" is HUG-horizontal but child "${child.name}" extends past its right edge` })
       }
       if (node.layoutSizingVertical === 'HUG' && child.y + child.height > node.y + node.height) {
         violations.push({ rule: 'hug-overflow-vertical', nodeId: node.id, detail: `"${node.name}" is HUG-vertical but child "${child.name}" extends past its bottom edge` })
       }
     }
     return violations
   }
   ```
2. `packages/kit/src/design-kit/contrast.ts` (new file, no Figma-specific
   shapes — pure WCAG 2.1 math, reused across projects):
   ```ts
   type RGB = { r: number; g: number; b: number } // 0-255

   function relativeLuminance({ r, g, b }: RGB): number {
     const chan = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
     return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)
   }

   export function contrastRatio(a: RGB, b: RGB): number {
     const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
     return (l1 + 0.05) / (l2 + 0.05)
   }

   /** WCAG AA: 4.5:1 for normal text, 3:1 for large text (>=18pt or >=14pt bold). */
   export function wcagContrastViolation(fg: RGB, bg: RGB, isLargeText: boolean): { rule: string; detail: string } | null {
     const ratio = contrastRatio(fg, bg)
     const threshold = isLargeText ? 3 : 4.5
     if (ratio >= threshold) return null
     return { rule: 'wcag-contrast-fail', detail: `contrast ratio ${ratio.toFixed(2)}:1 is below the WCAG AA threshold (${threshold}:1 for ${isLargeText ? 'large' : 'normal'} text)` }
   }
   ```
3. Add to `geometry-rules.ts`:
   ```ts
   const MIN_TOUCH_TARGET_PX = 24 // configurable — see prepare-tier0-audit-options wiring

   export function touchTargetViolation(node: any, minPx: number = MIN_TOUCH_TARGET_PX): GeometryViolation | null {
     if (node.width >= minPx && node.height >= minPx) return null
     return { rule: 'touch-target-too-small', nodeId: node.id, detail: `#hit-target "${node.name}" is ${node.width}x${node.height}, below the ${minPx}x${minPx}px minimum` }
   }
   ```
4. Tests (`geometry-rules.test.ts` + `contrast.test.ts`): HUG-horizontal
   container with an overflowing child → violation; HUG container whose
   children fit → `[]`; a non-HUG container with an "overflowing" child →
   `[]` (not this rule's job — `unclippedOverflowViolations` already covers
   general overflow); `contrastRatio(white, black)` ≈ 21 (known WCAG value);
   `contrastRatio` of identical colors === 1; `wcagContrastViolation` passes
   at exactly 4.5 and 3.0, fails just under each threshold, respects the
   large-text carve-out; `touchTargetViolation` passes at exactly 24x24,
   fails at 23x24 or 24x23, respects a configured `minPx`.
5. Verify: `cd packages/kit && bun test src/design-kit/geometry-rules.test.ts src/design-kit/contrast.test.ts`

### Slice 9 — wire the geometry pass + `geometryCategories` config + docs (`testable: true`)

1. `packages/kit/src/design-kit/component-categories.ts`: no change needed —
   reuse `componentCategories` directly; add a NEW, separate config array
   `geometryCategories` (a subset of `componentCategories` that structurally
   have rows — list/tree/table/nav) rather than overload the existing enum
   with new semantics.
2. `prepare-tier0-audit-options.ts`: add to `deriveTier0AuditOptions`'s
   returned object:
   ```ts
   geometryTolerancePx: designBlock?.geometryTolerancePx ?? 1,
   geometryCategories: Array.isArray(designBlock?.geometryCategories) ? designBlock.geometryCategories : []
   ```
3. `tier0-audit.ts`: compose one `runGeometryChecks(root)` closure in the
   generated bundle entry (`bundle-tier0-audit`'s job — see below), calling,
   in order: `missingRoleTagsViolation`, `contentStartAlignmentViolations`,
   `railAnchorSpanViolation`, `interRowContinuityViolations`,
   `indentAndRowConsistencyViolations`, `loadBearingVisibilityViolations`,
   `crossAxisAnchorOffsetViolations`, `hugOverflowViolations` (per row +
   root), `touchTargetViolation` (per `#hit-target` node found). Severity:
   `hard` for every rule except `missing-role-tags` when the target's
   category isn't in `geometryCategories` (opt-in — never fires for a
   category that structurally has no rows, e.g. a plain Button).
4. `packages/kit/src/skill-scripts/bundle-tier0-audit.ts` (existing file,
   read it at Slice-9 start to confirm its current shape before editing):
   thread `geometryTolerancePx`/`geometryCategories` the same way
   `semanticCollectionName` already flows into the generated entry module,
   importing `geometry-rules.js`/`role-tags.js`/`contrast.js` alongside the
   recipe's own tier0-walker import.
5. `skills/figma-audit/SKILL.md`: document the new options fields at the
   same place `viewport` was documented (`prepare-tier0-audit-options`'s
   returned-field list).
6. `test/fixtures/geometry-corpus.json` — ONE pristine tree fixture (a
   3-row list with matching `#content-start`/`#anchor` on every row, a
   `#rail` spanning correctly, uniform indent/height/spacing) that produces
   zero geometry violations, plus ONE inverse fixture per rule category
   (mirroring `kit-corpus.json`'s "one pristine + one inverse per rule"
   economy — NOT one inverse per numeric edge case, those live in
   `geometry-rules.test.ts`'s own unit tests).
7. `test/helpers/runPureGeometryAudit.mjs`: pure re-implementation calling
   every geometry rule in the SAME order as step 3 above, over the
   fixture's already-marshaled tree shape — mirrors `runPureTier0Audit.mjs`'s
   contract exactly.
8. New `packages/kit/src/design-kit/geometry-corpus.test.js` (same shape as
   `kit-corpus.test.js`): pristine tree → `[]`; each inverse fixture flags
   its target rule.
9. Verify: `cd packages/kit && bun test src/ && bun run build`

## Part 2 — Layer B: blind VLM fidelity verifier (category rubric mode)

### Slice 10 — category rubric templates + assembler (`testable: true`)

Confirm open decision 4 before starting.

1. `templates/design/category-rubrics/list.md` (and `tree.md`, `table.md`,
   `nav.md`), fixed frontmatter shape, e.g.:
   ```md
   ---
   category: list
   visualCriteria:
     - id: icon-identity
       prompt: "Does each row's leading icon match its semantic meaning (not just present, the correct glyph)?"
       requiresZoomedCrop: true
     - id: hover-affordance
       prompt: "Does a hovered/selected row read as visually distinct from an idle row?"
       requiresZoomedCrop: false
   ---
   ```
   These are authored once, by a human, never generated — a plain button
   category template can legitimately have `visualCriteria: []` (empty —
   the cost lever the task names: no visual criteria, no VLM spawn).
2. `packages/kit/src/skill-scripts/assemble-fidelity-rubric.ts`:
   ```ts
   type Criterion = { id: string; prompt: string; requiresZoomedCrop: boolean }
   type Rubric = { category: string; criteria: Criterion[] }

   /** Mechanically merges the category template's fixed visual criteria with
    * brief-NAMED requirements only (never the build transcript, never the
    * builder's self-report — same isolation contract as design-verifier's
    * PRD-checklist assembly). `briefRequirements` are id/prompt pairs the
    * caller has already extracted Node-side from the screen brief's own
    * "Regions -> component map" — this function does no PRD parsing itself. */
   export function assembleFidelityRubric(
     categoryTemplate: Rubric,
     briefRequirements: { id: string; prompt: string; requiresZoomedCrop?: boolean }[]
   ): Rubric {
     return {
       category: categoryTemplate.category,
       criteria: [
         ...categoryTemplate.criteria,
         ...briefRequirements.map((r) => ({ id: r.id, prompt: r.prompt, requiresZoomedCrop: r.requiresZoomedCrop ?? false }))
       ]
     }
   }

   /** Cost lever (task's explicit ask): a category with zero visual criteria
    * never spawns the VLM agent — a plain button stays geometry-only. */
   export function shouldSpawnFidelityVerifier(rubric: Rubric): boolean {
     return rubric.criteria.length > 0
   }
   ```
3. Tests: merges template + brief criteria preserving order; empty template +
   empty brief → `shouldSpawnFidelityVerifier` is `false`; non-empty either
   side → `true`; duplicate `id` across template/brief is NOT de-duped (an
   explicit brief override of a template criterion is a same-id append, left
   to the human rubric author to avoid — YAGNI, no dedup logic speculatively
   added without a live collision).
4. Register `assemble-fidelity-rubric` in `bin/argo.js`'s `DESIGN_VERBS`.
5. Verify: `cd packages/kit && bun test src/skill-scripts/assemble-fidelity-rubric.test.ts`

### Slice 11 — `agents/fidelity-verifier.md`: fidelity-mode variant (`testable: false`, docs)

Edit the existing agent (do not create a second agent — the task calls this
"a fidelity-mode variant of the existing design-verifier agent" for Layer B,
but the repo's actual existing blind visual agent is `fidelity-verifier.md`
itself, landed by the council addendum in `verification-hardening.md` Slice
6 — this plan promotes it from prose-only critique to structured rubric
input, it does not fork a new agent).

1. Add an "INPUTS (fidelity-mode)" section replacing the current free-form
   structural-fact-sheet description with: the assembled rubric (Slice 10's
   output, `{ category, criteria }`), the screenshot(s) (a full montage PLUS
   one zoomed per-row crop for every criterion with `requiresZoomedCrop:
   true` — enumerate every variant×state×depth combination the montage must
   show; if the spawner's montage is missing a combination the rubric
   requires, the agent reports `cannot-rule` for that criterion and says
   which crop is missing, never guesses from a partial view — "fail closed"
   per the task's explicit ask).
2. Add "GEOMETRY SHORT-CIRCUIT": if the spawner reports the geometry pass
   (Layer A) found any hard violation for this component, this agent is
   never spawned for it — state this as the spawner's contract (mirrored in
   `figma-create/SKILL.md`'s new step 4, Slice 12), and instruct the agent
   itself to refuse and report `cannot-rule: geometry gate not clean` if it
   is somehow invoked anyway (defense in depth, matching the existing
   ANTI-SPIRAL section's "stop and report" pattern).
3. Add "OUT OF SCOPE": text/typo correctness is explicitly never ruled on —
   one line, matching the existing "SCOPE BOUNDARY" section's style.
4. Per-criterion output stays the existing `matches`/`deviates`/`cannot-rule`
   contract (no change needed there — already correct per
   `verification-hardening.md`'s council ruling).
5. Verify: re-read the file after editing, confirm the isolation block
   (`NEVER GIVEN`) is unchanged word-for-word (it must still bar the build
   transcript/self-report/arrangement note) — `grep -n "NEVER GIVEN" agents/fidelity-verifier.md`.

### Slice 12 — replace figma-create step 4 (`testable: false`, docs — but its callers become behavioral)

1. In `skills/figma-create/SKILL.md`'s step 4 ("Visual self-review"):
   - Replace numeric predicates (a) icon-stroke-thickness, (b) bound-spacing
     match, (c) no-clipping/misalignment with: **"Numeric predicates are
     Layer A's job now — run `figma-audit`'s named audit with
     `geometryCategories` covering this component's category (Slice 9); a
     `hard` geometry violation blocks exactly like every other tier-0
     hard-fail — fix and re-audit before proceeding, never eyeball what the
     gate already checks."**
   - Replace the "Prose critique" bullet with: **"Spawn
     `argo:fidelity-verifier` in fidelity mode (Slice 10's assembled rubric
     for this component's category + the montage screenshot(s)) ONLY if
     geometry is clean AND the rubric's `criteria` is non-empty
     (`shouldSpawnFidelityVerifier`) — a plain button with no visual
     criteria never spawns it. Its per-criterion `deviates` rulings are the
     residual visual defects a deterministic check can't cover; fix and
     re-run the numeric predicates (never re-run the VLM on an unchanged
     rubric) until clean."**
   - Keep the montage-capture mechanics bullet as-is (still needed to
     produce the screenshot Layer B consumes) but add: the montage must
     cover every variant×state×depth combination the rubric's
     `requiresZoomedCrop` criteria need, or the step fails closed (per Slice
     11) rather than spawning a partial-evidence check.
2. Verify: re-read the edited section, confirm no numeric-predicate
   prose from the old (a)/(b)/(c) list survives duplicated elsewhere in the
   file (`grep -n "icon stroke-thickness\|bound-spacing match" skills/figma-create/SKILL.md` → no hits after the edit).

## Part 3 — two design-guard defects

### Slice 13 — read-only `use_figma` must not count as a write

**Confirm open decision 5 before building this slice — do not guess.** Two
grounded options, both consistent with the existing `skillNames`-tag
precedent already shipped for the wireframe exemption
(`design-guard-record.ts:76-88`):

- **Option A (opt-in tag, same mechanism as the wireframe exemption).** The
  calling skill/script passes a recognized marker through the EXISTING
  `skillNames` array (a real `use_figma` parameter this repo already reads),
  e.g. `'figma-read-only'`, exactly like `'figma-wireframe'` today. Trust
  model: identical to the wireframe exemption already shipped and accepted —
  a skill lying about read-only-ness costs a missed audit-owed nudge (cheap,
  self-correcting: the NEXT real write still counts and re-arms the gate),
  never a correctness/security gap. **Recommendation: Option A** — zero new
  tool-schema dependency, reuses a channel already proven to work, smallest
  diff.
- **Option B (heuristic source-text classification).** Static-scan the
  script text for known Figma Plugin-API mutation calls
  (`.appendChild(`, `createComponent`, `.resize(`, `= ` assignments to
  known-mutable fields, `setPluginData`, `combineAsVariants`, etc.) vs.
  read-only calls (`getNodeByIdAsync`, `findAll`, `.screenshot(`). Rejected
  as the first choice: depends on an ungrounded field name for the executed
  source in `tool_input` (this repo has never read one), and a regex/AST
  classifier over arbitrary JS is a much larger, more fragile surface than
  the task's "simplest reliable version" mandate wants — revisit only if
  Option A's opt-in tagging proves to be gamed in practice (no such finding
  exists today).

Steps assume Option A is picked:

1. In `packages/kit/src/hooks/design-guard-record.ts`, add a sibling to the
   existing `skillNamesFrom`-based wireframe check (line 76-88):
   ```ts
   // Read-only exemption (mirrors the wireframe exemption immediately
   // above): a pure-introspection use_figma call (getNodeById + property
   // reads, no mutation) tags itself 'figma-read-only' in skillNames so it
   // doesn't arm the audit-owed gate. Same trust model as the wireframe tag
   // — a mistagged write still gets caught by the NEXT real write's count.
   if (skillNamesFrom(hook?.tool_input).some((s) => s.trim() === 'figma-read-only')) process.exit(0)
   ```
   placed immediately after the existing wireframe check (same early-return
   shape, same helper function, zero new parsing logic).
2. `design-guard-record.test.ts`: add cases mirroring the wireframe ones
   exactly (lines 179-207's shape): a `figma-read-only` tag does not bump
   the shared counter; does not bump the per-session counter; emits no
   additionalContext; a mixed session (one read-only call, one real write)
   still counts exactly 1.
3. Every read-only call site this repo controls must add the tag: grep for
   every skill instructing a `use_figma` introspection-only call (`skills/
   figma-audit/SKILL.md`'s own audit READ, `skills/resolve-comments/
   SKILL.md`'s "ONE batched, read-only `use_figma` call" bullets — 3 call
   sites at lines 186, 211, 252) and add `figma-read-only` to their
   documented `skillNames` argument. This is the actual fix's payoff — the
   hook change alone does nothing until callers opt in.
4. Verify: `cd packages/kit && bun run build && bun test src/hooks/design-guard-record.test.ts`; grep-confirm the 3 resolve-comments call sites and figma-audit's own read now document the tag.

### Slice 14 — "park with acknowledged pending work" affordance

**Minimal version, per the owner's "simplest reliable version" framing**:
this is a stop-gate escape hatch, not a new workflow — one new session-scoped
acknowledgment file, one new CLI verb, one new stop-gate branch.

1. `packages/kit/src/lib/session-guard.ts`: add (mirroring the existing
   `completenessStatePath`/`markScreenComposed` pattern exactly):
   ```ts
   const PENDING_ACK_SUBDIR = join('.argo', 'pending-ack')

   export function pendingAckPath(repoRoot: string, sessionId: string): string {
     return join(repoRoot, PENDING_ACK_SUBDIR, `${sessionId}.json`)
   }

   /** Owner-acknowledged deferred work for this session — a real reason
    * string, never a blank rubber stamp (the hook rejects an empty string,
    * see design-guard-stop.ts). One ack covers every outstanding write-owed
    * debt in the session it's recorded for; a NEW write after the ack
    * re-arms the gate (see readSessionWriteCount comparison in the stop
    * gate) so this can't be used to permanently silence the gate. */
   export function recordPendingAck(repoRoot: string, sessionId: string, reason: string, now: number): void {
     mkdirSync(join(repoRoot, PENDING_ACK_SUBDIR), { recursive: true })
     writeFileSync(pendingAckPath(repoRoot, sessionId), JSON.stringify({ reason, ackedAt: now, writeCountAtAck: readSessionWriteCount(repoRoot, sessionId) ?? 0 }))
   }

   export function readPendingAck(repoRoot: string, sessionId: string): { reason: string; ackedAt: number; writeCountAtAck: number } | undefined {
     return readJsonSafe(pendingAckPath(repoRoot, sessionId))
   }
   ```
   Add `PENDING_ACK_SUBDIR` to `pruneStaleSessionFiles`'s swept subdir list
   (same 14-day best-effort GC every other per-session file already gets).
2. `packages/kit/src/skill-scripts/ack-pending-work.ts` (new skill-script,
   same CLI shape as `record-completeness.ts` — read it first to match its
   exact argv-parsing convention): `argo design ack-pending-work --reason
   "<non-empty text>"`, resolves `sessionId`/`repoRoot` the same way
   `record-audit-receipt.ts` does, calls `recordPendingAck`, rejects (exit 1)
   an empty/missing `--reason`.
3. Register `ack-pending-work` in `bin/argo.js`'s `DESIGN_VERBS`.
4. `design-guard-stop.ts`: in the per-session path, BEFORE the existing
   `block(...)` calls for a missing/stale receipt (after computing
   `liveCount`), check for a valid ack:
   ```ts
   const ack = readPendingAck(repoRoot, sessionId)
   if (ack && ack.writeCountAtAck === liveCount) {
     // Owner acknowledged deferred work covering every write up to this
     // point — park, don't block. A write AFTER the ack raises liveCount
     // past writeCountAtAck, so this re-arms on the very next write.
     process.exit(0)
   }
   ```
   placed after the `liveCount === null || liveCount === 0` early return and
   before the receipt lookup — so an ack short-circuits the receipt/
   violation checks entirely, but a stale ack (writeCountAtAck behind
   liveCount, i.e. more writes happened after acking) falls through to the
   normal blocking logic unchanged.
5. `design-guard-stop.test.ts`: new cases — a valid ack at the current write
   count exits 0 with no receipt present; an ack recorded BEFORE a
   subsequent write (stale) still blocks; an ack with an empty reason is
   never recordable in the first place (covered by `ack-pending-work.ts`'s
   own CLI test, not the stop gate's).
6. `packages/kit/src/skill-scripts/ack-pending-work.test.ts`: rejects empty
   `--reason`; records a valid ack; a second ack call overwrites the first
   (single-key-ish — this file has exactly one ack per session, no history
   needed, matching the "one park per session" minimal scope).
7. **Explicitly NOT built** (owner mandate against speculative scope): no
   expiry/review workflow for a parked session, no aggregation of acks
   across sessions, no surfacing acks in a dashboard — the affordance is
   "end this session honestly with a stated reason," nothing more.
8. Verify: `cd packages/kit && bun run build && bun test src/hooks/design-guard-stop.test.ts src/skill-scripts/ack-pending-work.test.ts src/lib/session-guard.test.ts`

## Verification (whole plan)

- `cd packages/kit && bun test src/ && bun run build`, run after every
  slice and once more at the end.
- Geometry pristine corpus zero-violations assertion
  (`geometry-corpus.test.js`) plus every existing R7 assertion in
  `kit-corpus.test.js` still pass unmodified (Part 1 touches no existing
  rule).
- `tier0-audit.ts`/`bundle-tier0-audit.ts` themselves have no direct unit
  test (documented accepted gap, same as every existing Plugin-API walker
  file) — correctness proven only through the pure rule functions +
  `runPureGeometryAudit.mjs` + the fixture corpus, first real proof is a
  live `figma-audit` run against an actual Figma file with role-tagged rows.
- Re-read `agents/fidelity-verifier.md` and `skills/figma-create/SKILL.md`
  after Slices 11-12 and confirm no stale numeric-predicate/prose-critique
  wording survives from before the edit.

## Risks & assumptions

- **Role-tag adoption is manual, forward-only.** `missing-role-tags` only
  fires for a category opted into `geometryCategories` — a project that
  never adds the config, or a component whose author never tags rows, gets
  zero geometry checks (silent no-op, same non-breaking-when-unconfigured
  posture as `viewport`/D24). This is deliberate (opt-in, non-breaking) but
  means the geometry layer's real-world bite depends entirely on host
  projects actually configuring `geometryCategories` and authors actually
  tagging — a follow-up adoption pass in the consuming project (argo-v2) is
  out of this plan's scope.
- **Geometry tolerance is a single global px value**, not per-rule or
  per-project-DPI. If a live run finds this too coarse/fine for a specific
  rule, split it into per-rule config then — no speculative per-rule knobs
  added ahead of a real finding (YAGNI, matching this repo's own established
  calibrate-after-a-live-finding pattern for `strokeScaleViolation`'s ±15%).
- **Category rubric templates are hand-authored and can go stale** against a
  brief's actual requirements — `assembleFidelityRubric` does no validation
  that a brief's named requirements make sense for its category; a
  malformed brief requirement just becomes an extra criterion the VLM rules
  on, worst case a `cannot-rule`.
- **Slice 13's Option A trust model is identical to the already-shipped
  wireframe exemption** — if that pattern turns out to be gamed in practice
  (no such finding exists today, per this repo's own `git log`), Option B's
  heavier heuristic is the fallback, not a speculative addition now.
- **Slice 14's ack is a per-session escape hatch, not an audit trail** — it
  answers "can I stop the session," never "should this org-wide be shipped
  with an outstanding gap." If the owner wants a durable/committed record of
  parked work later, that is a new, separate feature request, not smuggled
  into this minimal affordance.
