/**
 * Component-naming helpers for the anti-recreation gate and the registry-
 * derived composite-name set. (Relocated from the deleted kit-inventory
 * module, 2026-07-07 — the kit-library-subscription machinery around them
 * is gone with the single-starter-file model; these two checks are about
 * the project's OWN components, not any kit roster.)
 */

type Registry = { components?: Record<string, unknown> | unknown } | undefined
type AliasMap = { components?: { name: string; aliases?: string[] }[] } | undefined

/** Lowercase, strip separators, drop a trailing plural 's' — a cheap normalization; aliases[] covers the semantic synonyms normalization can't (chip/toggle). */
export function normalizeComponentName(name: unknown): string {
  return String(name)
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
    .replace(/s$/, '')
}

/**
 * Anti-recreation backstop (design-first-council-ruling.md Gate ruling).
 * `aliasMap` is the project's committed product-composite alias map
 * (`{ components: [{ name, aliases }] }` — format documented in
 * templates/design/component-aliases.example.json), the machine-readable
 * counterpart to the prose COMPONENT-INVENTORY.md a repo can't lint against
 * directly. A design brief tagging a component NEW must not collide,
 * case-insensitively, with any canonical name or alias already in the map
 * (e.g. "PromptCard" ≈ AskRow's alias) — exact match only: false positives
 * here are cheap (rename or extend instead of recreating), so no waiver
 * escape hatch is needed. Fails open (returns null) on an absent/malformed
 * map — this check never fabricates a violation from missing data.
 *
 * WARNING: this has NO self-exclusion — an already-registered aliased name
 * matches itself. It is a one-off PRE-AUTHORING check (call it on a NEW name
 * before it enters the map); never fold it into a per-run/per-audit violation
 * count (e.g. record-audit-receipt.mjs), or every re-audit of an already-
 * registered component self-collides.
 */
export function findNewNameAliasCollision(newName: string, aliasMap: AliasMap): { rule: string; detail: string } | null {
  const normalized = normalizeComponentName(newName)
  for (const entry of aliasMap?.components ?? []) {
    const candidates = [entry.name, ...(entry.aliases ?? [])].map(normalizeComponentName)
    if (candidates.includes(normalized)) {
      return {
        rule: 'new-name-alias-collision',
        detail: `NEW name "${newName}" collides with existing component "${entry.name}" — reuse or extend it instead of recreating it`
      }
    }
  }
  return null
}

/**
 * The composite-name set `compositeRegionNamingViolation` (Option B) checks a
 * screen's plain FRAMEs against — `design/registry.json`'s entries ARE the
 * project's registered composite names, keyed by name. Fails open (returns
 * []) on an absent/malformed registry.
 */
export function registryComponentNames(registry: Registry): string[] {
  const components = registry?.components && typeof registry.components === 'object' ? (registry.components as Record<string, unknown>) : {}
  return Object.keys(components)
}
