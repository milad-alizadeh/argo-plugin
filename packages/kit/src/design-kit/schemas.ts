import { z } from 'zod'

/** D1: component key, node id, story id, import path, prop mapping */
export const StoryMapEntrySchema = z.object({
  componentKey: z.string(),
  nodeId: z.string(),
  storyId: z.string(),
  importPath: z.string(),
  propMapping: z.record(z.string(), z.unknown())
})

/**
 * design-memory-placement.md Mechanism 2, slimmed by
 * design-system-reset-overhaul.md Slice 4 (decision 4's flat registry, build
 * order step 4's literal "{nodeId, kind, status, lastSyncedAt, variant
 * matrix}"): `nodeId` (reuses `StoryMapEntrySchema`'s field name/type so the
 * registry<->story-map join key is schema-enforced), `kind` (`kit` vs
 * `custom` — replaces the project-configured `category` enum), `status`
 * (Figma-side lifecycle ONLY — `synced`/`coded` are derived, never stored),
 * `lastSyncedAt` (decision 8 staleness classification), and `variantMatrix`
 * (variant prop name → allowed values). `category`, `description`, and
 * `provenance` are dropped — not in the design doc's 5-field enumeration;
 * see the Slice 4 plan's "Risks / open call made here" for the provenance
 * (audit pass/fail bookkeeping) cut specifically. `variants[]`/`kitDeps[]`/
 * `rulingsApplied[]` and a `lastAuditReceipt` pointer remain deliberately
 * absent (rejected — see the plan's §1 rulings).
 */
export const RegistryEntrySchema = z.object({
  nodeId: z.string(),
  kind: z.enum(['kit', 'custom']),
  status: z.enum(['draft', 'audit-clean', 'out-of-sync', 'orphaned']),
  lastSyncedAt: z.string().nullable(),
  variantMatrix: z.record(z.string(), z.array(z.string()))
})

/** design-memory-placement.md Mechanism 2: registry.json's file header — freshness metadata a reader uses to distinguish a fresh registry from a wholesale-rotted one. */
export const RegistryHeaderSchema = z.object({
  figmaFileVersion: z.string(),
  syncedAtWriteCount: z.number(),
  syncedAt: z.string()
})
