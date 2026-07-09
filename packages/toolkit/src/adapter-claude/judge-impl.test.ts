import type { GateVerdict, JudgeRequest } from '../core/index.js'
import { core } from '../core/index.js'
import { describe, expect, it } from 'vitest'
import { createJudgeImpl, registerClaudeJudge } from './judge-impl.js'

describe('createJudgeImpl', () => {
  it('never passes a transcript-shaped field to the spawned session, only artifact URIs', async () => {
    let received: unknown
    const fakeVerdict: GateVerdict = { passed: true, findings: [], evidence: ['file:///tmp/shot.png'] }

    const judge = createJudgeImpl(async (request) => {
      received = request
      return fakeVerdict
    })

    // Simulate a caller that (incorrectly) widened the request with a
    // transcript-shaped field — createJudgeImpl must not forward it.
    const request = {
      artifacts: { screenshot: 'file:///tmp/shot.png' },
      transcript: ['some', 'working', 'session', 'messages']
    } as JudgeRequest & { transcript: string[] }

    await judge(request)

    expect(received).toEqual({ artifacts: { screenshot: 'file:///tmp/shot.png' } })
    expect(received).not.toHaveProperty('transcript')
  })

  it("round-trips the fake spawner's verdict through the returned function", async () => {
    const fakeVerdict: GateVerdict = {
      passed: false,
      findings: [{ message: 'brief mismatch' }],
      evidence: ['file:///tmp/shot.png'],
      rerunnable: true
    }
    const judge = createJudgeImpl(async () => fakeVerdict)

    const result = await judge({ artifacts: { screenshot: 'file:///tmp/shot.png' } })

    expect(result).toBe(fakeVerdict)
  })
})

describe('registerClaudeJudge', () => {
  it("registers the adapter's judge implementation so core.judge forwards to it, transcript-free", async () => {
    let received: unknown
    const fakeVerdict: GateVerdict = { passed: true, findings: [], evidence: [] }

    registerClaudeJudge(async (request) => {
      received = request
      return fakeVerdict
    })

    const result = await core.judge({ artifacts: { brief: 'file:///tmp/brief.md' } })

    expect(received).toEqual({ artifacts: { brief: 'file:///tmp/brief.md' } })
    expect(received).not.toHaveProperty('transcript')
    expect(result).toBe(fakeVerdict)
  })
})
