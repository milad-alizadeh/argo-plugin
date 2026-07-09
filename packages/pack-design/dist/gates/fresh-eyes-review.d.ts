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
import type { Gate } from '@argohq/core';
export declare function createFreshEyesReviewGate(): Gate;
//# sourceMappingURL=fresh-eyes-review.d.ts.map