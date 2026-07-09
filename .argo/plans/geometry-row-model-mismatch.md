# Geometry layer: row/depth model doesn't fit real component-instance trees

**Status:** OPEN defect, found on first live dogfood (argo-v2, 2026-07-08).
**Severity:** blocks activating Layer A on any real `tree`/`list` render — would
false-fire catastrophically. Ship-blocker for the feature's stated purpose
(a gate that does NOT cry wolf).

## What happened

Tried to make the 0.41.0 geometry gate real on argo-v2's only tree component
(`demo/tree-view`: 6 flat `TreeNode` instances, 2 phases @28px + 4 agents @36px,
depth encoded as a `depth` VARIANT property + an internal `slot/indent` frame,
`itemSpacing: 0`). Set `geometryCategories: ["tree"]`, then reconstructed the
live marshaled tree and ran the real exported rules.

**Result: 40 false-positive violations on a component the owner verified is
visually correct.** Full output in the session; representative:
- `row-height-inconsistent: depth 0 row "TreeNode(agent)" has height 36, expected 28` (×4)
- `indent-inconsistent: depth 1 row "StatusDot" is indented to x=2971, expected x=2949`
- `row-height-inconsistent: depth 2 row "connector" has height 36, expected 14`

## Root cause

Two heuristics in `tier0-audit.ts` assume a shape real Figma component
instances don't have:

1. **`marshalRowGroups(tree)` = "any child that itself has children is a row."**
   On a real instance, that makes `slot/chevron`, `StatusDot`, `summary`,
   `ProgressBar`, `connector` all count as "rows." Row detection is nonsense
   the moment a row has any internal structure.

2. **`groupRowsByDepth(tree)` = DOM-nesting depth.** Our tree (and most
   production trees/lists) render as a **flat sibling list**; depth is a
   variant/data property, not DOM containment. So every real row lands at
   depth 0, and the recursive walk then buckets each row's *internal frames*
   as depth-1/2 "rows" and compares them against each other.

Corollary the rules bake in: **all rows at a depth share one height.** False
for any list where row height varies by item kind (phase 28 vs agent 36 here) —
a completely normal design.

The 602-test suite passes because `geometry-corpus.json` is synthetic: rows are
leaf-ish uniform containers shaped to fit the heuristic. The corpus doesn't
model a real component-instance subtree. **Test-realism gap.**

## Fix direction (needs grill + plan before build)

The role-tag contract must mark *which* nodes are rows and *what depth* each is,
instead of inferring both from DOM structure:

- **`#row` role tag** (or reuse `#content-start`'s owning frame) so a row is
  declared, never guessed from "has children."
- **Per-row depth** from an explicit signal — a `#row` variant/property read,
  or a `#depth-N` suffix — so `groupRowsByDepth` groups by *declared* depth on a
  flat list, not DOM nesting.
- **Height uniformity** must be scoped to same-depth AND same-kind, or dropped
  as a rule (kind-varying row height is legitimate); keep it only where a
  category genuinely guarantees uniform rows.
- Re-derive `content-start` alignment and indent-step per declared depth group.
- Extend the corpus with a real flat-instance-list fixture (this TreeNode
  shape) so the rules are proven against production geometry, not just synthetic.

Until then: **do not set `geometryCategories` on any project.** The gate is
inert-by-default (empty `geometryCategories`), so 0.41.0 is safe as shipped —
it just can't be turned on for a real tree yet.

## Reproduction

`/Users/milad/.claude/jobs/*/tmp/geo-dogfood.mjs` (session scratch) reconstructs
the live tree and runs `indentAndRowConsistencyViolations` — port it into the
kit test suite as the regression fixture when fixing.
