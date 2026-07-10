/**
 * `fresh-eyes-review` gate — compares the finished artifact against the brief
 * via a blind AI judge, through core's `judge` seam only (never imports the
 * adapter package directly, so this pack stays adapter-agnostic).
 */
import type { Gate, GateContext, GateInput, GateVerdict } from '../../../core/index.js'

export function createFreshEyesReviewGate(): Gate {
  return {
    name: 'fresh-eyes-review',

    async check(input: GateInput, ctx?: GateContext): Promise<GateVerdict> {
      if (!ctx?.judge) {
        throw new Error('fresh-eyes-review: no judge available on GateContext')
      }

      // Forward only artifact URIs, never a transcript, even if input is widened later.
      const verdict = await ctx.judge({ artifacts: input.artifacts })

      return {
        passed: verdict.passed,
        findings: verdict.findings,
        evidence: verdict.evidence,
        rerunnable: verdict.rerunnable
      }
    }
  }
}
