import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { FIXTURES, materializeFixture, linkKit, join } from './acidHelpers.mjs'

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

function listProject(project) {
  const res = spawnSync(VITEST_BIN, ['list', '--project', project, '--config', join(host, 'vitest.walkers.config.mjs'), '--root', host], {
    cwd: host,
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
