import { describe, it, expect } from 'vitest'
import { migrations } from '../packages/setup-migrations/migrations.js'

const mig = migrations.find((m) => m.id === 'vendor-figma-design-kit-absolute-path')

const absoluteFixture = () => ({
  name: 'apps-desktop',
  dependencies: {
    'figma-design-kit':
      'file:/Users/someone/.claude/plugins/cache/argo/argo/0.10.1/packages/figma-design-kit',
    'figma-design-kit-shadcn-tailwind':
      'file:/Users/someone/.claude/plugins/cache/argo/argo/0.10.1/packages/figma-design-kit-shadcn-tailwind',
    zod: '^4.4.3'
  }
})

describe('vendor-figma-design-kit-absolute-path migration', () => {
  it('exists at sinceVersion 0.11.0', () => {
    expect(mig).toBeTruthy()
    expect(mig.sinceVersion).toBe('0.11.0')
  })
  it('detect: true on an absolute plugin-cache file: dep', () => {
    expect(mig.detect(absoluteFixture())).toBe(true)
  })
  it('detect: false when deps are already workspace:*', () => {
    expect(mig.detect({ dependencies: { 'figma-design-kit': 'workspace:*' } })).toBe(false)
  })
  it('computePatch (file mode): rewrites to relative file:, leaves everything else untouched', () => {
    const planFor = (name) => ({ depSpecifier: `file:./design/vendor/${name}` })
    const out = mig.computePatch(absoluteFixture(), planFor)
    expect(out.dependencies['figma-design-kit']).toBe('file:./design/vendor/figma-design-kit')
    expect(out.dependencies['figma-design-kit-shadcn-tailwind']).toBe(
      'file:./design/vendor/figma-design-kit-shadcn-tailwind'
    )
    expect(out.dependencies.zod).toBe('^4.4.3') // untouched
    expect(out.name).toBe('apps-desktop') // untouched
  })
  it('computePatch (workspace mode): rewrites to workspace:*', () => {
    const planFor = () => ({ depSpecifier: 'workspace:*' })
    const out = mig.computePatch(absoluteFixture(), planFor)
    expect(out.dependencies['figma-design-kit']).toBe('workspace:*')
    expect(out.dependencies['figma-design-kit-shadcn-tailwind']).toBe('workspace:*')
  })
  it('computePatch returns null when nothing matches', () => {
    expect(mig.computePatch({ dependencies: { zod: '^4' } }, () => ({ depSpecifier: 'x' }))).toBeNull()
  })
  it('secondary: an off-convention relative vendor dep is flagged only on a workspace host', () => {
    const relFixture = { dependencies: { 'figma-design-kit': 'file:./design/vendor/figma-design-kit' } }
    expect(mig.detect(relFixture, { isWorkspace: true })).toBe(true)
    expect(mig.detect(relFixture, { isWorkspace: false })).toBe(false)
  })
})
