/**
 * `fresh-eyes-review` gate — compares the finished artifact against the
 * brief via a blind AI judge (workflow-engine-phase1.md Slice 9, step 26 /
 * audit 1.4). Calls `ctx.judge(...)` — the `core.judge` seam
 * (`packages/core/src/judge.ts`) — and never imports `@argohq/adapter-claude`
 * directly, so this pack stays adapter-agnostic.
 *
 * `maxRounds`/`retries` handling stays in core's `workflow-advance`; this
 * gate only returns pass/fail + findings for one round.
 */
import type { Gate, GateContext, GateInput, GateVerdict } from '@argohq/core'

export function createFreshEyesReviewGate(): Gate {
  return {
    name: 'fresh-eyes-review',

    async check(input: GateInput, ctx?: GateContext): Promise<GateVerdict> {
      if (!ctx?.judge) {
        throw new Error('fresh-eyes-review: no judge available on GateContext')
      }

      // Forward ONLY the artifact URIs the judge needs (brief + finished
      // artifact) — never a transcript field. `JudgeRequest`'s own type has
      // no transcript field, so this is also enforced at the type level one
      // layer up; picking explicitly here keeps this call site honest even
      // if `input` is ever widened.
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
