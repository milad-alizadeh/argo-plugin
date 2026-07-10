import { z } from 'zod'

/**
 * Stage-spec vocabulary. Stages are a flat list, no branch field: runtime
 * forks resolve inside a stage's skill, never as spec branching.
 */
export const SessionModeSchema = z.enum(['fresh', 'warm'])

export const StageSpecSchema = z.object({
  /** Stage name, referenced by later stages' `requires` and by `history`/`attempts` state. */
  name: z.string().min(1),
  /** Names of prior stages (or cross-playbook outputs) this stage's session is fed. */
  requires: z.array(z.string()).optional(),
  /** Artifact paths/URIs this stage is expected to produce (checked by `adopt`, audit 2.1). */
  produces: z.array(z.string()).optional(),
  /** Action kinds permitted while this stage is active — an open,
   * pack-extensible vocabulary of plain strings; core does string-equality
   * membership only, never enumerates domain kinds itself. */
  allows: z.array(z.string()).min(1),
  /** Name of a stateful in-flight policy (e.g. `test-first`), enforced by the adapter. */
  policy: z.string().optional(),
  /** Name of a registered `Gate` run at this stage's exit. */
  gate: z.string().optional(),
  /** Name of the craft skill the working session is given. */
  skill: z.string().optional(),
  /** FRESH (new session, `requires` artifacts only) or WARM (one session across repeat units). */
  session: SessionModeSchema.optional(),
  /** Budgeted gate-failure retries (RETRY: fresh session fed the verdict + `attempts[]`). */
  retries: z.number().int().nonnegative().optional(),
  /** Name of the repeated unit this stage's WARM session iterates over (e.g. "section"). */
  repeat: z.string().optional(),
  /** Budgeted in-session fix rounds (findings injected into the same WARM session). */
  maxRounds: z.number().int().positive().optional(),
  /** Name of the pack a playbook's terminal stage hands its output off to.
   * Only meaningful on the last stage of a spec; `playbook-start` reads it
   * off `stages.at(-1)` and refuses a disabled required pack at start,
   * never mid-run. */
  handsOffToPack: z.string().optional()
})

export const PlaybookSpecSchema = z.object({
  name: z.string().min(1),
  /** Authored pretty name for UI surfaces (slugs only in CLI text). Optional:
   * `argo playbook list` derives a sentence-cased fallback from `name`. */
  displayName: z.string().min(1).optional(),
  stages: z.array(StageSpecSchema).min(1)
})

export type SessionMode = z.infer<typeof SessionModeSchema>
export type StageSpec = z.infer<typeof StageSpecSchema>
export type PlaybookSpec = z.infer<typeof PlaybookSpecSchema>

/**
 * Validates a playbook spec against the stage vocabulary shape and returns it
 * unchanged — specs are pure data (no runtime mutation, no defaults injected).
 * Throws a zod error synchronously on an invalid shape, failing closed for
 * malformed specs.
 */
export function definePlaybook<T extends PlaybookSpec>(spec: T): T {
  PlaybookSpecSchema.parse(spec)
  return spec
}

/**
 * Spec registry: packs call `registerPlaybook(definePlaybook({ ... }))` at
 * import time so a spec can be resolved by name without importing any pack
 * directly.
 */
const playbooks = new Map<string, PlaybookSpec>()

/**
 * Pack attribution, recorded at registration time: a pack tells core "this
 * spec is mine" by passing its name to `registerPlaybook`, rather than core
 * or a caller reaching back into the pack to identify it.
 */
const playbookPacks = new Map<string, string>()

/** Throws if a playbook with the same `name` is already registered. */
export function registerPlaybook(spec: PlaybookSpec, pack?: string): void {
  if (playbooks.has(spec.name)) {
    throw new Error(`Playbook "${spec.name}" is already registered`)
  }
  playbooks.set(spec.name, spec)
  playbookPacks.set(spec.name, pack ?? 'unknown')
}

export function getPlaybook(name: string): PlaybookSpec | undefined {
  return playbooks.get(name)
}

/** The pack that registered `name`, or `"unknown"` if none did (or it was never registered). */
export function getPlaybookPack(name: string): string {
  return playbookPacks.get(name) ?? 'unknown'
}

/**
 * Every registered spec, in registration order. Returns the live spec
 * objects (specs are pure, immutable-by-convention data); callers must not
 * mutate them.
 */
export function listPlaybooks(): PlaybookSpec[] {
  return [...playbooks.values()]
}
