import { describe, expect, it } from 'vitest'
import type { GateInput } from '@argohq/core'
import { createDesignMatchesCodeGate, type CapturedRender } from './design-matches-code.js'

describe('design-matches-code gate', () => {
  it("ignores a working-agent-supplied artifacts.screenshot and invokes the gate's own capture function instead", async () => {
    let captureCalls = 0
    const ownCapture: CapturedRender = {
      uri: 'file:///own-fresh-capture.png',
      colors: { bg: { r: 1, g: 1, b: 1 } } // white — matches the Figma reference below
    }

    const gate = createDesignMatchesCodeGate({
      captureScreenshot: async () => {
        captureCalls += 1
        return ownCapture
      }
    })

    const input: GateInput = {
      target: 'screen/Checkout',
      artifacts: { screenshot: 'file:///doctored-agent-screenshot.png' },
      settings: { figmaColors: { bg: '#ffffff' } }
    }

    const verdict = await gate.check(input)

    expect(captureCalls).toBe(1)
    expect(verdict.passed).toBe(true)
    expect(verdict.evidence).toContain(`captured-screenshot:${ownCapture.uri}`)
    expect(verdict.evidence.join(',')).not.toContain('doctored-agent-screenshot')
  })

  it("invokes the real comparator's OKLCH diff logic and reflects a mismatch in the verdict", async () => {
    const gate = createDesignMatchesCodeGate({
      captureScreenshot: async () => ({
        uri: 'file:///fresh.png',
        colors: { bg: { r: 0, g: 0, b: 0 } } // black — mismatches the Figma reference below
      })
    })

    const input: GateInput = {
      target: 'screen/Checkout',
      artifacts: {},
      settings: { figmaColors: { bg: '#ffffff' } } // white
    }

    const verdict = await gate.check(input)

    expect(verdict.passed).toBe(false)
    expect(verdict.findings).toHaveLength(1)
    expect(verdict.findings[0].message).toMatch(/color diff/)
    expect(verdict.findings[0].detail).toMatchObject({ maxDelta: 255 })
  })
})
