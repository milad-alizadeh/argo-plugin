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
  syncTimestamp: z.string()
})

/** D1: component key, node id, story id, import path, prop mapping */
export const StoryMapEntrySchema = z.object({
  componentKey: z.string(),
  nodeId: z.string(),
  storyId: z.string(),
  importPath: z.string(),
  propMapping: z.record(z.string(), z.unknown())
})
