import { describe, it, expect } from 'vitest'
import { recordSpecDiffReceipt, walkerEvidencePresent } from './record-spec-diff-receipt.js'

describe('recordSpecDiffReceipt', () => {
  it('returns a receipt shape with the exit code and timestamp', () => {
    const receipt = recordSpecDiffReceipt(0, { now: 456 })
    expect(receipt).toEqual({ recordedAt: 456, exitCode: 0 })
  })
})

// The gate only ever trusted the caller-supplied command's exit code — a
// command that exits 0 without ever invoking runSpecDiffWalker (e.g. `true`,
// or a typo'd test path that collects zero files) minted an identical
// passing receipt. The walker's own describe blocks are titled
// `spec-diff: <storyFile>` (walkers/spec-diff.ts); requiring that signature
// in the command's captured output proves the walker actually ran.
describe('walkerEvidencePresent', () => {
  it('is false when the output carries no spec-diff walker signature', () => {
    expect(walkerEvidencePresent('Test Files 0 passed\n')).toBe(false)
  })

  it('is true when the output includes the walker\'s own describe-block signature', () => {
    expect(walkerEvidencePresent('spec-diff: Button.stories.tsx\n  ✓ Default (light) matches the committed spec\n')).toBe(true)
  })
})
