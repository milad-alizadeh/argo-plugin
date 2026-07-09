/**
 * Gate interface + registry, per `.claude/design/workflow-engine.md`'s
 * "Gates (core interface, pack implementations)" section. Gates judge
 * finished artifacts at stage exit only — `GateInput` deliberately has no
 * transcript/self-report field (the anti-reward-hack rule as a type).
 *
 * Seam for audit 1.4 (AI-judging gates obtaining a session via `core.judge`):
 * `judge.ts` defines that capability independently and `GateContext` below
 * threads `ctx.judge(...)` into `Gate.check` as an optional second param —
 * the signature-widening this file's previous revision predicted, wired now
 * that pack-design's AI-judging gates (Slice 9) need it. Existing gates that
 * ignore the second param are unaffected (it's optional).
 */
import type { JudgeFn } from './judge.js';
export interface Finding {
    message: string;
    detail?: unknown;
}
export interface GateInput {
    target: string;
    artifacts: Record<string, string>;
    settings: Record<string, unknown>;
}
export interface GateVerdict {
    passed: boolean;
    findings: Finding[];
    evidence: string[];
    /**
     * Whether `argo workflow adopt` (audit 2.1) may safely call this gate again
     * against discovered artifacts to re-verify a boundary. Omitted/`true` is
     * the default (most gates read live external state — Figma, the test
     * suite — and are safe to re-run). Set `false` for a gate that cannot
     * re-check without side effects or a live session it can't recreate
     * out-of-band; `adopt` then stops at that stage and records
     * `verified: false` in history instead of advancing past it.
     */
    rerunnable?: boolean;
}
/**
 * Optional second argument to `Gate.check` (audit 1.4's `ctx.judge(...)`
 * seam). Deterministic gates (`tests-pass`, `design-rules-check`,
 * `plan-check`) ignore it; AI-judging gates (`fresh-eyes-review`,
 * `code-matches-design`) call `ctx.judge(...)` instead of importing
 * `@argohq/adapter-claude` directly, so packs stay adapter-agnostic.
 */
export interface GateContext {
    judge: JudgeFn;
}
export interface Gate {
    name: string;
    check(input: GateInput, ctx?: GateContext): Promise<GateVerdict>;
}
/** Throws if a gate with the same `name` is already registered. */
export declare function registerGate(gate: Gate): void;
export declare function getGate(name: string): Gate | undefined;
//# sourceMappingURL=gate.d.ts.map