import type { Gate } from '@argohq/core';
export interface BriefCheckOptions {
    /** Required section headings (matched case-insensitively as a markdown heading). Defaults to a minimal brief shape. */
    requiredSections?: string[];
    /** Base directory referenced paths are resolved against. Defaults to `process.cwd()`. */
    cwd?: string;
    /** Key into `GateInput.artifacts` holding the brief file's path/URI. Defaults to `'brief'`. */
    artifactKey?: string;
}
export declare function createBriefCheckGate(options?: BriefCheckOptions): Gate;
//# sourceMappingURL=brief-check.d.ts.map