type Registry = { components?: Record<string, unknown> | unknown } | undefined

export function normalizeComponentName(name: unknown): string {
  return String(name)
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
    .replace(/s$/, '')
}

/** The project's registered composite component names. Fails open (returns []) on an absent/malformed registry. */
export function registryComponentNames(registry: Registry): string[] {
  const components = registry?.components && typeof registry.components === 'object' ? (registry.components as Record<string, unknown>) : {}
  return Object.keys(components)
}
