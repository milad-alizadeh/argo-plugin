import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deriveTier0AuditOptions } from '../scripts/prepare-tier0-audit-options.mjs'

describe('deriveTier0AuditOptions (figma-audit Node wrapper — anti-recreation gate wiring)', () => {
  it('reads design/registry.json and passes its component names as compositeNames', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'tier0-audit-options-'))
    mkdirSync(join(cwd, 'design'), { recursive: true })
    writeFileSync(
      join(cwd, 'design', 'registry.json'),
      JSON.stringify({ components: { 'rail-session-card': { nodeId: '126:35' }, 'status-bar': { nodeId: '126:227' } } }),
      'utf8'
    )

    try {
      expect(deriveTier0AuditOptions({ cwd, componentNames: ['rail-session-card'] })).toEqual({
        componentNames: ['rail-session-card'],
        compositeNames: ['rail-session-card', 'status-bar']
      })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('fails open (empty compositeNames) when design/registry.json is absent', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'tier0-audit-options-'))
    try {
      expect(deriveTier0AuditOptions({ cwd })).toEqual({ componentNames: [], compositeNames: [] })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
