export declare function runRecipeTier0Checks(node: any, { hard, kitVariableKeys, retiredKitVariableKeys, semanticCollectionName }?: {
    hard: boolean;
    kitVariableKeys?: string[];
    retiredKitVariableKeys?: string[];
    semanticCollectionName?: string;
}): Promise<any[]>;
/**
 * Runs once per audit (not per node), called from design-kit/tier0-audit.js's
 * runTier0Audit after it marshals the kit-copy file's modified nodes: flag
 * any not recorded in kit-patches.json (D13/D15). `kitPatches` is the
 * project's `design/kit-patches.json` contents, read Node-side by
 * prepare-tier0-audit-options.js and curried in by the bundle entry — never
 * imported here as a project file.
 */
export declare function runKitPatchesConformance(modifiedNodes: {
    component: string;
    file: string;
}[], kitPatches?: Record<string, string[]>): {
    severity: string;
    rule: string;
    detail: string;
}[];
//# sourceMappingURL=tier0-walker.d.ts.map