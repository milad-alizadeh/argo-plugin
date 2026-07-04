import { describe, it, expect } from 'vitest'
import { resolveVendorPlan } from '../packages/setup-migrations/resolve-vendor-plan.js'

describe('resolveVendorPlan (§2f workspace-aware vendoring)', () => {
  it('workspace host (root has workspaces globs) -> workspace:* into packages/', () => {
    const plan = resolveVendorPlan({ workspaces: ['apps/*', 'packages/*'] }, 'figma-design-kit')
    expect(plan).toEqual({ mode: 'workspace', packageDir: 'packages', depSpecifier: 'workspace:*' })
  })
  it('non-workspace host -> relative file: into design/vendor/', () => {
    const plan = resolveVendorPlan({ name: 'plain-app' }, 'figma-design-kit')
    expect(plan).toEqual({
      mode: 'file',
      packageDir: 'design/vendor',
      depSpecifier: 'file:./design/vendor/figma-design-kit'
    })
  })
  it('pnpm workspace (manifest flag) -> workspace mode even with no workspaces field', () => {
    const plan = resolveVendorPlan({ name: 'pnpm-app' }, 'figma-design-kit', { pnpmWorkspace: true })
    expect(plan.mode).toBe('workspace')
    expect(plan.depSpecifier).toBe('workspace:*')
  })
  it('yarn-style workspaces object ({ packages: [...] }) is recognized', () => {
    const plan = resolveVendorPlan({ workspaces: { packages: ['packages/*'] } }, 'x')
    expect(plan.mode).toBe('workspace')
    expect(plan.packageDir).toBe('packages')
  })
})
