import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DESIGN_VERBS, PLAYBOOK_VERBS } from './design-verbs.js'

/**
 * End-to-end drift guard: every verb in `bin/argo.js`'s real dispatch tables
 * must resolve to a real module under `dist/`. Spawns the real `bin/argo.js`
 * (dist-dispatching) per verb with an invocation missing required
 * input — the assertion is that the failure is a controlled usage error, not
 * `MODULE_NOT_FOUND` (a typo'd/stale relative path) or an "unknown verb"
 * dispatch miss (a verb dropped from the table without dropping its case, or
 * vice versa). Imports `DESIGN_VERBS`/`PLAYBOOK_VERBS` from the same module
 * `argo.js` dispatches from, so this test can't silently drift from the real
 * table. Requires `bun run build` first, same convention as the other
 * `bin/*.test.ts` files.
 */
const ARGO_BIN = fileURLToPath(new URL('./argo.js', import.meta.url))

function assertControlledFailure(result: ReturnType<typeof spawnSync>) {
  expect(result.stderr).not.toMatch(/MODULE_NOT_FOUND/)
  expect(result.stderr).not.toMatch(/unknown verb/)
  expect(result.error).toBeUndefined()
}

describe('argo design <verb> — dispatch table resolves for every registered verb', () => {
  it.each(Object.keys(DESIGN_VERBS))('%s', (verb) => {
    const result = spawnSync(process.execPath, [ARGO_BIN, 'design', verb], { encoding: 'utf8' })
    assertControlledFailure(result)
  })
})

describe('argo playbook <verb> — dispatch table resolves for every registered verb', () => {
  it.each(PLAYBOOK_VERBS)('%s', (verb) => {
    const result = spawnSync(process.execPath, [ARGO_BIN, 'playbook', verb], { encoding: 'utf8' })
    assertControlledFailure(result)
  })
})
