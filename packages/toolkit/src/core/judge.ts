import type { GateVerdict } from './gate.js'

/**
 * `core.judge` seam (audit 1.4): the one narrow capability AI-judging gates
 * (`fresh-eyes-review`, `code-matches-design`, `code-review`) use to obtain a
 * judging session, registered by the active adapter at startup so packs never
 * import an adapter directly.
 *
 * `JudgeRequest` deliberately has no transcript field — dispatch accepts only
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
 * shares one module registry across files and has no `vi.resetModules`). */
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
 * The "ask" vs. "finished" artifact-key contract (item 3): a judge-backed
 * review gate compares a finished deliverable against the brief/spec it was
 * asked to satisfy. `REVIEW_ARTIFACT_KEYS.ask` names the `JudgeRequest.artifacts`
 * key holding the brief/spec reference (a markdown path); `.finished` names
 * the key holding the finished deliverable reference (a screenshot path or a
 * Figma node id/URI). Kept here (core, not a pack) so a skill-content playbook
 * spec (owned elsewhere, e.g. packs/design/playbooks) can populate
 * `produces`/`--artifacts` under these exact key names without this file's
 * owner touching pack-owned files, and without a downstream agent guessing at
 * naming. `brief-check`'s own default `artifactKey` ('brief') matches
 * `REVIEW_ARTIFACT_KEYS.ask` by convention — keep them in sync if either
 * changes.
 */
export const REVIEW_ARTIFACT_KEYS = {
  /** The brief/spec artifact the finished deliverable is judged against. */
  ask: 'brief',
  /** The finished deliverable being judged — a screenshot path or Figma node id/URI. */
  finished: 'screenshot'
} as const
