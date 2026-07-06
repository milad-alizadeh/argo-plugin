import { describe, it, expect } from 'vitest'
import { recordSpecDiffReceipt } from '../packages/kit/src/skill-scripts/record-spec-diff-receipt.js'

describe('recordSpecDiffReceipt', () => {
  it('returns a receipt shape with the exit code and timestamp', () => {
    const receipt = recordSpecDiffReceipt(0, { now: 456 })
    expect(receipt).toEqual({ recordedAt: 456, exitCode: 0 })
  })
})
