/**
 * `.claude/argo.json` — the kit's consolidated per-project config (decision 8)
 * — and the dual-mode hook-resolution logic the design commit gates arm from.
 *
 * Shape (design section):
 *   { "design": { "<appKey>": { "root": "<app dir, repo-root-relative>",
 *                               "componentsPath": "<relative to root>" } } }
 * Single-repo: one entry keyed "." with root ".". Monorepo: one entry per
 * app, keyed by the app dir (e.g. "apps/desktop"). A gate arms for an app iff
 * its design block exists AND a staged file falls under that app's resolved
 * componentsPath — matched repo-root-relative, which is the fix for the old
 * `design/config.json`-presence arming that silently no-oped per-app in
 * monorepos.
 */
export type DesignBlock = {
    root?: string;
    componentsPath?: string;
    recipe?: string;
    [key: string]: unknown;
};
export type ArgoConfig = {
    design?: Record<string, DesignBlock>;
};
export type FoundArgoJson = {
    repoRoot: string;
    config: ArgoConfig;
};
/**
 * Walk up from `cwd` to the first directory containing `.claude/argo.json`.
 * Returns null when absent or malformed — callers treat both as "not an
 * argo project", inert, no throw.
 */
export declare function findArgoJson(cwd: string): FoundArgoJson | null;
/** The app's design block, or null — arming is presence of `design[appKey]`. */
export declare function resolveDesignArming(config: ArgoConfig | undefined, appKey: string): DesignBlock | null;
/**
 * design.<app> blocks the setup-design skill has SET UP (stamped a `recipe`
 * into) — the design-pack-installed marker. Init-seeded inert `{}` blocks
 * don't count, and neither does a legacy `design/config.json` (no-legacy
 * ruling: pre-kit projects rip and re-init).
 */
export declare function setUpDesignApps(config: ArgoConfig | undefined): {
    appKey: string;
    block: DesignBlock;
}[];
/** Absolute components dir: join(repoRoot, block.root, block.componentsPath). */
export declare function resolveComponentsPath(repoRoot: string, designBlock: DesignBlock): string;
/**
 * True iff any staged file (repo-root-relative, as `git diff --cached
 * --name-only` prints them) is the resolved components dir or inside it.
 */
export declare function matchesStagedFile(resolvedComponentsPath: string, repoRoot: string, stagedRepoRelativePaths: string[]): boolean;
export type ArmedDesignApp = {
    appKey: string;
    block: DesignBlock;
    componentsPath: string;
    designDir: string;
    appRelativeStagedFiles: string[];
};
/**
 * The gates' one-call surface: every design app whose componentsPath a staged
 * file touches. Each entry carries the app's design dir (receipt home) and the
 * staged list re-rooted to the app (`design/...` paths stay app-relative, so
 * screen derivation keeps working unchanged in a monorepo).
 */
export declare function armedDesignApps(found: FoundArgoJson | null, stagedRepoRelativePaths: string[]): ArmedDesignApp[];
//# sourceMappingURL=argo-json.d.ts.map