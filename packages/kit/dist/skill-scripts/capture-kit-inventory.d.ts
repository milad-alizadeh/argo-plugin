#!/usr/bin/env node
/** Shapes a marshaled `{ components, icons }` dump into the committed kit-inventory.json shape. */
export declare function buildKitInventory({ components, icons }: {
    components?: Record<string, any>[];
    icons?: unknown;
}, { kitLibraryFileKey, kitSourceVersion, now }?: {
    kitLibraryFileKey?: string;
    kitSourceVersion?: string;
    now?: number;
}): {
    _usage: string;
    kitLibraryFileKey: string | undefined;
    kitSourceVersion: string | undefined;
    capturedAt: string;
    source: string;
    components: Record<string, any>[];
    icons: unknown;
};
//# sourceMappingURL=capture-kit-inventory.d.ts.map