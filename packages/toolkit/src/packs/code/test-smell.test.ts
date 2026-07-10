import { describe, it, expect } from 'vitest'
import { detectBridgeAssertion, detectVacuousAssertion, detectSelfMock } from './test-smell'

describe('detectBridgeAssertion', () => {
  it('flags an assertion on window.api', () => {
    expect(detectBridgeAssertion('expect(await window.api.getThing()).toBe(1)')).toBe(true)
  })

  it('does not flag an assertion on the rendered DOM', () => {
    expect(detectBridgeAssertion('expect(screen.getByText("hi")).toBeVisible()')).toBe(false)
  })
})

describe('detectVacuousAssertion', () => {
  it('flags expect(true).toBe(true)', () => {
    expect(detectVacuousAssertion('expect(true).toBe(true)')).toBe(true)
  })

  it('does not flag a meaningful assertion', () => {
    expect(detectVacuousAssertion('expect(result).toBe(5)')).toBe(false)
  })
})

describe('detectSelfMock', () => {
  it('flags mocking the module under test', () => {
    expect(detectSelfMock("vi.mock('./widget')", 'widget')).toBe('./widget')
  })

  it('does not flag mocking a different module', () => {
    expect(detectSelfMock("vi.mock('./other')", 'widget')).toBeUndefined()
  })
})
