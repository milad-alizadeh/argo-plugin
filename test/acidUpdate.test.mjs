import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync, readFileSync } from 'node:fs'
import { FIXTURES, materializeFixture, runArgo, readJson, writeJson, join } from './acidHelpers.mjs'

/**
 * Acid test, update half (Slice 6, amended): `argo update` against BOTH
 * already-initialized fixtures — the version-less link: dep line is untouched,
 * user-set argo.json fields survive, and dropped skeleton defaults are
 * re-emitted (reported via addedKeys). No migration step exists to exercise.
 */

let dirs = []
const scratch = (fixture) => {
  const dir = materializeFixture(fixture)
  dirs.push(dir)
  runArgo(dir, ['init'])
  return dir
}

beforeEach(() => { dirs = [] })
afterEach(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }) })

for (const [mode, fixture] of [['monorepo', FIXTURES.monorepo], ['single-repo', FIXTURES.singleRepo]]) {
  describe(`acid: argo update — ${mode}`, () => {
    it('keeps the link: dep untouched and preserves user-set fields while re-emitting skeleton defaults', () => {
      const host = scratch(fixture)
      const pkgBefore = readFileSync(join(host, 'package.json'), 'utf8')

      const argoJson = readJson(host, '.claude', 'argo.json')
      argoJson.customField = 'user-owned'
      delete argoJson.landing // simulate a skeleton default a user deleted / an older skeleton lacked
      writeJson(host, ['.claude', 'argo.json'], argoJson)

      const res = runArgo(host, ['update'])
      expect(res.status).toBe(0)
      expect(JSON.parse(res.stdout).addedKeys).toContain('landing')

      expect(readFileSync(join(host, 'package.json'), 'utf8')).toBe(pkgBefore)
      const after = readJson(host, '.claude', 'argo.json')
      expect(after.customField).toBe('user-owned')
      expect(after.landing).toBe('pr')
      expect(after.design).toEqual(argoJson.design) // design blocks untouched
    })

    it('fails loud on a never-initialized copy', () => {
      const host = materializeFixture(fixture)
      dirs.push(host)
      rmSync(join(host, '.claude'), { recursive: true, force: true }) // fixture ships argo.json; strip to simulate pre-init
      const res = runArgo(host, ['update'])
      expect(res.status).not.toBe(0)
      expect(res.stderr).toMatch(/argo init/)
    })
  })
}
