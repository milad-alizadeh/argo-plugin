import { describe, expect, it } from 'vitest'
import type { GateContext, GateInput, JudgeRequest, GateVerdict } from '../../../core/index.js'
import { createFreshEyesReviewGate } from './fresh-eyes-review.js'

const makeInput = (): GateInput => ({
  target: 'screen/Checkout',
  artifacts: { brief: 'file:///brief.md', screenshot: 'file:///finished.png' },
  settings: {}
})

describe('fresh-eyes-review gate', () => {
  it('never receives or forwards a transcript field to the judge call', async () => {
    let received: unknown
    const fakeJudge = async (request: JudgeRequest): Promise<GateVerdict> => {
      received = request
      return { passed: true, findings: [], evidence: [] }
    }
    const ctx: GateContext = { judge: fakeJudge }

    const gate = createFreshEyesReviewGate()
    const input = { ...makeInput(), transcript: 'I secretly widened GateInput' } as GateInput & { transcript: string }

    await gate.check(input, ctx)

    expect(received).toEqual({ artifacts: input.artifacts })
    expect(received).not.toHaveProperty('transcript')
  })

  it("propagates a failing judge verdict's findings into the returned GateVerdict", async () => {
    const failingVerdict: GateVerdict = {
      passed: false,
      findings: [{ message: 'copy does not match the brief tone' }],
      evidence: ['file:///finished.png']
    }
    const ctx: GateContext = { judge: async () => failingVerdict }

    const gate = createFreshEyesReviewGate()
    const verdict = await gate.check(makeInput(), ctx)

    expect(verdict.passed).toBe(false)
    expect(verdict.findings).toEqual(failingVerdict.findings)
  })

  it('throws when no judge is available on the context', async () => {
    const gate = createFreshEyesReviewGate()
    await expect(gate.check(makeInput())).rejects.toThrow(/no judge/)
  })
})
