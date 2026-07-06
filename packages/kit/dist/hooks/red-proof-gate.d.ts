#!/usr/bin/env node
/**
 * Red-proof gate (PreToolUse on Bash, `git commit` only). tdd-guard enforces ORDER
 * (no implementation before a failing test); this gate enforces the RECEIPT — a slice
 * may only land with machine-checkable proof that its test failed before the
 * implementation existed and passes now. It reads exit codes a real test run wrote,
 * never prose (the one gate that worked in the retired build-slices workflow).
 *
 * SELF-SCOPING: entirely inert unless `.argo/build-mode.json` exists in the session
 * cwd — the build-plan skill writes that marker per slice and removes it when the
 * build ends. Normal interactive commits, other projects, other sessions: exit 0,
 * always. Inside a gated build it is fail-closed: malformed marker or receipt → BLOCK.
 *
 * Expects `.argo/red-proof.json` written by the builder after the green run:
 *   { "slice": "<id>", "testFile": "<path>", "redExit": <non-zero>, "greenExit": 0,
 *     "recordedAt": <epoch ms> }
 * The receipt must name the CURRENT slice (from build-mode.json) and be newer than
 * HEAD — so a receipt can never be reused across slices or commits.
 *
 * Exit 0 → allow. Exit 2 → block, reason on stderr.
 *
 * TRUST BOUNDARY: the build-mode marker and the red-proof receipt are
 * SELF-ATTESTED by the gated builder session — nothing here is written by an
 * independent runner. This gate verifies shape, freshness, slice-match, and
 * staged-diff consistency; it catches a sloppy/forgetful agent, not a
 * determined forger. Full provenance would require a runner-written receipt
 * (deliberate non-goal for now).
 *
 * ALIAS SCOPE: commit detection matches the literal `commit` subcommand and the
 * common `ci` alias. Exotic user-defined git aliases are out of scope — builder
 * sessions don't configure aliases; this gate catches sloppiness, not adversaries.
 */
export {};
//# sourceMappingURL=red-proof-gate.d.ts.map