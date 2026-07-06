/**
 * Tier-0 mechanism rules (figma-to-code-pipeline.md §5 tier 0), extracted from
 * templates/design/tier0-audit.js into pure predicate functions over plain-object
 * node/variable shapes — no `figma.*` calls, so these are unit-testable outside
 * Figma's Plugin API sandbox. The recipe-owned rules (non-semantic-binding,
 * retired-file-key-binding, kit-patches-conformance) live in the sibling
 * `figma-design-kit-shadcn-tailwind` package, not here (D23).
 *
 * Each function returns a violation object `{ rule, detail }` (or an array of
 * them, for checks that can fire more than once per node), or `null`/`[]` when
 * the node passes. Callers (the Plugin-API walker) attach severity/nodeId/
 * nodeName, which depend on audit context, not rule logic.
 *
 * Node/variable shapes here are walker-marshaled plain objects mirroring a
 * subset of Figma's Plugin API node fields, not a modeled Figma type — kept
 * as `any`-keyed records deliberately (this migration adds compile-time
 * typing to the module's own logic, not a full Figma domain model).
 */
export type Violation = {
    rule: string;
    detail: string;
};
type AnyNode = Record<string, any>;
export declare function unboundFillViolations(node: AnyNode): Violation[];
export declare function unboundStrokeViolations(node: AnyNode): Violation[];
/**
 * A `cornerRadius` of 0 (or absent) carries no radius design intent, so it's
 * never flagged — every plain frame defaults to 0. A radius counts as bound
 * either via the uniform `boundVariables.cornerRadius`, or via all four
 * per-corner fields being bound (the only bindable radius fields on many
 * node types) — fix: 2026-07, closed a 71-hit false-positive class. A
 * COMPONENT_SET container node is skipped entirely: Figma gives every
 * combineAsVariants container a default cornerRadius of 5 (the purple
 * dashed editor chrome), which is not a design surface and can't
 * meaningfully bind a token.
 */
export declare function unboundRadiusViolation(node: AnyNode): Violation | null;
/**
 * Passes a text node bound directly to a fontSize variable OR carrying a
 * shared text style (the pack's own text-styling convention) — `textStyleId`
 * is `figma.mixed` (an object) when mixed across a range, and `''` when
 * unset, so only a non-empty string counts as "styled" (fix: 2026-07,
 * closed a 45-hit false-positive class on a properly text-styled sheet).
 */
export declare function unboundTypeViolation(node: AnyNode): Violation | null;
/**
 * Named-component audit matching predicate (figma-audit's hard-gate mode).
 * A named audit must be able to target SCREENS and foundation frames, not
 * only components — those are FRAME/SECTION nodes, which a
 * COMPONENT/COMPONENT_SET-only match silently misses (fix: 2026-07, closed
 * a false-pass where a named audit of a frame returned zero matches instead
 * of walking it).
 */
export declare function isNamedAuditTarget(node: AnyNode, name: string): boolean;
/**
 * Wireframe-page exemption (figma-wireframe/SKILL.md "Wireframe pages are
 * exempt from the tier-0 hard gate"): wireframe surface pages are named
 * `W<NN> <group>` (e.g. `W00 Components`, `W01 Shell & Rail`) per that
 * skill's "Frame naming and layout" section, and the `Cover` page (the
 * design-language legend) is likewise never code-synced. Nodes on a matching
 * page produce zero tier-0 violations at every severity — grayscale
 * unbound fills/strokes there are expected, not a defect.
 */
export declare function isWireframePageName(name: string): boolean;
export declare function missingAutoLayoutViolation(node: AnyNode): Violation | null;
export declare function handDrawnIconViolation(node: AnyNode): Violation | null;
export declare function kitInstanceOverrideViolation(node: AnyNode): Violation | null;
/** node.hasMainComponent is resolved by the walker via node.getMainComponentAsync(). */
export declare function detachedInstanceViolation(node: AnyNode): Violation | null;
export declare function nonSemanticNameViolation(node: AnyNode): Violation | null;
export declare function variantNamingViolations(node: AnyNode): Violation[];
/**
 * D11 (generalized to mode copies, 2026-07-05): one visible instance copy per
 * mode of the project Semantic collection BEYOND the default mode (the
 * component itself renders in the default mode). `modes` is the Semantic
 * collection's ordered mode-name list; `modes[0]` is the default and is
 * skipped. A single-mode collection yields `modes.length === 1`, so this
 * returns `[]` vacuously — a dark-only project has zero copies to maintain.
 * node.siblings is resolved by the walker from node.parent.children (excluding
 * node itself).
 */
export declare function modeCopyViolations(node: AnyNode, semanticCollectionName: string, modes: string[]): Violation[];
export declare function implicitLineHeightViolation(node: AnyNode): Violation | null;
/** node.storyUrl is resolved by the walker from shared plugin data (namespace 'argo', key 'storyUrl'); private plugin data is a legacy fallback. */
export declare function storyUrlScopeViolation(node: AnyNode): Violation | null;
/**
 * NEW-3 (promoted out of R6/R3, 2026-07-05): flags an icon-like remote
 * instance (a lucide icon — a 24x24 frame wrapping one VECTOR at
 * strokeWeight 2, per the observed live shape) whose resolved strokeWeight
 * doesn't track its rescale ratio — the walker marshals the plain shape
 * `{ instanceSize, nativeSize, resolvedStrokeWeight, baseStrokeWeight }`
 * (icon-like = a remote instance whose main component is a single-VECTOR
 * component). The ratio only holds when the instance was rescaled
 * proportionally (Figma's sanctioned "Scale" tool on the instance); a
 * width/height-only resize leaves the original stroke weight in place,
 * producing a visually chunky/thin glyph (#4). ±15% tolerance absorbs
 * legitimate rounding to a whole-pixel stroke weight.
 */
export declare function strokeScaleViolation({ instanceSize, nativeSize, resolvedStrokeWeight, baseStrokeWeight }: {
    instanceSize: number;
    nativeSize: number;
    resolvedStrokeWeight: number;
    baseStrokeWeight: number;
}): Violation | null;
export declare function possibleGateFalsePositiveTag(node: AnyNode): boolean;
/**
 * design-memory-placement.md Mechanism 1: advisory-only reconciliation for a
 * component that isn't a child of any category shelf frame on
 * `Custom Components` — a human manually rearranged it, or an agent placed
 * it directly on the page instead of `appendChild`-ing to the resolved
 * shelf. Never blocks — self-corrects on the next figma-create upsert.
 * `insideCategoryShelf` is marshaled by the walker from the node's parent
 * chain against the configured `componentCategories` shelf frames.
 */
export declare function unsectionedComponentViolation(node: AnyNode): Violation | null;
/** Mechanism 3 (advisory): a component with no description misses the one place in-file facts (purpose + category) can't drift. Never blocks. */
export declare function missingComponentDescriptionViolation(node: AnyNode): Violation | null;
/**
 * Option B (design-first-council-ruling.md Gate ruling, ADVISORY only): in a
 * composed SCREEN, a node named after a known composite (`compositeNames` —
 * the project's registered composite names, e.g. `design/registry.json`
 * entries) that is a plain FRAME rather than an INSTANCE of that component is
 * under-decomposition — a traced screen, not one composed from built
 * components via figma-create's component-first screen path (#4). This is
 * the under-decomposition catch the council promoted to advisory, NOT the
 * hard authoritative decomposition gate (Option C), which is deferred until
 * its brief/story-map schema lands — never wire this as a hard-fail.
 */
export declare function compositeRegionNamingViolation(node: AnyNode, compositeNames: string[]): Violation | null;
export declare function gapPaddingSpacingViolations(node: AnyNode, _spacingScale?: unknown): Violation[];
export {};
//# sourceMappingURL=tier0-rules.d.ts.map