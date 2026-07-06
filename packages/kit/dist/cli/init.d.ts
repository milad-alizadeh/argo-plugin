/**
 * `argo init` — the deterministic half of /argo:init (the skill owns the
 * wizard; this owns every write that must be exact):
 *
 *  - dep placement: `"@argohq/kit": "link:@argohq/kit"` (dev-phase link
 *    protocol — release swaps to a caret version) at the workspace root
 *    (monorepo: root package.json has `workspaces`) or the single package.json.
 *  - `.claude/settings.json`: `enabledPlugins` (+ `extraKnownMarketplaces`
 *    when the caller supplies a marketplace source — this file is the SOLE
 *    owner, never settings.local.json).
 *  - `.claude/argo.json` skeleton per mode: one design key per workspace app
 *    (monorepo) or a single "." key (single-repo), each INERT ({} — no
 *    componentsPath, so the commit gates cannot arm until /argo:setup-design
 *    fills the block). User-edited fields survive via mergeConfigShape.
 */
export declare function runInit({ hostRoot, marketplaceSource }: {
    hostRoot: string;
    marketplaceSource?: {
        source: string;
        repo?: string;
    };
}): {
    mode: string;
    apps: string[];
    depAlreadyPresent: boolean;
    addedKeys: string[];
};
//# sourceMappingURL=init.d.ts.map