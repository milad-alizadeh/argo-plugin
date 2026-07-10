/**
 * `@argohq/pack-design`'s registry module (playbook-engine-phase1.md Slice 10,
 * step 28) — a thin wrapper over the existing kit modules that already own
 * screen registration and registry enumeration:
 *   - `@argohq/toolkit/skill-scripts/registry/register-screen` — `upsertScreenEntry`, the
 *     pure `kind:"screen"` upsert.
 *   - `@argohq/toolkit/skill-scripts/registry/pull-registry` — `fetchFile` (Figma REST),
 *     `marshalRestDocument`/`marshalScreenFrames`, and `buildPullRegistryResult`
 *     (the pure classify-and-diff step).
 *   - `@argohq/toolkit/design-kit/schemas` — `RegistryEntrySchema`, reused
 *     directly (never re-implemented) to validate every card this module
 *     hands back.
 *
 * Deliberately NOT wrapping `readDesignJsonOrRebuild`/`writeDesignJson` (kit's
 * internal `skill-scripts/lib/write-design-json.js`, not part of kit's public
 * `exports` map and out of scope to add per the plan's "minimal necessary
 * exports" instruction) — this module stays at the pure-data layer, same as
 * `upsertScreenEntry`/`buildPullRegistryResult` themselves. The future
 * `screen-create` playbook stage that calls `registerScreen`/`pullRegistry` is
 * responsible for reading/writing `design/registry.json` itself (or supplying
 * an already-loaded registry object), exactly as `register-screen.ts`'s own
 * CLI entrypoint composes the pure upsert with the file read/write around it.
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
 * entry. Delegates the actual upsert to `upsertScreenEntry` — this function
 * only (a) supplies the two fields `RegistryEntrySchema` requires that the
 * screen-specific upsert doesn't set (`lastSyncedAt`, `variantMatrix` — a
 * screen frame carries no variants, so it defaults to `{}`), and
 * (b) validates the result against the real schema before returning it, so a
 * caller can never receive a card the schema itself would reject.
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
  /**
   * Injectable override for kit's real `fetchFile` (the live Figma REST
   * call) — defaults to the real implementation. Same pattern as
   * `design-rules-check`'s injected `readFigma`: tests supply a fake here
   * rather than reaching for module-mocking, which this repo's test runner
   * (`bun test`, not full vitest) doesn't support (`vi.mock`/`vi.importActual`
   * are unavailable).
   */
  fetchFile?: typeof fetchFile
}

/**
 * Reads the live Figma file (`fetchFile`) and derives the same
 * new-entry/changed-entry classification `pull-registry.ts`'s CLI entrypoint
 * writes to disk (`buildPullRegistryResult`) — without performing the disk
 * write itself (see the module doc comment above). Composition only: no
 * marshaling/classification logic is reimplemented here.
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
