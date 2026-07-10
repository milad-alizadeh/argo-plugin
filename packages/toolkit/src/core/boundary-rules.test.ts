import { describe, expect, it } from 'vitest'
import { boundaryRules } from './boundary-rules.js'

const argoV2RoleMap = {
  bootstrap: 'composition-root' as const,
  platform: 'infrastructure' as const,
  domains: 'domain' as const,
  lib: 'shared' as const
}

describe('boundaryRules', () => {
  it('generates no rules for the composition-root role as a from', () => {
    const rules = boundaryRules(
      { bootstrap: 'composition-root', lib: 'shared' },
      { root: 'src/main' }
    )
    expect(rules.some((r) => r.from.path === '^src/main/bootstrap')).toBe(false)
  })

  it('restricts infrastructure and composition-root imports of a domain to its index.ts barrel', () => {
    const rules = boundaryRules(argoV2RoleMap, { root: 'src/main' })
    const rule = rules.find((r) => r.to.path === '^src/main/domains/.+')
    expect(rule).toBeDefined()
    expect(rule?.from.path).toBe('^src/main/(bootstrap|platform)')
    expect(rule?.to.pathNot).toBe('/index\\.ts$')
  })

  it('restricts cross-domain imports to the target domain barrel via $1 capture-group substitution', () => {
    const rules = boundaryRules(argoV2RoleMap, { root: 'src/main' })
    const rule = rules.find((r) => r.name === 'no-cross-domain-leaf-import-domains')
    expect(rule).toEqual({
      name: 'no-cross-domain-leaf-import-domains',
      comment:
        'A domains domain may import another domains domain only via its index.ts barrel, never a leaf file. Same-domain internal imports are unrestricted.',
      severity: 'error',
      from: { path: '^src/main/domains/([^/]+)/' },
      to: {
        path: '^src/main/domains/',
        pathNot: ['^src/main/domains/$1/', '^src/main/domains/[^/]+/index\\.ts$']
      }
    })
  })

  it('forbids a shared role from importing any other role', () => {
    const rules = boundaryRules(argoV2RoleMap, { root: 'src/main' })
    const rule = rules.find((r) => r.from.path === '^src/main/lib')
    expect(rule?.to.path).toBe('^src/main/(bootstrap|platform|domains)')
  })

  it('fails structure guard for imports into an undeclared top-level folder', () => {
    const rules = boundaryRules(argoV2RoleMap, { root: 'src/main' })
    const rule = rules.find((r) => r.name.startsWith('no-unknown-'))
    expect(rule).toEqual({
      name: 'no-unknown-src-main-top-level',
      comment:
        'src/main imports must land under a known top-level (see the role map) or src/main/index.ts itself; an undeclared grouping folder is a structure violation.',
      severity: 'error',
      from: { path: '^src/main' },
      to: {
        path: '^src/main/.+',
        pathNot: ['^src/main/(bootstrap|platform|domains|lib)/', '^src/main/index\\.ts$']
      }
    })
  })

  it('throws on an unknown role', () => {
    expect(() =>
      // @ts-expect-error - deliberately invalid role for the validation test
      boundaryRules({ bogus: 'not-a-role' }, { root: 'src/main' })
    ).toThrow(/unknown role/i)
  })

  it('reproduces argo-v2 desktop config rule-for-rule, semantically', () => {
    const rules = boundaryRules(argoV2RoleMap, { root: 'src/main' })

    expect(rules).toContainEqual(
      expect.objectContaining({
        name: 'no-domain-leaf-import-from-infrastructure-or-composition-root-into-domains',
        severity: 'error',
        from: { path: '^src/main/(bootstrap|platform)' },
        to: { path: '^src/main/domains/.+', pathNot: '/index\\.ts$' }
      })
    )

    expect(rules).toContainEqual(
      expect.objectContaining({
        name: 'no-cross-domain-leaf-import-domains',
        severity: 'error',
        from: { path: '^src/main/domains/([^/]+)/' },
        to: {
          path: '^src/main/domains/',
          pathNot: ['^src/main/domains/$1/', '^src/main/domains/[^/]+/index\\.ts$']
        }
      })
    )

    expect(rules).toContainEqual(
      expect.objectContaining({
        name: 'no-unknown-src-main-top-level',
        severity: 'error',
        from: { path: '^src/main' },
        to: {
          path: '^src/main/.+',
          pathNot: ['^src/main/(bootstrap|platform|domains|lib)/', '^src/main/index\\.ts$']
        }
      })
    )
  })
})
