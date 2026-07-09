import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
const DEFAULT_CONFIG = {
    packs: {},
    noWorkflow: 'allow',
    testDiscipline: undefined,
    land: undefined
};
/** Walk up from `cwd` to the nearest `.argo/config.json`, returning its
 * absolute path, or `null` if none is found before the filesystem root. */
function findConfigPath(cwd) {
    let dir = resolve(cwd);
    while (true) {
        const candidate = join(dir, '.argo', 'config.json');
        if (existsSync(candidate))
            return candidate;
        const parent = dirname(dir);
        if (parent === dir)
            return null;
        dir = parent;
    }
}
/** Reads `.argo/config.json` live (no caching), walking up from `cwd`
 * (defaults to `process.cwd()`) to the nearest match. Missing file or
 * malformed JSON both resolve to `DEFAULT_CONFIG` — never throws. Keys
 * absent from a present-but-partial file fall back to their individual
 * defaults (a file with only `{ "noWorkflow": "deny-edits" }` still reads
 * `packs` as `{}`). */
export function readConfig(cwd = process.cwd()) {
    const path = findConfigPath(cwd);
    if (!path)
        return { ...DEFAULT_CONFIG };
    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8'));
        if (!parsed || typeof parsed !== 'object')
            return { ...DEFAULT_CONFIG };
        return {
            packs: typeof parsed.packs === 'object' && parsed.packs !== null ? parsed.packs : DEFAULT_CONFIG.packs,
            noWorkflow: parsed.noWorkflow === 'deny-edits' ? 'deny-edits' : DEFAULT_CONFIG.noWorkflow,
            testDiscipline: 'testDiscipline' in parsed ? parsed.testDiscipline : DEFAULT_CONFIG.testDiscipline,
            land: 'land' in parsed ? parsed.land : DEFAULT_CONFIG.land
        };
    }
    catch {
        return { ...DEFAULT_CONFIG }; // malformed config — inert, never a crash inside a hook
    }
}
/** Thrown by `assertPackAvailable` when a workflow's terminal stage hands off
 * to a pack that is disabled (or absent) in config — named so callers
 * (`workflow-start.ts`, Slice 5) can distinguish it from other start-time
 * errors. */
export class PackUnavailableError extends Error {
    workflowName;
    requiredPack;
    constructor(workflowName, requiredPack) {
        super(`workflow "${workflowName}" hands off to pack "${requiredPack}", which is disabled — enable it in ` +
            `.argo/config.json's "packs" block before starting this workflow`);
        this.workflowName = workflowName;
        this.requiredPack = requiredPack;
        this.name = 'PackUnavailableError';
    }
}
/** Refuses a cross-pack workflow at start time when its terminal stage hands
 * off to a disabled pack (audit 2.4) — e.g. pack-design's `design-to-code`
 * handing off to pack-code's `screen-implement`. Called once at
 * `workflow-start.ts` time, never mid-run: a pack that gets disabled after a
 * workflow is already in flight is not re-checked here. A pack absent from
 * `config.packs` is treated as disabled (deny-by-default), matching
 * `PackAvailability`'s documented default. */
export function assertPackAvailable(workflowName, requiredPack, config) {
    if (!config.packs[requiredPack]) {
        throw new PackUnavailableError(workflowName, requiredPack);
    }
}
//# sourceMappingURL=config.js.map