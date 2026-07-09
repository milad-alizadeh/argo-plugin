import { fetchFile, buildPullRegistryResult, token as resolveFigmaToken } from '@argohq/kit/skill-scripts/pull-registry';
import { RegistryEntrySchema } from '@argohq/kit/design-kit/schemas';
import type { z } from 'zod';
/** Re-exported, not redefined — callers validate/consume the exact same schema kit's own registry-reconcile code validates against. */
export { RegistryEntrySchema };
export type RegistryCard = z.infer<typeof RegistryEntrySchema>;
export type RegistryDoc = {
    components?: Record<string, unknown>;
};
export interface RegisterScreenInput {
    /** The registry document to upsert into. Defaults to an empty registry. */
    registry?: RegistryDoc;
    nodeId: string;
    name: string;
    status?: string;
    /** ISO timestamp stamped onto the card as `lastSyncedAt` when not already present. Defaults to `new Date().toISOString()`. */
    now?: string;
}
export interface RegisterScreenResult {
    /** The full registry document with `name`'s entry upserted. */
    registry: {
        components: Record<string, unknown>;
    };
    /** The single upserted entry, schema-validated. */
    card: RegistryCard;
}
/**
 * Registers (or re-registers) a screen frame as a `kind:"screen"` registry
 * entry. Delegates the actual upsert to `upsertScreenEntry` — this function
 * only (a) supplies the two fields `RegistryEntrySchema` requires that the
 * screen-specific upsert doesn't set (`lastSyncedAt`, `variantMatrix` — a
 * screen frame carries no variants, so it defaults to `{}`), and
 * (b) validates the result against the real schema before returning it, so a
 * caller can never receive a card the schema itself would reject.
 */
export declare function registerScreen(input: RegisterScreenInput): RegisterScreenResult;
export interface PullRegistryInput {
    fileKey: string;
    figmaToken: string;
    /** Ordered page names, used to classify kit vs. non-kit pages. Defaults to the fetched document's own page order. */
    orderedPageNames?: string[];
    nonKitPages?: string[];
    registry: RegistryDoc;
    now?: string;
    /**
     * Injectable override for kit's real `fetchFile` (the live Figma REST
     * call) — defaults to the real implementation. Same pattern as
     * `design-rules-check`'s injected `readFigma`: tests supply a fake here
     * rather than reaching for module-mocking, which this repo's test runner
     * (`bun test`, not full vitest) doesn't support (`vi.mock`/`vi.importActual`
     * are unavailable).
     */
    fetchFile?: typeof fetchFile;
}
/**
 * Reads the live Figma file (`fetchFile`) and derives the same
 * new-entry/changed-entry classification `pull-registry.ts`'s CLI entrypoint
 * writes to disk (`buildPullRegistryResult`) — without performing the disk
 * write itself (see the module doc comment above). Composition only: no
 * marshaling/classification logic is reimplemented here.
 */
export declare function pullRegistry(input: PullRegistryInput): Promise<ReturnType<typeof buildPullRegistryResult>>;
/** Re-exported so a caller building `PullRegistryInput.figmaToken` can reuse kit's own token-resolution convention (`FIGMA_TOKEN` env, falling back to `.argo/figma-token`) instead of reimplementing it. */
export { resolveFigmaToken };
//# sourceMappingURL=index.d.ts.map