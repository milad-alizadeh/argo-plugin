#!/usr/bin/env node
/**
 * Computes the deterministic `design/spec-diff-receipt.json` shape —
 * the kit's design-commit-gate requires a fresh, passing one before a
 * commit touching generated component code (the `componentsPath` in the
 * app's `design.<app>` block in `.claude/argo.json`) can land. This pure function only shapes the receipt;
 * the CLI entry point below (untested by convention, same as
 * bundle-tier0-audit.js's `bundleTier0Audit` CLI usage) is what actually
 * runs the spec-diff walker and persists the receipt via `writeDesignJson`.
 */
export declare function recordSpecDiffReceipt(exitCode: number, { now }?: {
    now?: number;
}): {
    recordedAt: number;
    exitCode: number;
};
//# sourceMappingURL=record-spec-diff-receipt.d.ts.map