import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hashTemplateContent } from '../provenance.js'
import { rulesStatus } from './rules-status.js'

describe('rulesStatus', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'argo-rules-status-cwd-'))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('reports upToDate when the recorded hash still matches the current template content', () => {
    const argoDir = join(cwd, '.argo')
    mkdirSync(argoDir, { recursive: true })
    writeFileSync(
      join(argoDir, 'config.json'),
      JSON.stringify({ provenance: { '.claude/rules/testing.md': hashTemplateContent('# Testing\n') } })
    )

    const report = rulesStatus({ cwd, templates: { 'testing.md': '# Testing\n' } })

    expect(report).toEqual({ upToDate: ['.claude/rules/testing.md'], diverged: [], unrecorded: [] })
  })

  it('reports diverged when the installed rule was hand-adapted after install and the template moved on', () => {
    const argoDir = join(cwd, '.argo')
    mkdirSync(argoDir, { recursive: true })
    writeFileSync(
      join(argoDir, 'config.json'),
      JSON.stringify({ provenance: { '.claude/rules/testing.md': hashTemplateContent('# Testing v1\n') } })
    )

    const report = rulesStatus({ cwd, templates: { 'testing.md': '# Testing v2\n' } })

    expect(report).toEqual({ upToDate: [], diverged: ['.claude/rules/testing.md'], unrecorded: [] })
  })

  it('reports unrecorded for a template with no provenance entry at all', () => {
    const report = rulesStatus({ cwd, templates: { 'testing.md': '# Testing\n' } })

    expect(report).toEqual({ upToDate: [], diverged: [], unrecorded: ['.claude/rules/testing.md'] })
  })
})
