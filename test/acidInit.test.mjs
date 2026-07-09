import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import {
  FIXTURES,
  materializeFixture,
  linkKit,
  runArgo,
  readJson,
  existsSync,
  join,
} from './acidHelpers.mjs'

/**
 * Acid test, init half (Slice 6, amended): `argo init` against BOTH fixture
 * modes, through the REAL CLI binary and the bun-link-shaped node_modules —
 * dep line, settings.json, argo.json shape per mode, user-block preservation,
 * and the link actually resolving (bin + argo-hook dispatch).
 */

let dirs = []
const scratch = (fixture) => {
  const dir = materializeFixture(fixture)
  dirs.push(dir)
  return dir
}

beforeEach(() => { dirs = [] })
afterEach(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }) })

describe('acid: argo init — monorepo fixture', () => {
  it('places the link: dep at the workspace root, seeds per-app argo.json preserving the fixture design block', () => {
    const host = scratch(FIXTURES.monorepo)
    const res = runArgo(host, ['init'])
    expect(res.status).toBe(0)

    expect(readJson(host, 'package.json').dependencies['@argohq/toolkit']).toBe('link:@argohq/toolkit')
    expect(readJson(host, 'apps/a/package.json').dependencies).toBeUndefined()

    const argoJson = readJson(host, '.argo', 'config.json')
    // fixture ships apps/a CONFIGURED (setup-design already ran there) — preserved verbatim
    expect(argoJson.design['apps/a']).toEqual({ root: 'apps/a', componentsPath: 'src/components' })
    // apps/b discovered and seeded INERT
    expect(argoJson.design['apps/b']).toEqual({})

    expect(readJson(host, '.claude', 'settings.json').enabledPlugins['argo@argo']).toBe(true)
  })

  it('the linked kit resolves: node_modules bin + argo-hook dispatch fire from the fixture', () => {
    const host = scratch(FIXTURES.monorepo)
    runArgo(host, ['init'])
    linkKit(host)
    expect(existsSync(join(host, 'node_modules', '@argohq', 'toolkit', 'bin', 'argo.js'))).toBe(true)
    expect(existsSync(join(host, 'node_modules', '.bin', 'argo'))).toBe(true)
  })
})

describe('acid: argo init — single-repo fixture', () => {
  it('places the link: dep in the single package.json and keeps the "." design block', () => {
    const host = scratch(FIXTURES.singleRepo)
    const res = runArgo(host, ['init'])
    expect(res.status).toBe(0)
    expect(readJson(host, 'package.json').dependencies['@argohq/toolkit']).toBe('link:@argohq/toolkit')
    const argoJson = readJson(host, '.argo', 'config.json')
    expect(Object.keys(argoJson.design)).toEqual(['.'])
    expect(argoJson.design['.']).toEqual({ root: '.', componentsPath: 'src/components' })
  })

  it('is idempotent: a second init changes nothing', () => {
    const host = scratch(FIXTURES.singleRepo)
    runArgo(host, ['init'])
    const before = { pkg: readJson(host, 'package.json'), argo: readJson(host, '.argo', 'config.json') }
    const res = runArgo(host, ['init'])
    expect(res.status).toBe(0)
    expect(readJson(host, 'package.json')).toEqual(before.pkg)
    expect(readJson(host, '.argo', 'config.json')).toEqual(before.argo)
  })
})
