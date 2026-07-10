/**
 * Gate interface + registry. Gates judge finished artifacts at stage exit
 * only: `GateInput` deliberately has no transcript/self-report field, the
 * anti-reward-hack rule as a type.
 *
 * `GateContext` threads `ctx.judge(...)` into `Gate.check` as an optional
 * second param for AI-judging gates to obtain a judging session; existing
 * gates that ignore it are unaffected since it's optional.
 */
import type { JudgeFn } from './judge.js'

export interface Finding {
  message: string
  detail?: unknown
}

export interface GateInput {
  target: string
  artifacts: Record<string, string>
  settings: Record<string, unknown>
}

export interface GateVerdict {
  passed: boolean
  findings: Finding[]
  evidence: string[]
  /**
   * Whether this gate may safely be called again against discovered
   * artifacts to re-verify a boundary. Omitted/`true` is the default (most
   * gates read live external state and are safe to re-run). Set `false` for
   * a gate that cannot re-check without side effects or a live session it
   * can't recreate out-of-band.
   */
  rerunnable?: boolean
}

/**
 * Optional second argument to `Gate.check`. Deterministic gates ignore it;
 * AI-judging gates call `ctx.judge(...)` instead of importing an adapter
 * directly, so packs stay adapter-agnostic.
 */
export interface GateContext {
  judge: JudgeFn
}

export interface Gate {
  name: string
  check(input: GateInput, ctx?: GateContext): Promise<GateVerdict>
}

const gates = new Map<string, Gate>()

/** Throws if a gate with the same `name` is already registered. */
export function registerGate(gate: Gate): void {
  if (gates.has(gate.name)) {
    throw new Error(`Gate "${gate.name}" is already registered`)
  }
  gates.set(gate.name, gate)
}

export function getGate(name: string): Gate | undefined {
  return gates.get(name)
}
