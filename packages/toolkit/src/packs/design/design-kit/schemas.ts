import { z } from 'zod'

export const StoryMapEntrySchema = z.object({
  componentKey: z.string(),
  nodeId: z.string(),
  storyId: z.string(),
  importPath: z.string(),
  propMapping: z.record(z.string(), z.unknown())
})

/**
 * `nodeId` reuses `StoryMapEntrySchema`'s field name/type so the
 * registry<->story-map join key is schema-enforced. `status` is Figma-side
 * lifecycle ONLY — `synced`/`coded` are derived, never stored.
 *
 * `code-owned` (third kind): the component's real implementation is code
 * (e.g. a Three.js scene), so Figma carries only a flat screenshot and the
 * `@code-owned: <path>` marker in the component description. pull-registry
 * derives this kind + `codePath` deterministically from that marker; such
 * nodes are exempt from design-rules (a screenshot can't satisfy binding
 * rules) and figma-to-code imports the existing component instead of
 * generating one.
 */
export const RegistryEntrySchema = z.object({
  nodeId: z.string(),
  kind: z.enum(['kit', 'custom', 'code-owned', 'screen']),
  status: z.enum(['draft', 'audit-clean', 'out-of-sync', 'orphaned']),
  lastSyncedAt: z.string().nullable(),
  variantMatrix: z.record(z.string(), z.array(z.string())),
  description: z.string().optional(),
  /** Repo-relative path to the code implementation; set only for `code-owned`. */
  codePath: z.string().optional(),
  /**
   * Usage guidance synced from the component's `@when-to-use:` marker;
   * pull-registry derives it, never hand-maintained here. Rides the compact
   * registry-lookup index so a resolving designer can tell WHICH component
   * is the intended solution for a region/pattern.
   */
  whenToUse: z.string().optional(),
  /**
   * Kit-only adoption flag: true when a project surface instances this kit
   * master. Only adopted kit is hard-audited/synced; raw (un-adopted) kit is
   * the vendored mirror nothing uses and stays advisory-only. Absent on
   * custom/code-owned (always in scope) and on raw kit.
   */
  adopted: z.boolean().optional(),
  /**
   * Canonical default strings this component legitimately renders when its
   * text is not overridden. The `untraced-copy` rule accepts a TEXT node
   * whose content matches a copy-deck entry OR one of these documented
   * defaults; an undocumented master placeholder leaking into a composed
   * screen is exactly the stale-copy defect the rule catches.
   */
  defaultStrings: z.array(z.string()).optional()
})

/** registry.json's file header: freshness metadata a reader uses to distinguish a fresh registry from a wholesale-rotted one. */
export const RegistryHeaderSchema = z.object({
  figmaFileVersion: z.string(),
  syncedAtWriteCount: z.number(),
  syncedAt: z.string()
})
