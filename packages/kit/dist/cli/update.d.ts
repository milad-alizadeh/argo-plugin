/**
 * `argo update` — the deterministic half of /argo:update (amended 2026-07-06):
 * re-emit `.claude/argo.json` skeleton defaults while preserving every
 * user-edited field via mergeConfigShape. The dev-phase `link:@argohq/kit`
 * dep line is version-less, so there is nothing to bump here; there are no
 * migrations of any kind (owner no-legacy ruling). Generated design-pack
 * files (walker shims etc.) are re-emitted by /argo:setup-design's own
 * update mode, which the umbrella skill invokes after this.
 */
export declare function runUpdate({ hostRoot }: {
    hostRoot: string;
}): {
    addedKeys: string[];
};
//# sourceMappingURL=update.d.ts.map