import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveRepoRoot } from './repo-root.js'

describe('resolveRepoRoot', () => {
  it('returns the git toplevel for a path inside a repo', () => {
    // This file's own repo — argo-plugin — is a real git repo, so the
    // toplevel for any path under it must resolve to the repo root, not
    // whatever subdirectory we pass in (the monorepo-app-root case this
    // exists to fix).
    const top = execFileSync('git', ['-C', import.meta.dirname, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
    expect(resolveRepoRoot(import.meta.dirname)).toBe(top)
    expect(resolveRepoRoot(join(top, 'packages', 'kit'))).toBe(top)
  })

  it('falls back to cwd when not inside a git repo', () => {
    const outside = mkdtempSync(join(tmpdir(), 'repo-root-fallback-'))
    try {
      expect(resolveRepoRoot(outside)).toBe(outside)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })
})
