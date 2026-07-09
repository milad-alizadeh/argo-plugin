import { z } from 'zod'

/**
 * Stage-spec vocabulary, per `.claude/design/playbook-engine.md`'s "The
 * stage spec (core)" section: `requires / produces / allows / policy / gate /
 * skill / session / retries / repeat / maxRounds`. Stages are a flat list —
 * no branch field (audit 1.5: runtime forks resolve inside a stage's skill,
 * never as spec branching).
 */
export const SessionModeSchema = z.enum(['fresh', 'warm'])

export const StageSpecSchema = z.object({
  /** Stage name, referenced by later stages' `requires` and by `history`/`attempts` state. */
  name: z.string().min(1),
  /** Names of prior stages (or cross-playbook outputs) this stage's session is fed. */
  requires: z.array(z.string()).optional(),
  /** Artifact paths/URIs this stage is expected to produce (checked by `adopt`, audit 2.1). */
  produces: z.array(z.string()).optional(),
  /**
   * Action kinds permitted while this stage is active — an open, pack-extensible
   * vocabulary of plain strings (accepted-risk 3.1: core does string-equality
   * membership only, never enumerates domain kinds itself).
   */
  allows: z.array(z.string()).min(1),
  /** Name of a stateful in-flight policy (e.g. `test-first`), enforced by the adapter. */
  policy: z.string().optional(),
  /** Name of a registered `Gate` (see gate.ts) run at this stage's exit. */
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
  /**
   * Name of the pack a playbook's TERMINAL stage hands its output off to (e.g.
   * `design-to-code`'s build stage handing off to pack-code's
   * `screen-implement`) — audit 2.4's cross-pack refusal. Only meaningful on
   * the last stage of a spec; `playbook-start` reads it off `stages.at(-1)`
   * and calls `assertPackAvailable` before writing the initial instance, so a
   * disabled required pack is refused at start, never mid-run.
   */
  handsOffToPack: z.string().optional()
})

export const PlaybookSpecSchema = z.object({
  name: z.string().min(1),
  stages: z.array(StageSpecSchema).min(1)
})

export type SessionMode = z.infer<typeof SessionModeSchema>
export type StageSpec = z.infer<typeof StageSpecSchema>
export type PlaybookSpec = z.infer<typeof PlaybookSpecSchema>

/**
 * Validates a playbook spec against the stage vocabulary shape and returns it
 * unchanged — specs are pure data (no runtime mutation, no defaults injected).
 * Throws a zod error synchronously on an invalid shape (missing/malformed
 * required field), per the design doc's "fails closed at `argo playbook
 * start`" rule for malformed specs.
 */
export function definePlaybook<T extends PlaybookSpec>(spec: T): T {
  PlaybookSpecSchema.parse(spec)
  return spec
}

/**
 * Spec registry, mirroring `gate.ts`'s `registerGate`/`getGate` Map-based
 * pattern: packs call `registerPlaybook(definePlaybook({ ... }))` at import
 * time so `playbook-start` (Slice 5) can resolve a spec by name without
 * importing any pack directly.
 */
const playbooks = new Map<string, PlaybookSpec>()

/** Throws if a playbook with the same `name` is already registered. */
export function registerPlaybook(spec: PlaybookSpec): void {
  if (playbooks.has(spec.name)) {
    throw new Error(`Playbook "${spec.name}" is already registered`)
  }
  playbooks.set(spec.name, spec)
}

export function getPlaybook(name: string): PlaybookSpec | undefined {
  return playbooks.get(name)
}
