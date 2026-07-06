import { describe, it, expect } from 'vitest'
import { runKitPatchesConformance } from './tier0-walker.js'

// runRecipeTier0Checks reads figma.variables.* and can't be unit-tested
// outside Figma's sandbox (documented accepted gap, mirrors the mechanism's
// own auditNode) — runKitPatchesConformance has no figma dependency, so it's
// the pure plumbing seam this file covers.
describe('runKitPatchesConformance (pure plumbing seam, no figma dependency)', () => {
  it('flags a modified kit-copy node not recorded in kit-patches.json, tagged severity hard', () => {
    const modifiedNodes = [{ component: 'Button', file: 'button.tsx' }]
    expect(runKitPatchesConformance(modifiedNodes, {})).toEqual([
      {
        severity: 'hard',
        rule: 'kit-patches-conformance',
        detail: 'edit to kit copy "Button"/"button.tsx" is not recorded in kit-patches.json'
      }
    ])
  })

  it('passes a modified node recorded in kit-patches.json', () => {
    const modifiedNodes = [{ component: 'Button', file: 'button.tsx' }]
    expect(runKitPatchesConformance(modifiedNodes, { Button: ['button.tsx'] })).toEqual([])
  })

  it('defaults kitPatches to {} when omitted', () => {
    expect(runKitPatchesConformance([{ component: 'Button', file: 'button.tsx' }])).toHaveLength(1)
  })
})
