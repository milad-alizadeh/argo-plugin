/**
 * design-memory-placement.md A3: the figma-audit advisory sweep already
 * traverses every top-level COMPONENT/COMPONENT_SET on Custom Components —
 * this diffs that same live list against `registry.json`, catching drift
 * the per-task incremental upsert can't see on its own (a crashed agent
 * that never reached its final upsert, a human rename, a category move).
 * All three findings are advisory (never block a commit) and self-correct
 * on the next `figma-create` upsert. The nodeId-heal step ("re-resolve +
 * persist any entry whose nodeId moved") is a live-Figma-only concern (the
 * walker must call `getNodeByIdAsync`/`findAll`) and is documented, not
 * implemented, here — see `skills/figma-audit/SKILL.md`.
 */
type LiveComponent = {
    name: string;
    nodeId: string;
    category: string;
};
type RegistryEntry = {
    name: string;
    nodeId: string;
    category: string;
    nodeIdResolves?: boolean;
};
type Violation = {
    rule: string;
    detail: string;
};
export declare function reconcileRegistrySweep({ liveComponents, registryEntries }?: {
    liveComponents?: LiveComponent[];
    registryEntries?: RegistryEntry[];
}): Violation[];
export {};
//# sourceMappingURL=registry-reconcile.d.ts.map