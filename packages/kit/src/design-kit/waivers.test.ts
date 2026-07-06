import { describe, it, expect } from 'vitest'
import { checkWaiver, invalidateWaivers } from './waivers.js'

const baseWaiver = {
  component: 'Button',
  variant: 'primary',
  property: 'borderRadius',
  figmaValue: 8,
  codeValue: 9,
  sourceVersion: 'v12',
  reason: 'known kit drift, tracked in issue #42',
  date: '2026-07-04'
}

describe('checkWaiver', () => {
  it('passes when observed values still match the pinned pair', () => {
    const result = checkWaiver(baseWaiver, 8, 9)
    expect(result.pass).toBe(true)
  })

  it('re-fails when the observed Figma value departs the pinned pair', () => {
    const result = checkWaiver(baseWaiver, 10, 9)
    expect(result.pass).toBe(false)
  })

  it('re-fails when the observed code value departs the pinned pair', () => {
    const result = checkWaiver(baseWaiver, 8, 12)
    expect(result.pass).toBe(false)
  })
})

describe('invalidateWaivers', () => {
  const otherWaiver = { ...baseWaiver, component: 'Card', sourceVersion: 'v11' }

  it('keeps waivers whose sourceVersion matches the current one', () => {
    const { valid, invalidated } = invalidateWaivers([baseWaiver], 'v12')
    expect(valid).toEqual([baseWaiver])
    expect(invalidated).toEqual([])
  })

  it('invalidates waivers whose sourceVersion no longer matches', () => {
    const { valid, invalidated } = invalidateWaivers([baseWaiver, otherWaiver], 'v12')
    expect(valid).toEqual([baseWaiver])
    expect(invalidated).toEqual([otherWaiver])
  })

  // kit-awareness coexistence: a kit-shadow waiver has no sourceVersion field
  // (it isn't about design-source drift), so it must never be invalidated by
  // this sourceVersion check — the tier-0 D15/D23 waiver shape and the
  // kit-awareness waiver shape coexist in the same design/waivers.json array.
  it('never invalidates a kit-shadow waiver — it has no sourceVersion to compare', () => {
    const kitShadowWaiver = { type: 'kit-shadow', component: 'Collapsible', kitCandidate: 'Collapsible', reason: 'needs a custom trigger icon' }
    const { valid, invalidated } = invalidateWaivers([baseWaiver, kitShadowWaiver], 'v99')
    expect(valid).toEqual([kitShadowWaiver])
    expect(invalidated).toEqual([baseWaiver])
  })
})
