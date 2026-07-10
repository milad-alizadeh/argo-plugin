import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { recordLspPosture } from './tooling-record.js'

describe('recordLspPosture', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'argo-tooling-record-'))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('creates .argo/config.json with tooling.lsp when none exists yet', () => {
    recordLspPosture('typescript', 'wired', { cwd })

    const written = JSON.parse(readFileSync(join(cwd, '.argo', 'config.json'), 'utf8'))
    expect(written.tooling).toEqual({ lsp: { typescript: 'wired' } })
  })

  it('adds to an existing tooling.lsp map without disturbing other files or keys', () => {
    const argoDir = join(cwd, '.argo')
    mkdirSync(argoDir, { recursive: true })
    writeFileSync(
      join(argoDir, 'config.json'),
      JSON.stringify({ noPlaybook: 'coach', tooling: { lsp: { go: 'recommended-not-installed' } } }, null, 2)
    )

    recordLspPosture('typescript', 'wired', { cwd })

    const written = JSON.parse(readFileSync(join(argoDir, 'config.json'), 'utf8'))
    expect(written).toEqual({
      noPlaybook: 'coach',
      tooling: { lsp: { go: 'recommended-not-installed', typescript: 'wired' } }
    })
  })

  it('overwrites the posture for a language already recorded (re-wiring)', () => {
    recordLspPosture('typescript', 'recommended-not-installed', { cwd })
    recordLspPosture('typescript', 'wired', { cwd })

    const written = JSON.parse(readFileSync(join(cwd, '.argo', 'config.json'), 'utf8'))
    expect(written.tooling.lsp).toEqual({ typescript: 'wired' })
  })

  it('rejects an unknown posture value', () => {
    expect(() => recordLspPosture('typescript', 'bogus', { cwd })).toThrow(/invalid LSP posture/)
  })
})
