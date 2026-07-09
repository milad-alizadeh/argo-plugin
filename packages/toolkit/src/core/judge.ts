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
