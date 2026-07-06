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
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { mergeConfigShape } from '../config/merge-config-shape.js';
const KIT_DEP_LINE = 'link:@argohq/kit';
function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}
function writeJson(path, data) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}
/** Expand a package.json `workspaces` field (array or { packages }) against the host tree. */
function expandWorkspaces(hostRoot, workspaces) {
    const patterns = Array.isArray(workspaces) ? workspaces : (workspaces?.packages ?? []);
    const apps = [];
    for (const pattern of patterns) {
        if (pattern.endsWith('/*')) {
            const base = pattern.slice(0, -2);
            const baseDir = join(hostRoot, base);
            if (!existsSync(baseDir))
                continue;
            for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
                if (entry.isDirectory() && existsSync(join(baseDir, entry.name, 'package.json'))) {
                    apps.push(`${base}/${entry.name}`);
                }
            }
        }
        else if (existsSync(join(hostRoot, pattern, 'package.json'))) {
            apps.push(pattern);
        }
    }
    return apps.sort();
}
export function runInit({ hostRoot, marketplaceSource }) {
    if (!hostRoot)
        throw new Error('runInit: hostRoot is required');
    const pkgPath = join(hostRoot, 'package.json');
    if (!existsSync(pkgPath))
        throw new Error(`runInit: no package.json at ${hostRoot}`);
    const pkg = readJson(pkgPath);
    const isMonorepo = pkg.workspaces != null;
    const apps = isMonorepo ? expandWorkspaces(hostRoot, pkg.workspaces) : ['.'];
    // 1. dep placement — workspace root or the single package.json, idempotent.
    const depAlreadyPresent = pkg.dependencies?.['@argohq/kit'] === KIT_DEP_LINE;
    if (!depAlreadyPresent) {
        pkg.dependencies = { ...pkg.dependencies, '@argohq/kit': KIT_DEP_LINE };
        writeJson(pkgPath, pkg);
    }
    // 2. .claude/settings.json — merge, never clobber unrelated settings.
    const settingsPath = join(hostRoot, '.claude', 'settings.json');
    const settings = existsSync(settingsPath) ? readJson(settingsPath) : {};
    settings.enabledPlugins = { ...settings.enabledPlugins, 'argo@argo': true };
    if (marketplaceSource) {
        settings.extraKnownMarketplaces = {
            ...settings.extraKnownMarketplaces,
            argo: { source: marketplaceSource },
        };
    }
    writeJson(settingsPath, settings);
    // 3. .claude/argo.json skeleton — inert design keys, user fields preserved.
    const argoJsonPath = join(hostRoot, '.claude', 'argo.json');
    const shape = {
        landing: 'pr',
        design: Object.fromEntries(apps.map((app) => [app, {}])),
    };
    const existing = existsSync(argoJsonPath) ? readJson(argoJsonPath) : undefined;
    const { merged, addedKeys } = mergeConfigShape(shape, existing);
    writeJson(argoJsonPath, merged);
    return {
        mode: isMonorepo ? 'monorepo' : 'single-repo',
        apps,
        depAlreadyPresent,
        addedKeys,
    };
}
//# sourceMappingURL=init.js.map