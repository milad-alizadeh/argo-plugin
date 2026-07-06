import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  findArgoJson,
  resolveDesignArming,
  resolveComponentsPath,
  matchesStagedFile,
  armedDesignApps,
} from '../packages/kit/src/config/argo-json.js'

/**
 * Decision 8's dual-mode hook resolution: gates arm per-app from
 * `.claude/argo.json`'s `design.<app>` blocks, matched repo-root-relative —
 * fixing the "design/config.json presence silently no-ops per-app in
 * monorepos" bug the design doc names.
 */

let repo

function writeArgoJson(config) {
  mkdirSync(join(repo, '.claude'), { recursive: true })
  writeFileSync(join(repo, '.claude', 'argo.json'), JSON.stringify(config))
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'argo-json-resolution-'))
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

describe('findArgoJson', () => {
  it('walks up from a nested cwd to the first .claude/argo.json and reports its repo root', () => {
    writeArgoJson({ design: { '.': { root: '.', componentsPath: 'src/components' } } })
    const nested = join(repo, 'apps', 'a', 'src')
    mkdirSync(nested, { recursive: true })
    const found = findArgoJson(nested)
    expect(found).not.toBeNull()
    expect(found.repoRoot).toBe(resolve(repo))
    expect(found.config.design['.'].componentsPath).toBe('src/components')
  })

  it('returns null when no .claude/argo.json exists anywhere up the tree (inert, no throw)', () => {
    expect(findArgoJson(repo)).toBeNull()
  })

  it('returns null on malformed JSON rather than throwing', () => {
    mkdirSync(join(repo, '.claude'), { recursive: true })
    writeFileSync(join(repo, '.claude', 'argo.json'), '{not json')
    expect(findArgoJson(repo)).toBeNull()
  })
})

describe('resolveDesignArming / resolveComponentsPath / matchesStagedFile', () => {
  it('arms only for an app that has a design block', () => {
    const config = { design: { 'apps/a': { root: 'apps/a', componentsPath: 'src/components' } } }
    expect(resolveDesignArming(config, 'apps/a')).toBeTruthy()
    expect(resolveDesignArming(config, 'apps/b')).toBeNull()
    expect(resolveDesignArming({}, 'apps/a')).toBeNull()
  })

  it('resolves componentsPath under join(repoRoot, root, componentsPath)', () => {
    const block = { root: 'apps/a', componentsPath: 'src/components' }
    expect(resolveComponentsPath('/repo', block)).toBe(resolve('/repo/apps/a/src/components'))
    expect(resolveComponentsPath('/repo', { root: '.', componentsPath: 'src/ui' })).toBe(resolve('/repo/src/ui'))
  })

  it('matches staged files repo-root-relative against the resolved componentsPath', () => {
    const resolved = resolveComponentsPath('/repo', { root: 'apps/a', componentsPath: 'src/components' })
    expect(matchesStagedFile(resolved, '/repo', ['apps/a/src/components/Button.tsx'])).toBe(true)
    expect(matchesStagedFile(resolved, '/repo', ['apps/b/src/components/Button.tsx'])).toBe(false)
    expect(matchesStagedFile(resolved, '/repo', ['apps/a/src/components-extra/X.tsx'])).toBe(false)
    expect(matchesStagedFile(resolved, '/repo', [])).toBe(false)
  })
})

describe('armedDesignApps (what the commit gates consume)', () => {
  it('monorepo: arms for the configured app only, inert for its sibling', () => {
    writeArgoJson({ design: { 'apps/a': { root: 'apps/a', componentsPath: 'src/components' } } })
    const found = findArgoJson(repo)

    const armedForA = armedDesignApps(found, ['apps/a/src/components/Button.tsx'])
    expect(armedForA).toHaveLength(1)
    expect(armedForA[0].appKey).toBe('apps/a')
    expect(armedForA[0].designDir).toBe(resolve(repo, 'apps/a', 'design'))
    expect(armedForA[0].appRelativeStagedFiles).toEqual(['src/components/Button.tsx'])

    expect(armedDesignApps(found, ['apps/b/src/components/Button.tsx'])).toHaveLength(0)
  })

  it('single-repo: design keyed by "." arms correctly', () => {
    writeArgoJson({ design: { '.': { root: '.', componentsPath: 'src/components' } } })
    const found = findArgoJson(repo)
    const armed = armedDesignApps(found, ['src/components/Button.tsx', 'README.md'])
    expect(armed).toHaveLength(1)
    expect(armed[0].appKey).toBe('.')
    expect(armed[0].designDir).toBe(resolve(repo, 'design'))
    expect(armed[0].appRelativeStagedFiles).toEqual(['src/components/Button.tsx', 'README.md'])
  })

  it('no design key at all: nothing arms', () => {
    writeArgoJson({})
    const found = findArgoJson(repo)
    expect(armedDesignApps(found, ['src/components/Button.tsx'])).toHaveLength(0)
  })
})
