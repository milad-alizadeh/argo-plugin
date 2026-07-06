import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInit } from './init.js'
import { runUpdate } from './update.js'

/**
 * Deterministic half of /argo:update (amended): re-emit .claude/argo.json
 * skeleton defaults preserving user-edited fields via mergeConfigShape; the
 * link: dep line is version-less so nothing bumps in the dev phase; no
 * migrations of any kind.
 */

let host

beforeEach(() => {
  host = mkdtempSync(join(tmpdir(), 'argo-update-'))
  writeFileSync(join(host, 'package.json'), JSON.stringify({ name: 'solo' }))
  runInit({ hostRoot: host })
})
afterEach(() => rmSync(host, { recursive: true, force: true }))

describe('runUpdate', () => {
  it('preserves user-edited argo.json fields and reports newly added skeleton keys', () => {
    const argoPath = join(host, '.claude', 'argo.json')
    const edited = JSON.parse(readFileSync(argoPath, 'utf8'))
    edited.landing = 'merge'
    edited.design['.'] = { root: '.', componentsPath: 'src/components' }
    delete edited.landing // simulate a field a NEWER skeleton would re-add
    writeFileSync(argoPath, JSON.stringify(edited))

    const report = runUpdate({ hostRoot: host })
    const after = JSON.parse(readFileSync(argoPath, 'utf8'))
    expect(after.design['.'].componentsPath).toBe('src/components') // user value untouched
    expect(after.landing).toBe('pr') // skeleton default re-emitted
    expect(report.addedKeys).toContain('landing')
  })

  it('does NOT touch the link: dep line (version-less in the dev phase)', () => {
    const before = readFileSync(join(host, 'package.json'), 'utf8')
    runUpdate({ hostRoot: host })
    expect(readFileSync(join(host, 'package.json'), 'utf8')).toBe(before)
  })

  it('fails loud when the project was never initialized (no .claude/argo.json)', () => {
    rmSync(join(host, '.claude'), { recursive: true, force: true })
    expect(() => runUpdate({ hostRoot: host })).toThrow(/argo init/)
  })
})
