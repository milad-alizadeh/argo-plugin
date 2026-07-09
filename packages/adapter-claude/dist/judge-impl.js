import { registerJudge } from '@argohq/core';
/** Builds a `core.judge`-shaped function around an injected session spawner.
 * Exported standalone (not just via `registerClaudeJudge`) so tests can
 * exercise the request-shaping logic without touching the module-level
 * judge registry singleton. */
export function createJudgeImpl(spawnSession) {
    return async (request) => {
        // Forward ONLY `artifacts` — even if a future caller widens JudgeRequest
        // and accidentally attaches extra fields, this explicit pick keeps the
        // spawned session blind.
        return spawnSession({ artifacts: request.artifacts });
    };
}
/** Registers the Claude-adapter's `core.judge` implementation at adapter
 * startup, per the design doc's "adapter registers an implementation at
 * startup" seam. */
export function registerClaudeJudge(spawnSession) {
    registerJudge(createJudgeImpl(spawnSession));
}
//# sourceMappingURL=judge-impl.js.map