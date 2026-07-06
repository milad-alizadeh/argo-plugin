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
export function reconcileRegistrySweep({ liveComponents = [], registryEntries = [] } = {}) {
    const violations = [];
    const liveByName = new Map(liveComponents.map((c) => [c.name, c]));
    const registryByName = new Map(registryEntries.map((e) => [e.name, e]));
    for (const entry of registryEntries) {
        const nodeIdResolves = entry.nodeIdResolves !== false;
        if (!nodeIdResolves && !liveByName.has(entry.name)) {
            violations.push({
                rule: 'registry-orphan',
                detail: `registry entry "${entry.name}" nodeId no longer resolves and no live component with that name was found`
            });
        }
    }
    for (const live of liveComponents) {
        const entry = registryByName.get(live.name);
        if (!entry) {
            violations.push({ rule: 'registry-unregistered', detail: `live component "${live.name}" has no registry entry` });
            continue;
        }
        if (entry.category !== live.category) {
            violations.push({
                rule: 'registry-miscategorized',
                detail: `"${live.name}" lives under category "${live.category}" but the registry says "${entry.category}"`
            });
        }
    }
    return violations;
}
//# sourceMappingURL=registry-reconcile.js.map