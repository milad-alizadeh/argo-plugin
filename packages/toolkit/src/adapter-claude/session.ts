import type { Attempt, GateVerdict } from '../core/index.js'

/**
 * FRESH/WARM/RETRY session spawn functions against an abstract "Claude Code
 * session API" (the real API doesn't exist yet, so callers inject a
 * `SessionApi`: a fake in tests, the real one once wired into a live host).
 *
 * The three modes:
 *  - FRESH: a brand-new session fed ONLY the stage's `requires` artifacts,
 *    the skill text, and a one-line frame. No other context.
 *  - WARM: the SAME session handle reused across repeat units (`repeat` in
 *    the stage spec); callers hold onto the returned handle and pass it back
 *    in as `warmHandle` for the next unit.
 *  - RETRY: a FRESH session (never the prior transcript) fed the gate
 *    verdict that failed plus `attempts[]` so far.
 */

export interface SessionHandle {
  id: string
}

/** Payload for a brand-new session — no field beyond these three is ever
 * sent, per FRESH's "only requires + skill + frame" rule. `requires` maps
 * artifact name -> content/URI, matching `StageSpec.requires`'s names. */
export interface FreshSpawnPayload {
  kind: 'fresh'
  requires: Record<string, string>
  skill: string
  frame: string
}

/** Payload for a retry spawn — a FRESH session (no transcript field exists
 * on this type, and none is ever added to it) fed the failing verdict and
 * the accumulated `attempts[]`. */
export interface RetrySpawnPayload {
  kind: 'retry'
  requires: Record<string, string>
  skill: string
  frame: string
  verdict: GateVerdict
  attempts: Attempt[]
}

export type SpawnPayload = FreshSpawnPayload | RetrySpawnPayload

/** Payload sent to an already-running WARM session for one more repeat
 * unit. */
export interface WarmUnitPayload {
  unit: string
  requires: Record<string, string>
}

/** Minimal abstraction over the real Claude Code session API. `spawn`
 * starts a brand-new session (used by both FRESH and RETRY, which differ
 * only in payload shape); `send` feeds one more unit to an already-running
 * session and returns the handle to keep using (usually the same handle,
 * but returned rather than assumed in case the real API rotates it). */
export interface SessionApi {
  spawn(payload: SpawnPayload): Promise<SessionHandle>
  send(handle: SessionHandle, payload: WarmUnitPayload): Promise<SessionHandle>
}

/** FRESH spawn: feeds only `requires` artifacts + skill text + a one-line
 * frame. Nothing else is ever included in the payload sent to `api.spawn`. */
export async function spawnFresh(
  api: SessionApi,
  params: { requires: Record<string, string>; skill: string; frame: string }
): Promise<SessionHandle> {
  return api.spawn({ kind: 'fresh', requires: params.requires, skill: params.skill, frame: params.frame })
}

/**
 * WARM spawn/reuse: reuse contract — `warmHandle` is `null` for the first
 * repeat unit (a FRESH session is spawned to seed it) and the previously
 * RETURNED handle from this same function for every subsequent unit. The
 * caller is responsible for holding onto and threading the returned handle
 * across calls; this function never stores state itself.
 */
export async function spawnWarm(
  api: SessionApi,
  warmHandle: SessionHandle | null,
  params: { unit: string; requires: Record<string, string>; skill: string; frame: string }
): Promise<SessionHandle> {
  if (warmHandle) {
    return api.send(warmHandle, { unit: params.unit, requires: params.requires })
  }
  return api.spawn({ kind: 'fresh', requires: params.requires, skill: params.skill, frame: params.frame })
}

/** RETRY spawn: ALWAYS a fresh session (never reuses a handle, never
 * touches transcript history) fed the gate verdict that failed plus
 * `attempts[]` so far, in addition to the same `requires`/`skill`/`frame`
 * FRESH gets. */
export async function spawnRetry(
  api: SessionApi,
  params: {
    requires: Record<string, string>
    skill: string
    frame: string
    verdict: GateVerdict
    attempts: Attempt[]
  }
): Promise<SessionHandle> {
  return api.spawn({
    kind: 'retry',
    requires: params.requires,
    skill: params.skill,
    frame: params.frame,
    verdict: params.verdict,
    attempts: params.attempts
  })
}
