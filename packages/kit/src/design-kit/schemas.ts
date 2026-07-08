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
 * (variant prop name → allowed values). `category` and `provenance` are
 * dropped — not in the design doc's 5-field enumeration; see the Slice 4
 * plan's "Risks / open call made here" for the provenance (audit pass/fail
 * bookkeeping) cut specifically. `variants[]`/`kitDeps[]`/`rulingsApplied[]`
 * and a `lastAuditReceipt` pointer remain deliberately absent (rejected —
 * see the plan's §1 rulings). `description` (dropped by that same ruling)
 * is reinstated, optional, by registry-covers-kit.md's owner addendum:
 * pull-registry extracts each component's native Figma description
 * deterministically, never hand-maintained in registry.json.
 *
 * `code-owned` (third kind): the component's real implementation is code
 * (e.g. a Three.js scene), so Figma carries only a flat screenshot and the
 * `@code-owned: <path>` marker in the component description. pull-registry
 * derives this kind + `codePath` deterministically from that marker; such
 * nodes are exempt from tier-0 (a screenshot can't satisfy binding rules) and
 * figma-to-code imports the existing component instead of generating one.
 */
export const RegistryEntrySchema = z.object({
  nodeId: z.string(),
  kind: z.enum(['kit', 'custom', 'code-owned']),
  status: z.enum(['draft', 'audit-clean', 'out-of-sync', 'orphaned']),
  lastSyncedAt: z.string().nullable(),
  variantMatrix: z.record(z.string(), z.array(z.string())),
  description: z.string().optional(),
  /** Repo-relative path to the code implementation; set only for `code-owned`. */
  codePath: z.string().optional(),
  /**
   * Kit-only adoption flag (directive 3 refined, 2026-07-08). `true` when a
   * project surface (a custom/code-owned component or a composed screen)
   * instances this kit master — figma-sync's reconcile walk derives it. Only
   * adopted kit is hard-audited/synced; raw (un-adopted) kit is the vendored
   * mirror nothing uses and stays advisory-only. Absent on custom/code-owned
   * (they're always in scope) and on raw kit.
   */
  adopted: z.boolean().optional()
})

/** design-memory-placement.md Mechanism 2: registry.json's file header — freshness metadata a reader uses to distinguish a fresh registry from a wholesale-rotted one. */
export const RegistryHeaderSchema = z.object({
  figmaFileVersion: z.string(),
  syncedAtWriteCount: z.number(),
  syncedAt: z.string()
})
