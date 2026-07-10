import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertPackAvailable, PackUnavailableError, readConfig, type ArgoConfig } from './config.js'

describe('readConfig', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'argo-config-cwd-'))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('returns defaults when no .argo/config.json exists', () => {
    expect(readConfig(cwd)).toEqual({
      packs: {},
      noPlaybook: 'allow',
      testDiscipline: undefined,
      boundaryLint: undefined,
      landing: undefined,
      provenance: {}
    })
  })

  it('reads provenance verbatim from a present file', () => {
    const argoDir = join(cwd, '.argo')
    mkdirSync(argoDir, { recursive: true })
    writeFileSync(
      join(argoDir, 'config.json'),
      JSON.stringify({ provenance: { '.claude/rules/testing.md': 'abc123' } })
    )

    expect(readConfig(cwd).provenance).toEqual({ '.claude/rules/testing.md': 'abc123' })
  })

  it('reads values verbatim from a present file, walking up from a nested cwd', () => {
    const argoDir = join(cwd, '.argo')
    mkdirSync(argoDir, { recursive: true })
    writeFileSync(
      join(argoDir, 'config.json'),
      JSON.stringify({
        packs: { 'pack-design': true, 'pack-code': false },
        noPlaybook: 'deny-edits',
        testDiscipline: { enforcedBy: 'probity', configPath: 'probity.config.ts' },
        boundaryLint: { enforcedBy: 'dependency-cruiser', configPath: '.dependency-cruiser.cjs', waivers: [] },
        landing: 'pr'
      })
    )

    const nested = join(cwd, 'apps', 'web')
    mkdirSync(nested, { recursive: true })

    expect(readConfig(nested)).toEqual({
      packs: { 'pack-design': true, 'pack-code': false },
      noPlaybook: 'deny-edits',
      testDiscipline: { enforcedBy: 'probity', configPath: 'probity.config.ts' },
      boundaryLint: { enforcedBy: 'dependency-cruiser', configPath: '.dependency-cruiser.cjs', waivers: [] },
      landing: 'pr',
      provenance: {}
    })
  })

  it('falls back to defaults for keys missing from a partial file', () => {
    const argoDir = join(cwd, '.argo')
    mkdirSync(argoDir, { recursive: true })
    writeFileSync(join(argoDir, 'config.json'), JSON.stringify({ noPlaybook: 'deny-edits' }))

    expect(readConfig(cwd)).toEqual({
      packs: {},
      noPlaybook: 'deny-edits',
      testDiscipline: undefined,
      boundaryLint: undefined,
      landing: undefined,
      provenance: {}
    })
  })

  it('returns defaults (never throws) when the file is malformed JSON', () => {
    const argoDir = join(cwd, '.argo')
    mkdirSync(argoDir, { recursive: true })
    writeFileSync(join(argoDir, 'config.json'), '{ not valid json')

    expect(() => readConfig(cwd)).not.toThrow()
    expect(readConfig(cwd)).toEqual({
      packs: {},
      noPlaybook: 'allow',
      testDiscipline: undefined,
      boundaryLint: undefined,
      landing: undefined,
      provenance: {}
    })
  })

  it('reads "coach" verbatim and falls back to "allow" for an unknown noPlaybook value', () => {
    const argoDir = join(cwd, '.argo')
    mkdirSync(argoDir, { recursive: true })
    const path = join(argoDir, 'config.json')
    writeFileSync(path, JSON.stringify({ noPlaybook: 'coach' }))
    expect(readConfig(cwd).noPlaybook).toBe('coach')

    writeFileSync(path, JSON.stringify({ noPlaybook: 'bogus-mode' }))
    expect(readConfig(cwd).noPlaybook).toBe('allow')
  })

  it('reads live per call — a later edit is picked up without caching', () => {
    const argoDir = join(cwd, '.argo')
    mkdirSync(argoDir, { recursive: true })
    const path = join(argoDir, 'config.json')
    writeFileSync(path, JSON.stringify({ noPlaybook: 'allow' }))
    expect(readConfig(cwd).noPlaybook).toBe('allow')

    writeFileSync(path, JSON.stringify({ noPlaybook: 'deny-edits' }))
    expect(readConfig(cwd).noPlaybook).toBe('deny-edits')
  })
})

describe('assertPackAvailable', () => {
  function makeConfig(packs: Record<string, boolean>): ArgoConfig {
    return { packs, noPlaybook: 'allow', testDiscipline: undefined, boundaryLint: undefined, landing: undefined, provenance: {} }
  }

  it('throws PackUnavailableError naming the disabled pack (design-to-code -> pack-code)', () => {
    const config = makeConfig({ 'pack-design': true, 'pack-code': false })

    expect(() => assertPackAvailable('design-to-code', 'pack-code', config)).toThrow(PackUnavailableError)
    try {
      assertPackAvailable('design-to-code', 'pack-code', config)
      throw new Error('expected assertPackAvailable to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(PackUnavailableError)
      expect((err as Error).message).toContain('pack-code')
      expect((err as Error).message).toContain('design-to-code')
    }
  })

  it('throws when the required pack is absent from packs entirely (deny-by-default)', () => {
    const config = makeConfig({ 'pack-design': true })

    expect(() => assertPackAvailable('design-to-code', 'pack-code', config)).toThrow(/pack-code/)
  })

  it('does not throw when the required pack is enabled', () => {
    const config = makeConfig({ 'pack-design': true, 'pack-code': true })

    expect(() => assertPackAvailable('design-to-code', 'pack-code', config)).not.toThrow()
  })
})
