/**
 * `@argohq/pack-design`'s registry module — a thin wrapper over existing kit
 * modules that already own screen registration and registry enumeration.
 * Deliberately does not wrap the disk read/write step: this module stays at
 * the pure-data layer, and the caller is responsible for reading/writing
 * `design/registry.json` itself (or supplying an already-loaded object).
 */
import { upsertScreenEntry } from '../skill-scripts/registry/register-screen.js'
import {
  fetchFile,
  marshalRestDocument,
  marshalScreenFrames,
  buildPullRegistryResult,
  token as resolveFigmaToken
} from '../skill-scripts/registry/pull-registry.js'
import { RegistryEntrySchema } from '../design-kit/schemas.js'
import type { z } from 'zod'

/** Re-exported, not redefined — callers validate/consume the exact same schema kit's own registry-reconcile code validates against. */
export { RegistryEntrySchema }
export type RegistryCard = z.infer<typeof RegistryEntrySchema>

export type RegistryDoc = { components?: Record<string, unknown> }

export interface RegisterScreenInput {
  /** The registry document to upsert into. Defaults to an empty registry. */
  registry?: RegistryDoc
  nodeId: string
  name: string
  status?: string
  /** ISO timestamp stamped onto the card as `lastSyncedAt` when not already present. Defaults to `new Date().toISOString()`. */
  now?: string
}

export interface RegisterScreenResult {
  /** The full registry document with `name`'s entry upserted. */
  registry: { components: Record<string, unknown> }
  /** The single upserted entry, schema-validated. */
  card: RegistryCard
}

/**
 * Registers (or re-registers) a screen frame as a `kind:"screen"` registry
 * entry, filling in the schema fields the screen-specific upsert doesn't set,
 * then validates the result so a caller can never receive a card the schema
 * would reject.
 */
export function registerScreen(input: RegisterScreenInput): RegisterScreenResult {
  const { registry = {}, nodeId, name, status, now = new Date().toISOString() } = input

  const merged = upsertScreenEntry(registry, { nodeId, name, ...(status ? { status } : {}) })
  const upserted = merged.components[name] as Record<string, unknown>

  const card = RegistryEntrySchema.parse({
    ...upserted,
    lastSyncedAt: upserted.lastSyncedAt ?? now,
    variantMatrix: upserted.variantMatrix ?? {}
  })

  return {
    registry: { ...merged, components: { ...merged.components, [name]: card } },
    card
  }
}

export interface PullRegistryInput {
  fileKey: string
  figmaToken: string
  /** Ordered page names, used to classify kit vs. non-kit pages. Defaults to the fetched document's own page order. */
  orderedPageNames?: string[]
  nonKitPages?: string[]
  registry: RegistryDoc
  now?: string
  /** Injectable override for the live Figma REST call; tests fake it since `bun test` has no `vi.mock`. */
  fetchFile?: typeof fetchFile
}

/**
 * Reads the live Figma file and derives the same new-entry/changed-entry
 * classification the CLI entrypoint writes to disk, without performing the
 * disk write itself. Composition only: no marshaling/classification logic
 * is reimplemented here.
 */
export async function pullRegistry(input: PullRegistryInput): Promise<ReturnType<typeof buildPullRegistryResult>> {
  const doFetch = input.fetchFile ?? fetchFile
  const doc = await doFetch(input.fileKey, input.figmaToken)
  const liveComponents = marshalRestDocument(doc)
  const liveScreenFrames = marshalScreenFrames(doc)
  const orderedPageNames = input.orderedPageNames ?? (doc.document.children ?? []).map((p) => p.name)
  const now = input.now ?? new Date().toISOString()

  return buildPullRegistryResult({
    liveComponents,
    liveScreenFrames,
    orderedPageNames,
    nonKitPages: input.nonKitPages,
    registry: input.registry,
    now
  })
}

/** Re-exported so a caller building `PullRegistryInput.figmaToken` can reuse kit's own token-resolution convention (`FIGMA_TOKEN` env, falling back to `.argo/figma-token`) instead of reimplementing it. */
export { resolveFigmaToken }
