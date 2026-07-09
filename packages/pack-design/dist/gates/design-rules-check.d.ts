import type { Gate, GateInput } from '@argohq/core';
/** Mirrors `tier0-rules.ts`'s local `Variable` shape — the Figma Plugin API's variable binding, marshaled to a plain object. */
export interface FigmaVariableBinding {
    remote?: boolean;
    key?: string;
    collectionName?: string | null;
    /** Carried through for findings/debugging; not read by the rule itself. */
    nodeId?: string;
    nodeName?: string;
}
export interface FigmaAuditReading {
    /** Variable bindings discovered by reading the live Figma file — never a working-agent self-report. */
    bindings: FigmaVariableBinding[];
}
/**
 * The Figma-reading capability, injected. Receives the gate's `GateInput`
 * (target + settings — never `input.artifacts`, which is agent-writable) and
 * returns the bindings found live in Figma.
 */
export type ReadFigmaFn = (input: GateInput) => Promise<FigmaAuditReading>;
export interface DesignRulesCheckOptions {
    readFigma: ReadFigmaFn;
    /** Passed through to `bundleTier0AuditForRecipe` — must resolve `@argohq/kit` from its own `node_modules`. Defaults to `process.cwd()`. */
    cwd?: string;
    /** Recipe key for `bundleTier0AuditForRecipe`'s recipe-specific entry (e.g. `'shadcn-tailwind'`). */
    recipe?: string | null;
    semanticCollectionName?: string;
    additionalAllowedCollectionNames?: string[];
}
export declare function createDesignRulesCheckGate(options: DesignRulesCheckOptions): Gate;
//# sourceMappingURL=design-rules-check.d.ts.map