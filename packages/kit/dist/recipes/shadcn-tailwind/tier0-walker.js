import { nonSemanticBindingViolation, retiredFileKeyBindingViolation, kitPatchesConformanceViolations } from './tier0-rules.js';
// Gap/padding fields legally bind Primitives spacing variables (D24, revised
// 2026-07-05) — they are governed by gapPaddingSpacingViolations, so exclude
// them from this Semantic-only sweep.
const SPACING_FIELDS = new Set(['itemSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'counterAxisSpacing']);
export async function runRecipeTier0Checks(node, { hard, kitVariableKeys = [], retiredKitVariableKeys = [], semanticCollectionName = 'Semantic' } = { hard: false }) {
    const violations = [];
    const report = (rule, detail) => {
        violations.push({ severity: hard ? 'hard' : 'advisory', rule, nodeId: node.id, nodeName: node.name, detail });
    };
    const boundVars = node.boundVariables ? Object.entries(node.boundVariables) : [];
    for (const [fieldName, bound] of boundVars) {
        if (SPACING_FIELDS.has(fieldName))
            continue;
        const alias = Array.isArray(bound) ? bound[0] : bound;
        if (!alias?.id)
            continue;
        const variable = await figma.variables.getVariableByIdAsync(alias.id);
        if (!variable)
            continue;
        // collectionName (not just presence of variableCollectionId) is what actually
        // distinguishes the Semantic collection from a local Primitives collection —
        // live-Figma verification (Slice 14) confirmed a variableCollectionId-only
        // check is vacuous, since Primitives bindings have one too.
        //
        // Marshal explicitly, field by field — a live Variable object's remote/key/
        // variableCollectionId are prototype getters, NOT own enumerable properties,
        // so `{ ...variable }` silently drops them (confirmed live, Slice 14: spread
        // yielded only `{ id }`). Always name the fields a pure function needs.
        const collection = variable.variableCollectionId
            ? await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId)
            : null;
        const marshaledVariable = {
            remote: variable.remote,
            key: variable.key,
            collectionName: collection?.name ?? null
        };
        const nonSemantic = nonSemanticBindingViolation(marshaledVariable, kitVariableKeys, semanticCollectionName);
        if (nonSemantic)
            report(nonSemantic.rule, nonSemantic.detail);
        const retiredKey = retiredFileKeyBindingViolation(marshaledVariable, retiredKitVariableKeys);
        if (retiredKey)
            report(retiredKey.rule, retiredKey.detail);
    }
    return violations;
}
/**
 * Runs once per audit (not per node), called from design-kit/tier0-audit.js's
 * runTier0Audit after it marshals the kit-copy file's modified nodes: flag
 * any not recorded in kit-patches.json (D13/D15). `kitPatches` is the
 * project's `design/kit-patches.json` contents, read Node-side by
 * prepare-tier0-audit-options.js and curried in by the bundle entry — never
 * imported here as a project file.
 */
export function runKitPatchesConformance(modifiedNodes, kitPatches = {}) {
    return kitPatchesConformanceViolations(modifiedNodes, kitPatches).map(({ rule, detail }) => ({
        severity: 'hard',
        rule,
        detail
    }));
}
//# sourceMappingURL=tier0-walker.js.map