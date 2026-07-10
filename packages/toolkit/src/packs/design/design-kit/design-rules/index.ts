/**
 * Design-rules mechanism rules, grouped into pure predicate functions over plain-object
 * node/variable shapes — no `figma.*` calls, so these are unit-testable outside
 * Figma's Plugin API sandbox. Recipe-owned rules live in their own recipe package, not here.
 *
 * Each function returns a violation object `{ rule, detail }` (or an array of
 * them, for checks that can fire more than once per node), or `null`/`[]` when
 * the node passes. Callers (the Plugin-API walker) attach severity/nodeId/
 * nodeName, which depend on audit context, not rule logic.
 *
 * Node/variable shapes here are walker-marshaled plain objects, kept as `any`-keyed
 * records deliberately — this is not a full Figma domain model.
 */
export type { Violation } from './types.js'
export { unboundFillViolations, unboundStrokeViolations, unboundRadiusViolation } from './bindings.js'
export {
  handDrawnIconViolation,
  kitInstanceOverrideViolation,
  detachedInstanceViolation,
  possibleGateFalsePositiveTag,
  strokeScaleViolation
} from './instances.js'
export { screenViewportMismatchViolation, missingAutoLayoutViolation } from './layout.js'
export { unclippedOverflowViolations, hugOverflowViolations } from './overflow.js'
export { gapPaddingSpacingViolations } from './spacing.js'
export type { GapPaddingCollectionsConfig } from './spacing.js'
export { isNamedAuditTarget, isCoverPageName, isDesignPageName, nonSemanticNameViolation, variantNamingViolations } from './naming.js'
export {
  storyUrlScopeViolation,
  unsectionedComponentViolation,
  missingComponentDescriptionViolation,
  compositeRegionNamingViolation
} from './component-metadata.js'
export {
  textStyleRequiredViolation,
  textTruncationViolation,
  emDashViolation,
  implicitLineHeightViolation,
  untracedCopyViolation
} from './text.js'
export { touchTargetViolation, textContrastViolation } from './a11y.js'
