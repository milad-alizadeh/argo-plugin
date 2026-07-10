#!/usr/bin/env node
/**
 * `argo design refresh-card --component <name>` — closes the dogfood gap
 * `pull-registry` leaves open by design: pull-registry only upserts kit,
 * code-owned, and screen entries (registry-covers-kit.md's Decision section),
 * never a CUSTOM component's card. A custom card is written once at creation
 * (design-component's per-task incremental upsert) and then goes stale —
 * live case: SessionCard's truncation fix + a new `@when-to-use` Dev
 * annotation never reached `design/registry.json`, `lastSyncedAt` stuck at
 * the creation date. This verb is the sanctioned single-component refresh:
 * re-fetch the live Figma component, re-derive variantMatrix/notes(or
 * description)/whenToUse, re-stamp `lastSyncedAt`, and write back the ONE
 * named entry — it never creates a new entry (that stays design-component's
 * job) and never touches any other component.
 *
 * REST fetch + token() convention are reused directly from `pull-registry.ts`
 * (the file's own doc comment already earmarks a shared helper once a THIRD
 * REST consumer exists — this is the second, so straight reuse, no new
 * extraction needed).
 */

import { fetchFile, marshalRestDocument, token, type MarshaledComponent } from './pull-registry.js'
import { findDesignBlock } from './prepare-design-rules-audit-options.js'
import { extractVariantMatrix, resolveWhenToUse } from '../design-kit/registry-reconcile.js'
import { readDesignJsonOrRebuild, writeDesignJson } from './lib/write-design-json.js'

/** Finds a live COMPONENT/COMPONENT_SET by exact name across every marshaled component (marshalRestDocument already filters to those two node types). */
export function findLiveComponent(liveComponents: MarshaledComponent[], name: string): MarshaledComponent | undefined {
  return liveComponents.find((c) => c.name === name)
}

/**
 * Pure composition: given the live component and its EXISTING registry
 * entry, produce the refreshed entry. Refreshes variantMatrix (same
 * `extractVariantMatrix` reader `registry-reconcile.ts` uses for kit
 * entries), `whenToUse` from a live `@when-to-use` Dev annotation (falls
 * back to the legacy description marker via `resolveWhenToUse`), the
 * entry's own notes-shaped field (`notes` on a custom entry, `description`
 * on a kit/code-owned one — whichever the existing entry already carries;
 * never adds a field the entry didn't have), `nodeId` (heals a moved node),
 * and `lastSyncedAt`. Throws when there is no existing entry — this verb
 * REFRESHES, it does not create.
 */
export function buildRefreshedEntry({
  liveComponent,
  existingEntry,
  now
}: {
  liveComponent: MarshaledComponent
  existingEntry: Record<string, unknown> | undefined
  now: string
}): Record<string, unknown> {
  if (!existingEntry) {
    throw new Error(
      `refresh-card: no existing registry entry for "${liveComponent.name}" — refresh-card only refreshes an existing card; ` +
        `use the component-create flow for a brand-new component.`
    )
  }
  const variantMatrix = extractVariantMatrix(liveComponent.componentPropertyDefinitions)
  const whenToUse = resolveWhenToUse(liveComponent)
  const notesField: 'notes' | 'description' | undefined =
    'notes' in existingEntry ? 'notes' : 'description' in existingEntry ? 'description' : undefined

  return {
    ...existingEntry,
    nodeId: liveComponent.nodeId,
    variantMatrix,
    ...(notesField && liveComponent.description ? { [notesField]: liveComponent.description } : {}),
    ...(whenToUse ? { whenToUse } : {}),
    lastSyncedAt: now
  }
}

export interface CliArgs {
  component?: string
  help?: boolean
}

export function parseCliArgs(args: string[]): CliArgs {
  if (args.includes('--help') || args.includes('-h')) return { help: true }
  const KNOWN_FLAGS = ['--component']
  const unknown = args.filter((a) => a.startsWith('--') && !KNOWN_FLAGS.includes(a))
  if (unknown.length > 0) throw new Error(`refresh-card: unrecognized flag(s) ${unknown.join(', ')} — known: --component, --help`)

  const value = (name: string) => {
    const i = args.indexOf(name)
    return i === -1 ? undefined : args[i + 1]
  }
  const component = value('--component')
  return { ...(component ? { component } : {}) }
}

const USAGE = `refresh-card — refresh ONE existing custom component's design/registry.json card
after a component-edit run (pull-registry only upserts kit/code-owned/screen entries by
design; custom cards otherwise go stale after creation).

Re-fetches the live Figma component, re-derives variantMatrix + whenToUse (+ notes/description
when the entry already carries one), re-stamps lastSyncedAt, and writes back the one named
entry. Refuses to create a new entry — that stays the component-create flow's job.

Usage:
  refresh-card --component <name>

Flags:
  --component <name>  exact registry component name to refresh (required).
  --help, -h          show this help.

Token: FIGMA_TOKEN env, falling back to a gitignored .argo/figma-token file (same convention
as pull-registry).`

if (import.meta.url === `file://${process.argv[1]}`) {
  let parsed: CliArgs
  try {
    parsed = parseCliArgs(process.argv.slice(2))
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`)
    process.exit(2)
  }
  if (parsed.help) {
    console.log(USAGE)
    process.exit(0)
  }
  if (!parsed.component) {
    process.stderr.write('refresh-card: --component <name> is required\n')
    process.exit(2)
  }

  const cwd = process.cwd()
  const designBlock = findDesignBlock(cwd)
  const fileKey = (designBlock?.figma as { projectFileKey?: unknown } | undefined)?.projectFileKey
  if (typeof fileKey !== 'string' || !fileKey) {
    console.error('refresh-card: no design.<app>.figma.projectFileKey configured, run setup-design first')
    process.exit(1)
  }

  const registry = readDesignJsonOrRebuild<{ components?: Record<string, unknown> }>(cwd, 'registry.json', {
    rebuild: () => ({ components: {} })
  })
  const existingEntry = (registry.components ?? {})[parsed.component] as Record<string, unknown> | undefined
  if (!existingEntry) {
    process.stderr.write(
      `refresh-card: no existing registry entry for "${parsed.component}" — refresh-card only refreshes an existing card; ` +
        `use the component-create flow for a brand-new component.\n`
    )
    process.exit(1)
  }

  const figmaToken = token(cwd)
  const doc = await fetchFile(fileKey, figmaToken)
  const liveComponents = marshalRestDocument(doc)
  const liveComponent = findLiveComponent(liveComponents, parsed.component)
  if (!liveComponent) {
    process.stderr.write(`refresh-card: no live COMPONENT/COMPONENT_SET named "${parsed.component}" found in the Figma file\n`)
    process.exit(1)
  }

  const now = new Date().toISOString()
  const refreshed = buildRefreshedEntry({ liveComponent, existingEntry, now })
  const merged = { ...registry, components: { ...(registry.components ?? {}), [parsed.component]: refreshed } }
  writeDesignJson(cwd, 'registry.json', merged)

  console.log(JSON.stringify({ component: parsed.component, refreshed }, null, 2))
}
