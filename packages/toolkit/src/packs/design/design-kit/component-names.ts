/**
 * Component-naming helpers: normalization and the registry-derived
 * composite-name set. (Relocated from the deleted kit-inventory module,
 * 2026-07-07 — the kit-library-subscription machinery around them is gone
 * with the single-starter-file model; these are about the project's OWN
 * components, not any kit roster. The alias-map anti-recreation check that
 * used to live here was deleted in the design-system-reset-overhaul plan's
 * Slice 1 — a NEW component name is checked against the flat registry
 * directly via `registryComponentNames`, not a separate alias map.)
 */

type Registry = { components?: Record<string, unknown> | unknown } | undefined

/** Lowercase, strip separators, drop a trailing plural 's' — a cheap normalization; aliases[] covers the semantic synonyms normalization can't (chip/toggle). */
export function normalizeComponentName(name: unknown): string {
  return String(name)
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
    .replace(/s$/, '')
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
