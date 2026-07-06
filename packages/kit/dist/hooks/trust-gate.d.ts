#!/usr/bin/env node
/**
 * Trust gate (§8.2) — decides whether a build slice may land by reading the LAUNCH
 * EVIDENCE RECEIPT a real run wrote, never prose. Registered as a PreToolUse hook on
 * Bash, enforcing only `git commit` commands.
 *
 * SELF-SCOPING (same contract as red-proof-gate): entirely inert unless
 * `.argo/build-mode.json` exists in the session cwd AND marks the current slice
 * `requiresLaunch: true`. The build-plan skill maintains that marker; outside a
 * gated build — normal commits, non-Argo host projects — this hook always exits 0.
 * The gate is Argo-runtime-specific by design: the receipt is written by the Argo
 * app's own launch evidence recorder; generalizing it is documented out of scope.
 *
 * INSIDE a gated launch-slice it is fail-closed — the deliberate opposite of the
 * pipe-to-shell hook: anything missing, unparseable, incomplete, or stale DENIES.
 * The only path to exit 0 is a receipt proving the app launched AND did something
 * observable (an OSC-777 prompt_submit/stop or an MCP report_status).
 *
 * Receipt search: `<cwd>/.argo/launch-receipt.json`, then one workspace level down
 * (`<cwd>/apps/<ws>/.argo/...`) — the launched app writes the receipt relative to
 * ITS OWN cwd, which in a monorepo is the workspace dir, not the repo root.
 *
 * Exit 0 → PASS (land allowed). Exit 2 → BLOCK (RED), reason on stderr.
 *
 * TRUST BOUNDARY: the build-mode marker and the launch-evidence receipt are
 * SELF-ATTESTED by the gated builder session / the Argo app it launched —
 * nothing here is written by an independent runner. This gate verifies shape,
 * freshness, and slice-match; it catches a sloppy/forgetful agent, not a
 * determined forger. Full provenance would require a runner-written receipt
 * (deliberate non-goal for now).
 *
 * ALIAS SCOPE: commit detection matches the literal `commit` subcommand and the
 * common `ci` alias. Exotic user-defined git aliases are out of scope — builder
 * sessions don't configure aliases; this gate catches sloppiness, not adversaries.
 */
export {};
//# sourceMappingURL=trust-gate.d.ts.map