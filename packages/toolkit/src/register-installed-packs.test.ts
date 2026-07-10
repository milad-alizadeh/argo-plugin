import { describe, expect, it } from 'vitest'
import { getGate, getPlaybookPack, listPlaybooks } from './core/index.js'
import { registerInstalledPacks } from './register-installed-packs.js'

describe('registerInstalledPacks', () => {
  it('is idempotent and registers pack-design playbooks plus the headless CLI gate set', () => {
    registerInstalledPacks()
    registerInstalledPacks()
    expect(listPlaybooks().some((s) => s.name === 'screen-create')).toBe(true)
    expect(getGate('design-rules-check')).toBeTruthy()
    expect(getGate('brief-check')).toBeTruthy()
    expect(getGate('fresh-eyes-review')).toBeTruthy()
  })

  it('attributes every registered pack-design spec to pack "design" via core\'s own registry', () => {
    registerInstalledPacks()
    expect(getPlaybookPack('screen-create')).toBe('design')
  })
})
