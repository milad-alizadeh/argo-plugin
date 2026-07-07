import { z } from 'zod'

/** D15/D23: {component, variant, property, figmaValue, codeValue, sourceVersion, reason, date}.
 * sourceVersion is a generic design-source pin — the external-kit recipe maps it to the
 * kit.lock version; other recipes may pin to a different source of truth. */
export const WaiverSchema = z.object({
  component: z.string(),
  variant: z.string(),
  property: z.string(),
  figmaValue: z.union([z.string(), z.number()]),
  codeValue: z.union([z.string(), z.number()]),
  sourceVersion: z.string(),
  reason: z.string(),
  date: z.string()
})

/** D13/D15: sanctioned local kit edits (component, file, description, date) */
export const KitPatchSchema = z.object({
  component: z.string(),
  file: z.string(),
  description: z.string(),
  date: z.string()
})

/** D4: kit version, import date, library file key, freshness metadata */
export const KitLockSchema = z.object({
  kitVersion: z.string(),
  importDate: z.string(),
  libraryFileKey: z.string(),
  fileVersion: z.string(),
  lastModified: z.string(),
  syncTimestamp: z.string(),
  // The kit library's variable KEYS — the manifest the recipe's
  // non-semantic-binding check needs to tell a legit kit-token binding from a
  // stray remote one. Optional (a lock written before capture landed omits it),
  // but WITHOUT it the check fails open (remote ⇒ kit) and silently verifies
  // nothing. Captured from the kit library at figma-sync time.
  // `retiredVariableKeys` are keys from a superseded kit version (recorded by
  // design-upgrade at swap time) so a stale binding left over from a Library
  // Swap is still flagged.
  variableKeys: z.array(z.string()).optional(),
  retiredVariableKeys: z.array(z.string()).optional()
})

/** D1: component key, node id, story id, import path, prop mapping */
export const StoryMapEntrySchema = z.object({
  componentKey: z.string(),
  nodeId: z.string(),
  storyId: z.string(),
  importPath: z.string(),
  propMapping: z.record(z.string(), z.unknown())
})

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
export const RegistryEntrySchema = z.object({
  nodeId: z.string(),
  category: z.string(),
  status: z.enum(['draft', 'audit-clean']),
  description: z.string(),
  provenance: z.object({
    createdBy: z.string(),
    lastTask: z.string(),
    lastAudit: z.object({
      auditedAt: z.string(),
      clean: z.boolean()
    })
  })
})

/** design-memory-placement.md Mechanism 2: registry.json's file header — freshness metadata a reader uses to distinguish a fresh registry from a wholesale-rotted one. */
export const RegistryHeaderSchema = z.object({
  figmaFileVersion: z.string(),
  syncedAtWriteCount: z.number(),
  syncedAt: z.string()
})
