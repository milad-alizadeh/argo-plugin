#!/usr/bin/env node
/**
 * Design coverage gate (PreToolUse on Bash, `git commit` only). The P5 half
 * of build-design-workflow.md's completeness gate: a commit touching a
 * screen's built component code may only land with a fresh, clean,
 * non-compose, screen-matched `design/coverage-receipt-<screen>.json` —
 * never an LLM's narration that "the region diff came back clean", and
 * never a stale receipt from a DIFFERENT screen (C2 fix — the ruling's top
 * silent-failure risk was a clean receipt from screen N passing the gate
 * for screen N+1). Mirrors design-commit-gate.js's receipt-gate shape
 * exactly; this is the coverage half, not the spec-diff half.
 *
 * SELF-SCOPING: arms per-app from `.claude/argo.json`'s `design.<app>`
 * blocks — same decision-8 dual-mode contract as design-commit-gate.js,
 * independent of `.argo/build-mode.json`.
 */
/**
 * The gate's decision logic — moved to the kit module (region-contract.js)
 * so it lives alongside `screenMatchesReceipt` (C2's screen cross-check) and
 * `deriveExpectedScreensFromStagedFiles`, and is unit-tested there, off-
 * Figma; re-exported here unchanged so this file's own export surface
 * doesn't move.
 */
export { evaluateCoverageReceipt, coverageReceiptFilename, deriveExpectedScreensFromStagedFiles } from '../design-kit/region-contract.js';
//# sourceMappingURL=design-coverage-gate.d.ts.map