import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runEmitShims } from './emit-shims.js'

// Dispatches to the built dist/*.js — run `bun run build` before this test.
const ARGO_BIN = fileURLToPath(new URL('../../../../../bin/argo.js', import.meta.url))

let host: string

beforeEach(() => {
  host = mkdtempSync(join(tmpdir(), 'argo-emit-shims-'))
})
afterEach(() => rmSync(host, { recursive: true, force: true }))

function writeArgoJson(design: unknown) {
  mkdirSync(join(host, '.argo'), { recursive: true })
  writeFileSync(join(host, '.argo', 'config.json'), JSON.stringify({ landing: 'pr', design }))
}

const SHIM_PATHS = ['test/spec-diff/spec-diff.walker.spec-diff.js', 'test/vrt/vrt.walker.vrt.js']

describe('runEmitShims', () => {
  it('single-repo: emits both shims for the armed "." block with defaults derived from componentsPath', () => {
    writeArgoJson({ '.': { root: '.', componentsPath: 'src/components' } })
    const report = runEmitShims({ hostRoot: host })

    expect(report.apps.map((a) => a.appKey)).toEqual(['.'])
    for (const rel of SHIM_PATHS) expect(existsSync(join(host, rel))).toBe(true)

    const specDiff = readFileSync(join(host, SHIM_PATHS[0]), 'utf8')
    expect(specDiff).toContain("import { runSpecDiffWalker } from '@argohq/toolkit/walkers'")
    expect(specDiff).toContain('../../src/components/**/*.stories.{js,jsx,ts,tsx}')
    expect(specDiff).toContain('../../design/specs/**/*.json')
    expect(specDiff).toContain('runSpecDiffWalker({ stories, specsByComponent, composeStories })')

    const vrt = readFileSync(join(host, SHIM_PATHS[1]), 'utf8')
    expect(vrt).toContain("import { runVrtWalker } from '@argohq/toolkit/walkers'")
    expect(vrt).toContain('../../design/screenshots/**/*.png')
    expect(vrt).toContain('runVrtWalker({ stories, composeStories, committedBaselines })')
  })

  it('monorepo: emits under each ARMED app root only, skipping inert {} blocks', () => {
    writeArgoJson({
      'apps/a': { root: 'apps/a', componentsPath: 'src/components' },
      'apps/b': {},
    })
    const report = runEmitShims({ hostRoot: host })
    expect(report.apps.map((a) => a.appKey)).toEqual(['apps/a'])
    for (const rel of SHIM_PATHS) {
      expect(existsSync(join(host, 'apps/a', rel))).toBe(true)
      expect(existsSync(join(host, 'apps/b', rel))).toBe(false)
    }
  })

  it('honors design.<app>.walkers overrides (globs, storybook test package)', () => {
    writeArgoJson({
      '.': {
        root: '.',
        componentsPath: 'src/components',
        walkers: {
          storiesGlob: '../../stories/*.stories.js',
          baselinesGlob: '../../shots/**/*.png',
          storybookTestPackage: '@storybook/vue3',
        },
      },
    })
    runEmitShims({ hostRoot: host })
    const specDiff = readFileSync(join(host, SHIM_PATHS[0]), 'utf8')
    expect(specDiff).toContain("'../../stories/*.stories.js'")
    expect(specDiff).toContain("import { composeStories } from '@storybook/vue3'")
    const vrt = readFileSync(join(host, SHIM_PATHS[1]), 'utf8')
    expect(vrt).toContain("'../../shots/**/*.png'")
  })

  it('storybookTestPackage: null emits the storybook-free identity composeStories stand-in', () => {
    writeArgoJson({ '.': { root: '.', componentsPath: 'src', walkers: { storybookTestPackage: null } } })
    runEmitShims({ hostRoot: host })
    for (const rel of SHIM_PATHS) {
      const shim = readFileSync(join(host, rel), 'utf8')
      expect(shim).not.toContain('import { composeStories }')
      expect(shim).toContain('const composeStories = (storyModule) => ({ ...storyModule })')
    }
  })

  it('fails loud when the project was never initialized (no .argo/config.json)', () => {
    expect(() => runEmitShims({ hostRoot: host })).toThrow(/argo init/)
  })
})

describe('CLI wiring', () => {
  it('`argo design emit-shims --host-root <dir>` emits and reports as JSON', () => {
    writeArgoJson({ '.': { root: '.', componentsPath: 'src/components' } })
    const res = spawnSync(process.execPath, [ARGO_BIN, 'design', 'emit-shims', '--host-root', host], {
      encoding: 'utf8',
      timeout: 30_000,
    })
    expect(res.status).toBe(0)
    const report = JSON.parse(res.stdout)
    expect(report.apps[0].files).toHaveLength(2)
    for (const rel of SHIM_PATHS) expect(existsSync(join(host, rel))).toBe(true)
  })
})
