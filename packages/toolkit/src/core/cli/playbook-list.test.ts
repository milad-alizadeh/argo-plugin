import { describe, expect, it } from 'vitest'
import { buildPlaybookCatalog, runPlaybookList, toolkitVersion } from './playbook-list.js'
import type { PlaybookSpec } from '../index.js'
// `runPlaybookList` only shapes what's already registered — it never
// registers packs itself (that stays the pack-loading hub's job, per the
// port pattern this module now follows). Same composition-root call
// `bin/argo.js`'s `playbook` case makes before it runs `list`.
import { registerInstalledPacks } from '../../register-installed-packs.js'

describe('buildPlaybookCatalog', () => {
  const spec: PlaybookSpec = {
    name: 'demo',
    stages: [
      { name: 'draft', allows: ['file-edit'], skill: 'writer', session: 'warm', repeat: 'section', maxRounds: 2 },
      { name: 'verify', requires: ['draft'], allows: ['file-read'], gate: 'demo-gate', retries: 1 }
    ]
  }

  it('shapes name/slug/pack/version and per-stage gate names', () => {
    const [entry] = buildPlaybookCatalog([spec], { version: '1.2.3', packOf: () => 'design' })
    expect(entry.name).toBe('demo')
    expect(entry.slug).toBe('demo')
    expect(entry.displayName).toBe('Demo')
    expect(entry.pack).toBe('design')
    expect(entry.version).toBe('1.2.3')
    expect(entry.versionSource).toBe('toolkit-package')
    expect(entry.stages.map((s) => ({ name: s.name, gate: s.gate }))).toEqual([
      { name: 'draft', gate: null },
      { name: 'verify', gate: 'demo-gate' }
    ])
  })

  it('carries the full stage vocabulary and the input contract', () => {
    const [entry] = buildPlaybookCatalog([spec], { version: '1.2.3', packOf: () => 'design' })
    expect(entry.stages[0]).toMatchObject({ skill: 'writer', session: 'warm', repeat: 'section', maxRounds: 2 })
    expect(entry.stages[1]).toMatchObject({ requires: ['draft'], retries: 1 })
    expect(entry.input.target.required).toBe(true)
    expect(entry.input.key.required).toBe(false)
  })
})

describe('runPlaybookList', () => {
  it('enumerates pack-design’s registered playbooks, attributed to pack "design"', () => {
    registerInstalledPacks()
    const catalog = runPlaybookList()
    const names = catalog.map((e) => e.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'screen-create',
        'component-create',
        'component-edit',
        'screen-edit',
        'design-to-code',
        'code-to-design'
      ])
    )
    const screenCreate = catalog.find((e) => e.name === 'screen-create')
    // Authored verb-first pretty name on the spec wins over derivation.
    expect(screenCreate?.displayName).toBe('Create screen')
    for (const entry of catalog) {
      expect(entry.pack).toBe('design')
      expect(entry.displayName.charAt(0)).toBe(entry.displayName.charAt(0).toUpperCase())
      expect(entry.version).toBe(toolkitVersion())
      expect(entry.stages.length).toBeGreaterThan(0)
    }
  })
})
