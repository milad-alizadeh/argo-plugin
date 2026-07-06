/**
 * Kit-awareness enforcement (kit-awareness.md §"Enforcement"): the
 * deterministic node-side check that rides `design-guard-stop.mjs`'s
 * existing `violationCount` rail rather than a new hook — the Figma sandbox
 * can't read a committed file or call `search_design_system`, which is
 * exactly why this check lives HERE (Node-side, in the audit-receipt writer)
 * and not as an in-sandbox tier-0 rule.
 */
type Inventory = {
    components?: {
        name: string;
        aliases?: string[];
    }[];
} | undefined;
type Registry = {
    components?: Record<string, unknown> | unknown;
} | undefined;
type Waiver = Record<string, any>;
type AliasMap = {
    components?: {
        name: string;
        aliases?: string[];
    }[];
} | undefined;
/** Lowercase, strip separators, drop a trailing plural 's' — a cheap normalization; aliases[] covers the semantic synonyms normalization can't (chip/toggle). */
export declare function normalizeComponentName(name: unknown): string;
/**
 * Flags authored `componentNames` that shadow an existing kit component (by
 * name or alias) or an existing registry entry, unless cleared by a
 * `{ type: 'kit-shadow', component, kitCandidate, reason }` waiver. Fails
 * open (returns []) on absent/malformed inventory/registry/waivers — this
 * check never fabricates a violation from missing data.
 */
export declare function findKitNameCollisions(componentNames: string[] | undefined, { inventory, registry, waivers }?: {
    inventory?: Inventory;
    registry?: Registry;
    waivers?: Waiver[];
}): string[];
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
export declare function findNewNameAliasCollision(newName: string, aliasMap: AliasMap): {
    rule: string;
    detail: string;
} | null;
/**
 * The composite-name set `compositeRegionNamingViolation` (Option B) checks a
 * screen's plain FRAMEs against — `design/registry.json`'s entries ARE the
 * project's registered composite names, keyed by name. Fails open (returns
 * []) on an absent/malformed registry, same contract as the other kit-
 * awareness readers here.
 */
export declare function registryComponentNames(registry: Registry): string[];
export {};
//# sourceMappingURL=kit-inventory.d.ts.map