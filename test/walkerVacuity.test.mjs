import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { FIXTURES, materializeFixture, linkKit, runArgo, readJson, writeJson, join } from './acidHelpers.mjs'

/**
 * Decision 14's explicit mandate: a rename can never silently zero out a
 * gate. Both walker vitest projects (`spec-diff`, `vrt`) must COLLECT a
 * nonzero test count against the acid-single-repo fixture's smoke story —
 * asserted via `vitest list` (collection only, no browser needed), spawned
 * with the fixture as root and the kit resolved through the bun-link-shaped
 * node_modules. Zero collected tests = the exact silent failure this guards.
 */

const VITEST_BIN = fileURLToPath(new URL('../node_modules/.bin/vitest', import.meta.url))

let host

beforeAll(() => {
  host = materializeFixture(FIXTURES.singleRepo)
  linkKit(host, { withVitest: true })
})
afterAll(() => rmSync(host, { recursive: true, force: true }))

function listProject(project, root = host) {
  const res = spawnSync(VITEST_BIN, ['list', '--project', project, '--config', join(root, 'vitest.walkers.config.mjs'), '--root', root], {
    cwd: root,
    encoding: 'utf8',
  })
  const tests = res.stdout.split('\n').filter((line) => line.trim().length > 0)
  return { res, tests }
}

describe('walker vacuity — the two gate projects always collect tests', () => {
  it('spec-diff project collects > 0 tests from the smoke story + spec', () => {
    const { res, tests } = listProject('spec-diff')
    expect(res.status, res.stderr).toBe(0)
    expect(tests.length).toBeGreaterThan(0)
  })

  it('vrt project collects > 0 tests from the smoke story + baseline', () => {
    const { res, tests } = listProject('vrt')
    expect(res.status, res.stderr).toBe(0)
    expect(tests.length).toBeGreaterThan(0)
  })
})

describe('emitted shims are not vacuous — `argo design emit-shims` output collects too', () => {
  let emitted

  beforeAll(() => {
    emitted = materializeFixture(FIXTURES.singleRepo)
    linkKit(emitted, { withVitest: true })
    // Point the generated globs at the fixture's actual layout (stories/ sits
    // outside componentsPath) and use the storybook-free composeStories.
    const argoJson = readJson(emitted, '.claude', 'argo.json')
    argoJson.design['.'].walkers = {
      storiesGlob: '../../stories/*.stories.js',
      storybookTestPackage: null,
    }
    writeJson(emitted, ['.claude', 'argo.json'], argoJson)
    // Overwrite the committed fixture shims with freshly emitted ones.
    const res = runArgo(emitted, ['design', 'emit-shims'])
    expect(res.status, res.stderr).toBe(0)
  })
  afterAll(() => rmSync(emitted, { recursive: true, force: true }))

  it.each(['spec-diff', 'vrt'])('%s project collects > 0 tests from emitted shims', (project) => {
    const { res, tests } = listProject(project, emitted)
    expect(res.status, res.stderr).toBe(0)
    expect(tests.length).toBeGreaterThan(0)
  })
})
