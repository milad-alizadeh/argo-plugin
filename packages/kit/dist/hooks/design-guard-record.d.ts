#!/usr/bin/env node
/**
 * Design-guard record (PostToolUse on the Figma `use_figma` write tool).
 *
 * SELF-SCOPING: entirely inert unless a `design.<app>` block in
 * `.claude/argo.json` at the session's git toplevel carries a `recipe` (the
 * design-pack-installed marker, same contract session-context.mjs's
 * designSetupNudge uses) — unlike the build-mode gates,
 * this is NOT scoped to `.argo/build-mode.json`: a Figma write matters
 * whether or not a gated build is running, so it arms in every session type
 * a design pack is installed in.
 *
 * Detects write-shaped calls cheaply: presence of the `use_figma` tool call
 * at all is enough (false positives on read-only scripts are acceptable —
 * the receipt requirement below is idempotent, a clean re-audit costs
 * nothing). Records a monotonically increasing write counter in
 * `.argo/design-guard.json`, and injects additionalContext reminding that a
 * clean tier-0 audit receipt is now owed for the touched components.
 */
export {};
//# sourceMappingURL=design-guard-record.d.ts.map