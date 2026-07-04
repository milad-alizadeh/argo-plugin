import { describe, it, expect } from 'vitest'
import { checkWaiver, invalidateWaivers } from '../packages/figma-design-kit/waivers.js'

const baseWaiver = {
  component: 'Button',
  variant: 'primary',
  property: 'borderRadius',
  figmaValue: 8,
  codeValue: 9,
  kitLockVersion: 'v12',
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
  const otherWaiver = { ...baseWaiver, component: 'Card', kitLockVersion: 'v11' }

  it('keeps waivers whose kitLockVersion matches the current one', () => {
    const { valid, invalidated } = invalidateWaivers([baseWaiver], 'v12')
    expect(valid).toEqual([baseWaiver])
    expect(invalidated).toEqual([])
  })

  it('invalidates waivers whose kitLockVersion no longer matches', () => {
    const { valid, invalidated } = invalidateWaivers([baseWaiver, otherWaiver], 'v12')
    expect(valid).toEqual([baseWaiver])
    expect(invalidated).toEqual([otherWaiver])
  })
})
