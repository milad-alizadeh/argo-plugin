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
    .replace(/s$/, '')
}

/**
 * Flags authored `componentNames` that shadow an existing kit component (by
 * name or alias) or an existing registry entry, unless cleared by a
 * `{ type: 'kit-shadow', component, kitCandidate, reason }` waiver. Fails
 * open (returns []) on absent/malformed inventory/registry/waivers — this
 * check never fabricates a violation from missing data.
 */
export function findKitNameCollisions(componentNames, { inventory, registry, waivers = [] } = {}) {
  const kitNames = []
  for (const component of inventory?.components ?? []) {
    kitNames.push(normalizeComponentName(component.name))
    for (const alias of component.aliases ?? []) kitNames.push(normalizeComponentName(alias))
  }

  const registryComponents = registry?.components && typeof registry.components === 'object' ? registry.components : {}
  const registryNames = Object.keys(registryComponents).map(normalizeComponentName)

  const waivedNames = new Set(
    (Array.isArray(waivers) ? waivers : [])
      .filter((w) => w?.type === 'kit-shadow')
      .map((w) => normalizeComponentName(w.component))
  )

  // Substring match, not exact equality: a compound authored name
  // (`status-pill`) is expected to CONTAIN a shorter kit alias (`pill`) —
  // normalization alone misses this, and aliases[] exists precisely to
  // catch it. This can over-trigger on an unrelated name that happens to
  // contain a short alias; a `kit-shadow` waiver is the intended, cheap
  // escape hatch for that fuzzy false positive (kit-awareness.md's own
  // fail-open contract).
  const matchesAny = (normalized, candidates) => candidates.some((candidate) => normalized.includes(candidate))

  const collisions = []
  for (const name of componentNames ?? []) {
    const normalized = normalizeComponentName(name)
    if (waivedNames.has(normalized)) continue
    // Self-shadow exclusion (council ruling, 2026-07-05): an EXACT normalized
    // match against a registry key is the component itself being re-audited —
    // figma-create upserts every component, so without this every re-audit
    // would collide with its own entry and block forever. Only a DIFFERENT
    // name that substring-matches a registry entry flags.
    const registryOthers = registryNames.filter((candidate) => candidate !== normalized)
    if (matchesAny(normalized, kitNames) || matchesAny(normalized, registryOthers)) collisions.push(name)
  }
  return collisions
}
