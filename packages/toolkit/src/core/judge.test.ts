import { describe, expect, it } from 'vitest'
import { core, registerJudge } from './judge.js'

// Order matters: the unregistered-call case must run before anything in this
// file registers a judge, since the registry is a module-level singleton
// (bun's `vitest` compat shim run via `bun test` has no `vi.resetModules`).
describe('core.judge', () => {
  it('throws "no judge registered" when called before an adapter registers one', async () => {
    await expect(core.judge({ artifacts: {} })).rejects.toThrow('no judge registered')
  })

  it("forwards the request and returns the registered judge's verdict", async () => {
    const request = { artifacts: { screenshot: 'file:///tmp/shot.png' } }
    const verdict = { passed: true, findings: [], evidence: ['file:///tmp/shot.png'] }
    let received: unknown

    registerJudge(async (req) => {
      received = req
      return verdict
    })

    const result = await core.judge(request)

    expect(received).toEqual(request)
    expect(result).toBe(verdict)
  })
})
