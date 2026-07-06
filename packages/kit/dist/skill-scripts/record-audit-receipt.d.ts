#!/usr/bin/env node
/**
 * Writes `design/audit-receipt.json` — the deterministic proof
 * design-guard-stop.js checks before it lets a session end. Derived, never
 * hand-authored: this is the ONE place that turns a `use_figma`-returned
 * tier0-audit result (the `runTier0Audit` completion value, an array of
 * `{ severity, rule, nodeId, nodeName, detail }`) into the receipt shape.
 *
 * A sibling of bundle-tier0-audit.js (figma-audit/SKILL.md's procedure
 * documents this as its final step, run right after `use_figma` returns the
 * audit's violations array): `argo design record-audit-receipt --record
 * '<json>'`, where `<json>` is `{ componentNames, violations }`.
 */
/**
 * `writeCounterAtAudit` is read from `.argo/design-guard.json`'s current
 * `writeCount` (0 if no Figma writes have ever been recorded) so
 * design-guard-stop.js can detect a write that happened after this audit
 * ran, and demand a re-audit. `.argo/design-guard.json` is repo-global and
 * lives at the git toplevel — NOT necessarily `cwd`, which in a monorepo is
 * the app root (e.g. `apps/desktop`, per figma-audit/SKILL.md's documented
 * cwd, matching where `design/audit-receipt.json` itself must land for
 * design-guard-stop.js to find it). Reading both off the same `cwd` silently
 * missed the guard state in that layout, defaulting `writeCounterAtAudit`
 * to 0 forever — resolveRepoRoot finds the real repo root for this one read
 * while `cwd` keeps governing every app-scoped path (design/, kit-inventory,
 * etc).
 */
export declare function recordAuditReceipt({ componentNames, violations }: {
    componentNames?: string[];
    violations?: {
        severity?: string;
    }[];
} | undefined, { cwd, now }: {
    cwd: string;
    now?: number;
}): {
    timestamp: number;
    componentNames: string[];
    violationCount: number;
    writeCounterAtAudit: number;
};
//# sourceMappingURL=record-audit-receipt.d.ts.map