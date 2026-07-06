#!/usr/bin/env node
/**
 * Design-guard stop gate (Stop + SubagentStop). Same UX as the trust gate
 * (exit 2 blocks, reason on stderr) but a DIFFERENT arming rule: this checks
 * whether Figma writes recorded by design-guard-record.js are newer than
 * the latest clean tier-0 audit receipt, and blocks the stop until the audit
 * gate is run.
 *
 * SELF-SCOPING: entirely inert unless a `design.<app>` block in
 * `.claude/argo.json` at the session's git toplevel carries a `recipe`
 * (the design-pack-installed marker) — NOT scoped to
 * `.argo/build-mode.json`. Unlike
 * red-proof/trust (gated-build-only, TDD-slice concerns), figma-to-code and
 * figma-create can legitimately run outside a gated build, and the
 * deterministic audit-receipt requirement must still be mandatory there. So
 * this hook arms in every session type a design pack is installed in.
 *
 * Once armed: no recorded writes at all → nothing owed, pass. Any recorded
 * write with no receipt, a receipt with violationCount > 0, or a receipt
 * whose writeCounterAtAudit is stale (writes happened after the last clean
 * audit) → BLOCK, telling the agent to run the audit gate.
 *
 * DEFERRAL (in-flight background work): `.argo/design-guard.json`'s
 * writeCount is repo-global, not session-scoped — a designer fan-out
 * (Task-tool subagent) still running writes to the same counter the parent
 * session's Stop hook reads. Without this, the parent could never end a
 * turn cleanly while that fan-out is mid-flight: any receipt it audits goes
 * stale the instant the subagent writes again. The Stop/SubagentStop hook
 * payload carries `background_tasks` (running/pending + backgrounded work
 * registered on this session — see the Claude Code hooks schema); when
 * non-empty, this hook defers rather than blocks, since the session is
 * about to pause for that work anyway, not actually end. Once nothing is
 * in flight, the next real Stop re-checks the receipt against the
 * up-to-date write counter — the gate is never actually bypassed, only
 * postponed past writes it isn't this hook's job to have caught yet.
 */
export {};
//# sourceMappingURL=design-guard-stop.d.ts.map