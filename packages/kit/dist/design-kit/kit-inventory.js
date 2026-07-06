/**
 * Kit-awareness enforcement (kit-awareness.md §"Enforcement"): the
 * deterministic node-side check that rides `design-guard-stop.mjs`'s
 * existing `violationCount` rail rather than a new hook — the Figma sandbox
 * can't read a committed file or call `search_design_system`, which is
 * exactly why this check lives HERE (Node-side, in the audit-receipt writer)
 * and not as an in-sandbox tier-0 rule.
 */
/** Lowercase, strip separators, drop a trailing plural 's' — a cheap normalization; aliases[] covers the semantic synonyms normalization can't (chip/toggle). */
export function normalizeComponentName(name) {
    return String(name)
        .toLowerCase()
        .replace(/[\s_-]+/g, '')
        .replace(/s$/, '');
}
/**
 * Flags authored `componentNames` that shadow an existing kit component (by
 * name or alias) or an existing registry entry, unless cleared by a
 * `{ type: 'kit-shadow', component, kitCandidate, reason }` waiver. Fails
 * open (returns []) on absent/malformed inventory/registry/waivers — this
 * check never fabricates a violation from missing data.
 */
export function findKitNameCollisions(componentNames, { inventory, registry, waivers = [] } = {}) {
    const kitNames = [];
    for (const component of inventory?.components ?? []) {
        kitNames.push(normalizeComponentName(component.name));
        for (const alias of component.aliases ?? [])
            kitNames.push(normalizeComponentName(alias));
    }
    const registryComponents = registry?.components && typeof registry.components === 'object' ? registry.components : {};
    const registryNames = Object.keys(registryComponents).map(normalizeComponentName);
    const waivedNames = new Set((Array.isArray(waivers) ? waivers : [])
        .filter((w) => w?.type === 'kit-shadow')
        .map((w) => normalizeComponentName(w.component)));
    // Substring match, not exact equality: a compound authored name
    // (`status-pill`) is expected to CONTAIN a shorter kit alias (`pill`) —
    // normalization alone misses this, and aliases[] exists precisely to
    // catch it. This can over-trigger on an unrelated name that happens to
    // contain a short alias; a `kit-shadow` waiver is the intended, cheap
    // escape hatch for that fuzzy false positive (kit-awareness.md's own
    // fail-open contract).
    const matchesAny = (normalized, candidates) => candidates.some((candidate) => normalized.includes(candidate));
    const collisions = [];
    for (const name of componentNames ?? []) {
        const normalized = normalizeComponentName(name);
        if (waivedNames.has(normalized))
            continue;
        // Self-shadow exclusion (council ruling, 2026-07-05): an EXACT normalized
        // match against a registry key is the component itself being re-audited —
        // figma-create upserts every component, so without this every re-audit
        // would collide with its own entry and block forever. Only a DIFFERENT
        // name that substring-matches a registry entry flags.
        const registryOthers = registryNames.filter((candidate) => candidate !== normalized);
        if (matchesAny(normalized, kitNames) || matchesAny(normalized, registryOthers))
            collisions.push(name);
    }
    return collisions;
}
/**
 * Anti-recreation backstop (design-first-council-ruling.md Gate ruling): the
 * ONE hard check promoted now — separate from findKitNameCollisions (which
 * checks authored names against the KIT's own inventory + the live
 * registry). `aliasMap` is the project's committed product-composite alias
 * map (same `{ components: [{ name, aliases }] }` shape as the kit inventory
 * — format documented in templates/design/component-aliases.example.json),
 * the machine-readable counterpart to the prose COMPONENT-INVENTORY.md a
 * repo can't lint against directly. A design brief tagging a component NEW
 * must not collide, case-insensitively, with any canonical name or alias
 * already in the map (e.g. "PromptCard" ≈ AskRow's alias) — exact match
 * only, not findKitNameCollisions' substring fuzz: false positives here are
 * cheap (rename or extend instead of recreating), so no waiver escape hatch
 * is needed. Fails open (returns null) on an absent/malformed map — this
 * check never fabricates a violation from missing data.
 *
 * WARNING: unlike findKitNameCollisions, this has NO self-exclusion — an
 * already-registered aliased name matches itself. It is a one-off PRE-AUTHORING
 * check (call it on a NEW name before it enters the map); never fold it into a
 * per-run/per-audit violation count (e.g. record-audit-receipt.mjs), or every
 * re-audit of an already-registered component self-collides.
 */
export function findNewNameAliasCollision(newName, aliasMap) {
    const normalized = normalizeComponentName(newName);
    for (const entry of aliasMap?.components ?? []) {
        const candidates = [entry.name, ...(entry.aliases ?? [])].map(normalizeComponentName);
        if (candidates.includes(normalized)) {
            return {
                rule: 'new-name-alias-collision',
                detail: `NEW name "${newName}" collides with existing component "${entry.name}" — reuse or extend it instead of recreating it`
            };
        }
    }
    return null;
}
/**
 * The composite-name set `compositeRegionNamingViolation` (Option B) checks a
 * screen's plain FRAMEs against — `design/registry.json`'s entries ARE the
 * project's registered composite names, keyed by name. Fails open (returns
 * []) on an absent/malformed registry, same contract as the other kit-
 * awareness readers here.
 */
export function registryComponentNames(registry) {
    const components = registry?.components && typeof registry.components === 'object' ? registry.components : {};
    return Object.keys(components);
}
//# sourceMappingURL=kit-inventory.js.map