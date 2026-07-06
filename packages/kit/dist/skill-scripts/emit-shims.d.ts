/**
 * `argo design emit-shims` — generate the host-side walker shims from
 * .claude/argo.json. Shims are the decision-14 glue: THIN glob-map files at
 * `<app>/test/spec-diff/` and `<app>/test/vrt/` that hand already-imported
 * modules to the @argohq/kit/walkers factories. The factory owns the walk +
 * assertions, so a kit upgrade updates every host's gate logic without
 * re-templating, and a host-side rename can't fork it.
 *
 * Per-app knobs live in `design.<app>.walkers` (all optional):
 *   storiesGlob            default `../../<componentsPath>/**\/*.stories.{js,jsx,ts,tsx}`
 *   specsGlob              default `../../design/specs/**\/*.json`
 *   baselinesGlob          default `../../design/screenshots/**\/*.png`
 *   storybookTestPackage   default '@storybook/react'; null → storybook-free
 *                          identity composeStories (fixtures, non-storybook hosts)
 * Globs are relative to the shim's own directory (two levels below the app root).
 */
export declare function renderSpecDiffShim({ storiesGlob, specsGlob, storybookTestPackage }: {
    storiesGlob: string;
    specsGlob: string;
    storybookTestPackage: string | null;
}): string;
export declare function renderVrtShim({ storiesGlob, baselinesGlob, storybookTestPackage }: {
    storiesGlob: string;
    baselinesGlob: string;
    storybookTestPackage: string | null;
}): string;
export declare function shimOptions(block: Record<string, any>): {
    storiesGlob: any;
    specsGlob: any;
    baselinesGlob: any;
    storybookTestPackage: any;
};
export declare function runEmitShims({ hostRoot }?: {
    hostRoot?: string;
}): {
    apps: {
        appKey: string;
        files: string[];
    }[];
};
//# sourceMappingURL=emit-shims.d.ts.map