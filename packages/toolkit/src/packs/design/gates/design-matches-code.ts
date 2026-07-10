/**
 * `design-matches-code` gate — diffs a freshly rendered screenshot against
 * Figma's reference colors (OKLCH). Captures its own screenshot via an
 * injected `captureScreenshot` and never reads `input.artifacts.screenshot`:
 * a working agent's own output is not trustworthy evidence for a comparison gate.
 */
import { compareColor } from '../design-kit/index.js'
import type { Finding, Gate, GateInput, GateVerdict } from '../../../core/index.js'

export interface FigmaRgba {
  r: number
  g: number
  b: number
  a?: number
}

/** What the gate's own capture step returns — a fresh render, never the working agent's. */
export interface CapturedRender {
  /** URI of the screenshot this check captured itself (for evidence only). */
  uri: string
  /** Sampled colors from the fresh render, keyed by the same element names as `figmaColors`. */
  colors: Record<string, FigmaRgba>
}

/** The screenshot-capture capability, injected (fake in tests; production wires a real fresh-render capture). Takes no artifact input — it is not handed anything the working agent produced. */
export type CaptureScreenshotFn = () => Promise<CapturedRender>

export interface DesignMatchesCodeOptions {
  captureScreenshot: CaptureScreenshotFn
  epsilon?: number
}

export function createDesignMatchesCodeGate(options: DesignMatchesCodeOptions): Gate {
  const { captureScreenshot, epsilon } = options

  return {
    name: 'design-matches-code',

    async check(input: GateInput): Promise<GateVerdict> {
      // Own capture, deliberately ignores input.artifacts (a working agent's output is not trustworthy evidence here).
      const captured = await captureScreenshot()

      const figmaColors = (input.settings.figmaColors ?? {}) as Record<string, string>

      const findings: Finding[] = []
      for (const [name, cssColor] of Object.entries(figmaColors)) {
        const rendered = captured.colors[name]
        if (!rendered) {
          findings.push({ message: `${name}: no rendered color captured for this element`, detail: { name, cssColor } })
          continue
        }
        const result = compareColor(rendered, cssColor, epsilon === undefined ? {} : { epsilon })
        if (!result.pass) {
          findings.push({
            message: `${name}: color diff Δ${result.maxDelta} exceeds ε${result.epsilon} (expected ${cssColor})`,
            detail: { name, cssColor, ...result }
          })
        }
      }

      return {
        passed: findings.length === 0,
        findings,
        evidence: [`captured-screenshot:${captured.uri}`]
      }
    }
  }
}
