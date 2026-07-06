#!/usr/bin/env node
/** Shapes a marshaled `{ pristine, inverse, semanticModes }` dump into the corpus file format, stamping a capturedFrom provenance header. */
export declare function buildKitCorpus({ pristine, inverse, semanticModes }: {
    pristine: unknown;
    inverse: unknown;
    semanticModes?: string[];
}, { capturedFrom, now }?: {
    capturedFrom?: string;
    now?: number;
}): {
    capturedFrom: string;
    semanticModes: string[];
    pristine: unknown;
    inverse: unknown;
};
//# sourceMappingURL=capture-kit-corpus.d.ts.map