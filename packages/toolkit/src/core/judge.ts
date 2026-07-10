import type { GateVerdict } from './gate.js'

/**
 * `core.judge` seam: the one narrow capability AI-judging gates use to
 * obtain a judging session, registered by the active adapter at startup so
 * packs never import an adapter directly.
 *
 * `JudgeRequest` deliberately has no transcript field, dispatch accepts only
 * the spec's artifact URIs, encoding the anti-reward-hack blindness rule at
 * the type level: a caller cannot widen this shape to include a working
 * transcript without editing this module.
 */
export interface JudgeRequest {
  artifacts: Record<string, string>
}

export type JudgeFn = (request: JudgeRequest) => Promise<GateVerdict>

let activeJudge: JudgeFn | undefined

/** Called by the active adapter at startup to install its judging session implementation. */
export function registerJudge(fn: JudgeFn): void {
  activeJudge = fn
}

/** Test seam: clears the module-level singleton so the unregistered-call
 * behaviour is testable regardless of which test file ran first (`bun test`
 * shares one module registry across files with no reset-modules facility). */
export function resetJudgeForTests(): void {
  activeJudge = undefined
}

export const core = {
  /** Throws "no judge registered" if called before an adapter has registered one. */
  async judge(request: JudgeRequest): Promise<GateVerdict> {
    if (!activeJudge) {
      throw new Error('no judge registered')
    }
    return activeJudge(request)
  }
}

/**
 * The "ask" vs. "finished" artifact-key contract: a judge-backed review gate
 * compares a finished deliverable against the brief/spec it was asked to
 * satisfy. Kept in core, not a pack, so pack-owned playbook specs can
 * populate `produces`/`--artifacts` under these exact key names without a
 * downstream agent guessing at naming.
 */
export const REVIEW_ARTIFACT_KEYS = {
  /** The brief/spec artifact the finished deliverable is judged against. */
  ask: 'brief',
  /** The finished deliverable being judged — a screenshot path or Figma node id/URI. */
  finished: 'screenshot'
} as const
