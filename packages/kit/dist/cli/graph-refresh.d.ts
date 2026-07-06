/**
 * `argo graph refresh` — refresh the graphify knowledge graph, then commit it.
 * Port of the pre-kit templates/graphify/refresh-graph.sh; wired by init as
 * the lefthook post-merge job.
 *
 * SINGLE WRITER: refreshes only on `main`, never inside a linked worktree
 * (worktrees read main's graph, never write it, so parallel builds can't race
 * on graph.json), on-device (labeling spawns the local `claude` via
 * graphify's claude-cli backend — subscription auth, no API key; without it
 * labels degrade to placeholders, never crash).
 *
 * Works for both a single-app repo and a monorepo: refreshes every workspace
 * that has a seeded graphify-out/ (skipping node_modules/.git), falling back
 * to the repo root when none is seeded yet.
 */
export declare function runGraphRefresh({ cwd, env }?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
}): {
    skipped: string;
    branch?: undefined;
    workspaces?: undefined;
    committed?: undefined;
    labelDegraded?: undefined;
} | {
    skipped: string;
    branch: string;
    workspaces?: undefined;
    committed?: undefined;
    labelDegraded?: undefined;
} | {
    workspaces: string[];
    committed: boolean;
    labelDegraded: string[];
    skipped?: undefined;
    branch?: undefined;
};
//# sourceMappingURL=graph-refresh.d.ts.map