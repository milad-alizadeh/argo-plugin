#!/usr/bin/env node
/**
 * The anti-recreation hard gate (design-first-council-ruling.md Gate ruling
 * — "the ONE hard check promoted now"), wired into figma-create/SKILL.md's
 * component-first screen path: before authoring any brief-tagged NEW
 * component, run this against its proposed name. A collision is a HARD
 * stop-the-line — never build a second component for something that
 * already exists under another name (`design/component-aliases.json`'s
 * canonical name or alias); reuse or extend it instead. Deliberately NOT
 * folded into `record-audit-receipt.js`'s per-run `violationCount` — that
 * flow re-checks the SAME `componentNames` on every re-audit of an already-
 * built component, which would self-collide against its own alias-map entry
 * (`findNewNameAliasCollision` has no self-exclusion, unlike
 * `findKitNameCollisions` — by design, since it only ever runs once, before
 * a name is committed to anything).
 */
export declare function checkNewNameAliasCollision(newName: string, { cwd }: {
    cwd: string;
}): {
    rule: string;
    detail: string;
} | null;
//# sourceMappingURL=check-anti-recreation.d.ts.map