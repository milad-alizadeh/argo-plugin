import { describe, expect, it } from 'vitest'
import { getGate, listPlaybooks } from './core/index.js'
import { registerInstalledPacks, packOfSpec } from './register-installed-packs.js'

describe('registerInstalledPacks', () => {
  it('is idempotent and registers pack-design playbooks plus the headless CLI gate set', () => {
    registerInstalledPacks()
    registerInstalledPacks()
    expect(listPlaybooks().some((s) => s.name === 'screen-create')).toBe(true)
    expect(getGate('design-rules-check')).toBeTruthy()
    expect(getGate('brief-check')).toBeTruthy()
    expect(getGate('fresh-eyes-review')).toBeTruthy()
  })
})

describe('packOfSpec', () => {
  it('attributes every registered pack-design spec to pack "design"', () => {
    registerInstalledPacks()
    const screenCreate = listPlaybooks().find((s) => s.name === 'screen-create')!
    expect(packOfSpec(screenCreate)).toBe('design')
  })

  it('reports "unknown" for a spec that belongs to no known pack', () => {
    expect(packOfSpec({ name: 'not-a-real-spec', stages: [] })).toBe('unknown')
  })
})
