import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { recordProvenance } from './rules-record.js'

describe('recordProvenance', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'argo-rules-record-'))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('creates .argo/config.json with provenance when none exists yet', () => {
    recordProvenance('.claude/rules/testing.md', 'abc123', { cwd })

    const written = JSON.parse(readFileSync(join(cwd, '.argo', 'config.json'), 'utf8'))
    expect(written.provenance).toEqual({ '.claude/rules/testing.md': 'abc123' })
  })

  it('adds to an existing provenance map without disturbing other files or keys', () => {
    const argoDir = join(cwd, '.argo')
    mkdirSync(argoDir, { recursive: true })
    writeFileSync(
      join(argoDir, 'config.json'),
      JSON.stringify({ noPlaybook: 'coach', provenance: { '.claude/rules/other.md': 'zzz' } }, null, 2)
    )

    recordProvenance('.claude/rules/testing.md', 'abc123', { cwd })

    const written = JSON.parse(readFileSync(join(argoDir, 'config.json'), 'utf8'))
    expect(written).toEqual({
      noPlaybook: 'coach',
      provenance: { '.claude/rules/other.md': 'zzz', '.claude/rules/testing.md': 'abc123' }
    })
  })

  it('overwrites the hash for a file that was already recorded (re-adopting a rule)', () => {
    recordProvenance('.claude/rules/testing.md', 'old-hash', { cwd })
    recordProvenance('.claude/rules/testing.md', 'new-hash', { cwd })

    const written = JSON.parse(readFileSync(join(cwd, '.argo', 'config.json'), 'utf8'))
    expect(written.provenance).toEqual({ '.claude/rules/testing.md': 'new-hash' })
  })
})
