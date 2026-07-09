import { describe, expect, it } from 'vitest'
import { core, registerJudge, resetJudgeForTests } from './judge.js'

describe('core.judge', () => {
  it('throws "no judge registered" when called before an adapter registers one', async () => {
    // the registry is a module-level singleton shared across test FILES under
    // `bun test` — reset explicitly rather than depending on file order
    resetJudgeForTests()
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
