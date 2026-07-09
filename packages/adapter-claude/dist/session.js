/** FRESH spawn: feeds only `requires` artifacts + skill text + a one-line
 * frame. Nothing else is ever included in the payload sent to `api.spawn`. */
export async function spawnFresh(api, params) {
    return api.spawn({ kind: 'fresh', requires: params.requires, skill: params.skill, frame: params.frame });
}
/**
 * WARM spawn/reuse: reuse contract — `warmHandle` is `null` for the first
 * repeat unit (a FRESH session is spawned to seed it) and the previously
 * RETURNED handle from this same function for every subsequent unit. The
 * caller is responsible for holding onto and threading the returned handle
 * across calls; this function never stores state itself.
 */
export async function spawnWarm(api, warmHandle, params) {
    if (warmHandle) {
        return api.send(warmHandle, { unit: params.unit, requires: params.requires });
    }
    return api.spawn({ kind: 'fresh', requires: params.requires, skill: params.skill, frame: params.frame });
}
/** RETRY spawn: ALWAYS a fresh session (never reuses a handle, never
 * touches transcript history) fed the gate verdict that failed plus
 * `attempts[]` so far, in addition to the same `requires`/`skill`/`frame`
 * FRESH gets. */
export async function spawnRetry(api, params) {
    return api.spawn({
        kind: 'retry',
        requires: params.requires,
        skill: params.skill,
        frame: params.frame,
        verdict: params.verdict,
        attempts: params.attempts
    });
}
//# sourceMappingURL=session.js.map