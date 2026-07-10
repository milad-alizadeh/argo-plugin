/**
 * Component-category enum (design-memory-placement.md A1): a closed,
 * project-defined set of category names, config-driven rather than a
 * speculative fixed taxonomy. `design-component`'s placement step resolves a
 * component's target Auto-Layout shelf as a pure function of this enum;
 * `figma-audit`'s reconcile sweep validates a live category against it.
 */
export const DEFAULT_COMPONENT_CATEGORIES = ['primitive', 'composite']

/** Reads `componentCategories` from a parsed `design.<app>` block (`.argo/config.json`), falling back to the thin default enum when a project sets none. */
export function resolveComponentCategories(config: { componentCategories?: unknown } | null | undefined): string[] {
  const categories = config?.componentCategories
  return Array.isArray(categories) && categories.length > 0 ? categories : DEFAULT_COMPONENT_CATEGORIES
}

/**
 * Validates a `componentCategories` value: must be a non-empty array of
 * unique, non-empty strings. Returns `{ valid, errors }` rather than
 * throwing — setup-design surfaces `errors` directly to the user.
 */
export function validateComponentCategories(categories: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (!Array.isArray(categories) || categories.length === 0) {
    errors.push('componentCategories must be a non-empty array of strings')
    return { valid: false, errors }
  }
  if (!categories.every((c) => typeof c === 'string' && c.length > 0)) {
    errors.push('componentCategories entries must be non-empty strings')
  }
  const unique = new Set(categories)
  if (unique.size !== categories.length) {
    errors.push('componentCategories must not contain duplicate entries')
  }
  return { valid: errors.length === 0, errors }
}

/** Whether `category` is a member of the project's configured enum. */
export function isCategoryInEnum(category: string, categories: string[]): boolean {
  return categories.includes(category)
}
