import { z } from 'zod';
/** D15/D23: {component, variant, property, figmaValue, codeValue, sourceVersion, reason, date}.
 * sourceVersion is a generic design-source pin — the external-kit recipe maps it to the
 * kit.lock version; other recipes may pin to a different source of truth. */
export declare const WaiverSchema: z.ZodObject<{
    component: z.ZodString;
    variant: z.ZodString;
    property: z.ZodString;
    figmaValue: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    codeValue: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    sourceVersion: z.ZodString;
    reason: z.ZodString;
    date: z.ZodString;
}, "strip", z.ZodTypeAny, {
    component: string;
    variant: string;
    property: string;
    figmaValue: string | number;
    date: string;
    codeValue: string | number;
    sourceVersion: string;
    reason: string;
}, {
    component: string;
    variant: string;
    property: string;
    figmaValue: string | number;
    date: string;
    codeValue: string | number;
    sourceVersion: string;
    reason: string;
}>;
/** D13/D15: sanctioned local kit edits (component, file, description, date) */
export declare const KitPatchSchema: z.ZodObject<{
    component: z.ZodString;
    file: z.ZodString;
    description: z.ZodString;
    date: z.ZodString;
}, "strip", z.ZodTypeAny, {
    component: string;
    date: string;
    file: string;
    description: string;
}, {
    component: string;
    date: string;
    file: string;
    description: string;
}>;
/** D4: kit version, import date, library file key, freshness metadata */
export declare const KitLockSchema: z.ZodObject<{
    kitVersion: z.ZodString;
    importDate: z.ZodString;
    libraryFileKey: z.ZodString;
    fileVersion: z.ZodString;
    lastModified: z.ZodString;
    syncTimestamp: z.ZodString;
}, "strip", z.ZodTypeAny, {
    kitVersion: string;
    importDate: string;
    libraryFileKey: string;
    fileVersion: string;
    lastModified: string;
    syncTimestamp: string;
}, {
    kitVersion: string;
    importDate: string;
    libraryFileKey: string;
    fileVersion: string;
    lastModified: string;
    syncTimestamp: string;
}>;
/** D1: component key, node id, story id, import path, prop mapping */
export declare const StoryMapEntrySchema: z.ZodObject<{
    componentKey: z.ZodString;
    nodeId: z.ZodString;
    storyId: z.ZodString;
    importPath: z.ZodString;
    propMapping: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    componentKey: string;
    nodeId: string;
    storyId: string;
    importPath: string;
    propMapping: Record<string, unknown>;
}, {
    componentKey: string;
    nodeId: string;
    storyId: string;
    importPath: string;
    propMapping: Record<string, unknown>;
}>;
/**
 * design-memory-placement.md Mechanism 2: the registry entry shape, thinned
 * hard by council ruling — `nodeId` (reuses `StoryMapEntrySchema`'s field
 * name/type so the registry<->story-map join key is schema-enforced),
 * `category` (validated against `design.componentCategories` at upsert time,
 * not by this schema — the enum is project-configured, not fixed),
 * `status` (Figma-side lifecycle ONLY — `synced`/`coded` are derived, never
 * stored), a denormalized `description` (cold-start read optimization,
 * healed on the audit-sweep reconciler), and `provenance` (an inline
 * `lastAudit` snapshot, not a pointer into the single-slot
 * `audit-receipt.json`). `variants[]`/`kitDeps[]`/`rulingsApplied[]` and a
 * `lastAuditReceipt` pointer are deliberately absent (rejected — see the
 * plan's §1 rulings).
 */
export declare const RegistryEntrySchema: z.ZodObject<{
    nodeId: z.ZodString;
    category: z.ZodString;
    status: z.ZodEnum<["draft", "audit-clean"]>;
    description: z.ZodString;
    provenance: z.ZodObject<{
        createdBy: z.ZodString;
        lastTask: z.ZodString;
        lastAudit: z.ZodObject<{
            auditedAt: z.ZodString;
            clean: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            auditedAt: string;
            clean: boolean;
        }, {
            auditedAt: string;
            clean: boolean;
        }>;
    }, "strip", z.ZodTypeAny, {
        createdBy: string;
        lastTask: string;
        lastAudit: {
            auditedAt: string;
            clean: boolean;
        };
    }, {
        createdBy: string;
        lastTask: string;
        lastAudit: {
            auditedAt: string;
            clean: boolean;
        };
    }>;
}, "strip", z.ZodTypeAny, {
    status: "draft" | "audit-clean";
    description: string;
    nodeId: string;
    category: string;
    provenance: {
        createdBy: string;
        lastTask: string;
        lastAudit: {
            auditedAt: string;
            clean: boolean;
        };
    };
}, {
    status: "draft" | "audit-clean";
    description: string;
    nodeId: string;
    category: string;
    provenance: {
        createdBy: string;
        lastTask: string;
        lastAudit: {
            auditedAt: string;
            clean: boolean;
        };
    };
}>;
/** design-memory-placement.md Mechanism 2: registry.json's file header — freshness metadata a reader uses to distinguish a fresh registry from a wholesale-rotted one. */
export declare const RegistryHeaderSchema: z.ZodObject<{
    figmaFileVersion: z.ZodString;
    syncedAtWriteCount: z.ZodNumber;
    syncedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    figmaFileVersion: string;
    syncedAtWriteCount: number;
    syncedAt: string;
}, {
    figmaFileVersion: string;
    syncedAtWriteCount: number;
    syncedAt: string;
}>;
//# sourceMappingURL=schemas.d.ts.map