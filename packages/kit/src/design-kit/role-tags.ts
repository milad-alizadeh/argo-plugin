/**
 * Role-tag contract for the geometry layer (fidelity-geometry-verifier.md,
 * resolved decision 1): a geometry rule never guesses which node is which —
 * a component author marks the load-bearing nodes a geometry check needs
 * with a `#<role>` suffix on the layer name (e.g. `Row Content
 * #content-start`, `Connector #rail`, `Icon #anchor`). Same regex-suffix
 * convention as `nonSemanticNameViolation`/`isDesignPageName` in
 * tier0-rules.ts — zero new Plugin-API surface.
 */
export type Role = 'content-start' | 'rail' | 'anchor' | 'hit-target'

const ROLE_SUFFIX = /#(content-start|rail|anchor|hit-target)$/
const ALL_ROLES: Role[] = ['content-start', 'rail', 'anchor', 'hit-target']

export function roleTagOf(node: { name?: string }): Role | null {
  const m = ROLE_SUFFIX.exec(String(node?.name ?? '').trim())
  return (m?.[1] as Role) ?? null
}

/** First descendant (depth-first, self included) carrying `role`, or null. */
export function findByRole(tree: any, role: Role): any | null {
  if (roleTagOf(tree) === role) return tree
  for (const child of tree?.children ?? []) {
    const hit = findByRole(child, role)
    if (hit) return hit
  }
  return null
}

/** Every direct-or-nested descendant carrying `role`, depth-first order. */
export function findAllByRole(tree: any, role: Role): any[] {
  const out: any[] = []
  const walk = (n: any) => {
    if (roleTagOf(n) === role) out.push(n)
    for (const c of n?.children ?? []) walk(c)
  }
  walk(tree)
  return out
}

/** True when the tree carries at least one of the 4 role tags anywhere. */
export function hasAnyRoleTag(tree: any): boolean {
  return ALL_ROLES.some((role) => findByRole(tree, role) !== null)
}
