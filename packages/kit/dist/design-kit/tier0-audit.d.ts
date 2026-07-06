/**
 * `options`: `componentNames`/`compositeNames` get a hard audit (D8, fails
 * loud) when set; omitted -> advisory file-wide sweep of un-synced frames.
 * `compositeNames` — the project's registered composite names
 * (`design/registry.json`'s keys), derived Node-side by
 * `prepare-tier0-audit-options.js` before this call — feeds
 * `compositeRegionNamingViolation` (Option B, always advisory).
 * `semanticCollectionName` defaults to `'Semantic'`. `runRecipeTier0Checks`/
 * `runKitPatchesConformance` are the recipe's extension points, baked into
 * the bundle by `bundle-tier0-audit`'s generated entry — omit either for a
 * `baseSource: none` recipe.
 */
export declare function runTier0Audit(options?: {
    componentNames?: string[];
    compositeNames?: string[];
    semanticCollectionName?: string;
    runRecipeTier0Checks?: (node: any, ctx: {
        hard: boolean;
    }) => Promise<any[]>;
    runKitPatchesConformance?: (modifiedNodes: any[]) => Promise<any[]> | any[];
}): Promise<any[]>;
//# sourceMappingURL=tier0-audit.d.ts.map