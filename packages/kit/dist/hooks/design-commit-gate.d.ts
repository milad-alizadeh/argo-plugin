#!/usr/bin/env node
/**
 * Design commit gate (PreToolUse on Bash, `git commit` only). Applies the
 * red-proof/trust gates' RECEIPT principle to figma-to-code's D22 acceptance
 * gates: a commit touching generated component code may only land with a
 * fresh, passing spec-diff receipt — never an LLM's narration that "the
 * walker passed".
 *
 * SELF-SCOPING, DIFFERENT FROM red-proof/trust: arms per-app from
 * `.claude/argo.json`'s `design.<app>` blocks (decision 8's dual-mode
 * resolution — the old `design/config.json`-presence arming silently
 * no-oped per-app in monorepos), NOT scoped to `.argo/build-mode.json`.
 * figma-to-code can legitimately run outside a gated build, and this
 * deterministic gate must still be mandatory there.
 */
export {};
//# sourceMappingURL=design-commit-gate.d.ts.map