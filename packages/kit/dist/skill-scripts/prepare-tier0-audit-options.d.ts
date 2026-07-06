#!/usr/bin/env node
/**
 * The figma-audit Node wrapper (SKILL.md §"Procedure" step 3): derives the
 * FULL options object the agent passes into the `use_figma` call that runs
 * `runTier0Audit` — every project-specific value the bundled entry needs,
 * as DATA (kit-extraction restructure: killed the {{…}}-slot/splice model —
 * nothing project-specific is ever baked into a committed audit script
 * again; it all flows through this object at call time instead).
 *
 * The sandbox can't read a committed file itself (kit-awareness.md
 * §"Enforcement"'s same constraint), so this has to happen Node-side, before
 * the call, exactly like `record-audit-receipt.js`'s post-hoc reads of the
 * same files.
 */
export declare function deriveTier0AuditOptions({ cwd, componentNames }: {
    cwd: string;
    componentNames?: string[];
}): {
    componentNames: string[];
    compositeNames: string[];
    semanticCollectionName: any;
    recipe: any;
    kitPatches: any;
    kitVariableKeys: any;
    retiredKitVariableKeys: any;
};
//# sourceMappingURL=prepare-tier0-audit-options.d.ts.map