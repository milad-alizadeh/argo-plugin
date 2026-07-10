import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { computeStatus, resolveStatusSnapshot, runStatus, type StatusSnapshot } from './status.js'
import type { ArgoConfig } from '../config.js'

function baseConfig(overrides: Partial<ArgoConfig> = {}): ArgoConfig {
  return {
    packs: {},
    noPlaybook: 'allow',
    testDiscipline: undefined,
    boundaryLint: undefined,
    landing: undefined,
    provenance: {},
    ...overrides
  }
}

function baseSnapshot(overrides: Partial<StatusSnapshot> = {}): StatusSnapshot {
  return {
    config: baseConfig(),
    testDisciplineConfigExists: null,
    boundaryLintConfigExists: null,
    probityPluginEnabled: false,
    provenanceFileExists: {},
    ...overrides
  }
}

describe('computeStatus', () => {
  it('reports no mismatches for an empty config (nothing configured)', () => {
    const report = computeStatus(baseSnapshot())

    expect(report.testDiscipline).toBeNull()
    expect(report.boundaryLint).toBeNull()
    expect(report.packs).toEqual({ enabled: [], disabled: [] })
    expect(report.provenance).toEqual({ recordedCount: 0, missingOnDisk: [] })
    expect(report.mismatches).toEqual([])
  })

  it('flags testDiscipline.configPath missing on disk', () => {
    const config = baseConfig({ testDiscipline: { enforcedBy: 'probity', configPath: 'probity.config.ts' } })
    const report = computeStatus(
      baseSnapshot({ config, testDisciplineConfigExists: false, probityPluginEnabled: true })
    )

    expect(report.testDiscipline).toEqual({
      enforcedBy: 'probity',
      configPath: 'probity.config.ts',
      configPathExists: false,
      pluginEnabled: true
    })
    expect(report.mismatches).toEqual(['testDiscipline.configPath "probity.config.ts" not found on disk'])
  })

  it('flags a probity testDiscipline with no probity plugin enabled', () => {
    const config = baseConfig({ testDiscipline: { enforcedBy: 'probity', configPath: 'probity.config.ts' } })
    const report = computeStatus(
      baseSnapshot({ config, testDisciplineConfigExists: true, probityPluginEnabled: false })
    )

    expect(report.mismatches).toEqual([
      'testDiscipline.enforcedBy is "probity" but no probity plugin is enabled in .claude/settings.json'
    ])
  })

  it('flags boundaryLint.configPath missing on disk', () => {
    const config = baseConfig({
      boundaryLint: { enforcedBy: 'dependency-cruiser', configPath: '.dependency-cruiser.cjs', waivers: [] }
    })
    const report = computeStatus(baseSnapshot({ config, boundaryLintConfigExists: false }))

    expect(report.boundaryLint).toEqual({
      enforcedBy: 'dependency-cruiser',
      configPath: '.dependency-cruiser.cjs',
      configPathExists: false
    })
    expect(report.mismatches).toEqual(['boundaryLint.configPath ".dependency-cruiser.cjs" not found on disk'])
  })

  it('reports pack enabled/disabled split', () => {
    const config = baseConfig({ packs: { 'pack-design': true, 'pack-code': false } })
    const report = computeStatus(baseSnapshot({ config }))

    expect(report.packs).toEqual({ enabled: ['pack-design'], disabled: ['pack-code'] })
  })

  it('flags a recorded provenance file that no longer exists on disk', () => {
    const config = baseConfig({ provenance: { '.claude/rules/testing.md': 'abc123' } })
    const report = computeStatus(
      baseSnapshot({ config, provenanceFileExists: { '.claude/rules/testing.md': false } })
    )

    expect(report.provenance).toEqual({ recordedCount: 1, missingOnDisk: ['.claude/rules/testing.md'] })
    expect(report.mismatches).toEqual(['provenance: recorded file ".claude/rules/testing.md" no longer exists on disk'])
  })
})

describe('resolveStatusSnapshot / runStatus', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'argo-status-cwd-'))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('resolves configPathExists true and probity plugin enabled against real files', () => {
    mkdirSync(join(cwd, '.argo'), { recursive: true })
    writeFileSync(
      join(cwd, '.argo', 'config.json'),
      JSON.stringify({ testDiscipline: { enforcedBy: 'probity', configPath: 'probity.config.ts' } })
    )
    writeFileSync(join(cwd, 'probity.config.ts'), 'export default {}\n')
    mkdirSync(join(cwd, '.claude'), { recursive: true })
    writeFileSync(join(cwd, '.claude', 'settings.json'), JSON.stringify({ enabledPlugins: { 'probity@probity': true } }))

    const snapshot = resolveStatusSnapshot(cwd)
    expect(snapshot.testDisciplineConfigExists).toBe(true)
    expect(snapshot.probityPluginEnabled).toBe(true)

    const report = runStatus(cwd)
    expect(report.mismatches).toEqual([])
  })
})
