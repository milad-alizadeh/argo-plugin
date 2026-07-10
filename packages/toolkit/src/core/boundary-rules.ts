/**
 * Generates a dependency-cruiser `forbidden` array from a role map
 * (file-structure.md's "Boundary-lint config pattern"). Pure data — no
 * dependency-cruiser import, no I/O.
 */

export type BoundaryRole = 'composition-root' | 'infrastructure' | 'domain' | 'shared'

export interface BoundaryRoleMap {
  [folder: string]: BoundaryRole
}

export interface BoundaryRulesOptions {
  root: string
}

export interface BoundaryForbiddenRule {
  name: string
  comment: string
  severity: 'error'
  from: { path: string }
  to: { path: string; pathNot?: string | string[] }
}

const KNOWN_ROLES: readonly BoundaryRole[] = ['composition-root', 'infrastructure', 'domain', 'shared']

function assertValidRoleMap(roleMap: BoundaryRoleMap): void {
  for (const [folder, role] of Object.entries(roleMap)) {
    if (!KNOWN_ROLES.includes(role)) {
      throw new Error(
        `boundaryRules: unknown role "${role}" for folder "${folder}" — must be one of ${KNOWN_ROLES.join(', ')}`
      )
    }
  }
}

export function boundaryRules(
  roleMap: BoundaryRoleMap,
  options: BoundaryRulesOptions
): BoundaryForbiddenRule[] {
  assertValidRoleMap(roleMap)

  const { root } = options
  const folders = Object.keys(roleMap)
  const rules: BoundaryForbiddenRule[] = []

  const domainFolders = folders.filter((f) => roleMap[f] === 'domain')
  const importerFolders = folders.filter(
    (f) => roleMap[f] === 'infrastructure' || roleMap[f] === 'composition-root'
  )

  for (const domainFolder of domainFolders) {
    if (importerFolders.length > 0) {
      rules.push({
        name: `no-domain-leaf-import-from-infrastructure-or-composition-root-into-${domainFolder}`,
        comment: `${root}/(${importerFolders.join('|')}) may only import ${domainFolder} via its index.ts barrel, never a domain leaf file directly.`,
        severity: 'error',
        from: { path: `^${root}/(${importerFolders.join('|')})` },
        to: {
          path: `^${root}/${domainFolder}/.+`,
          pathNot: '/index\\.ts$'
        }
      })
    }

    rules.push({
      name: `no-cross-domain-leaf-import-${domainFolder}`,
      comment: `A ${domainFolder} domain may import another ${domainFolder} domain only via its index.ts barrel, never a leaf file. Same-domain internal imports are unrestricted.`,
      severity: 'error',
      from: { path: `^${root}/${domainFolder}/([^/]+)/` },
      to: {
        path: `^${root}/${domainFolder}/`,
        pathNot: [`^${root}/${domainFolder}/$1/`, `^${root}/${domainFolder}/[^/]+/index\\.ts$`]
      }
    })
  }

  const sharedFolders = folders.filter((f) => roleMap[f] === 'shared')
  const otherFolders = folders.filter((f) => roleMap[f] !== 'shared')
  for (const sharedFolder of sharedFolders) {
    if (otherFolders.length === 0) continue
    rules.push({
      name: `no-${sharedFolder}-importing-other-roles`,
      comment: `${root}/${sharedFolder} is shared and must not import any of the other roles under ${root}.`,
      severity: 'error',
      from: { path: `^${root}/${sharedFolder}` },
      to: { path: `^${root}/(${otherFolders.join('|')})` }
    })
  }

  rules.push({
    name: `no-unknown-${root.replace(/\W+/g, '-')}-top-level`,
    comment: `${root} imports must land under a known top-level (see the role map) or ${root}/index.ts itself; an undeclared grouping folder is a structure violation.`,
    severity: 'error',
    from: { path: `^${root}` },
    to: {
      path: `^${root}/.+`,
      pathNot: [`^${root}/(${folders.join('|')})/`, `^${root}/index\\.ts$`]
    }
  })

  return rules
}
