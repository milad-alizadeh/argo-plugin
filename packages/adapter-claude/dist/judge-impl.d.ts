import { type GateVerdict, type JudgeRequest } from '@argohq/core';
/**
 * The adapter's `core.judge` implementation (audit 1.4 / design doc's
 * "session spawn (fresh/warm/retry), `core.judge` implementation" seam).
 *
 * Spawns a FRESH, blind session fed only the spec's artifact URIs — never a
 * working transcript. The spawn mechanism itself (the real Claude Code
 * session API) is injected as a `SessionSpawner` so this module stays
 * testable without a live session, and so `session.ts` (Slice 7's FRESH/WARM/
 * RETRY spawn functions) can later supply the real implementation without
 * this module changing shape.
 */
/**
 * What actually gets sent to the spawned session. Deliberately has no
 * transcript-shaped field — mirrors `JudgeRequest`'s own shape at the type
 * level, so a caller cannot widen this without editing this module.
 */
export interface SessionSpawnRequest {
    artifacts: Record<string, string>;
}
export type SessionSpawner = (request: SessionSpawnRequest) => Promise<GateVerdict>;
/** Builds a `core.judge`-shaped function around an injected session spawner.
 * Exported standalone (not just via `registerClaudeJudge`) so tests can
 * exercise the request-shaping logic without touching the module-level
 * judge registry singleton. */
export declare function createJudgeImpl(spawnSession: SessionSpawner): (request: JudgeRequest) => Promise<GateVerdict>;
/** Registers the Claude-adapter's `core.judge` implementation at adapter
 * startup, per the design doc's "adapter registers an implementation at
 * startup" seam. */
export declare function registerClaudeJudge(spawnSession: SessionSpawner): void;
//# sourceMappingURL=judge-impl.d.ts.map