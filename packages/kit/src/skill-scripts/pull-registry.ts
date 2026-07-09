#!/usr/bin/env node
/**
 * `argo design pull-registry` — deterministic enumeration of every kit and
 * custom component in the Figma design file, via the REST API
 * (`GET /v1/files/:key`), and a lean upsert of newly-seen kit components
 * into `design/registry.json`. Supersedes the MCP-walk enumeration step for
 * `figma-sync` (registry-covers-kit.md's Decision section) — no live Figma
 * session required, runnable standalone after designers touch the file
 * directly, or as part of a full sync.
 *
 * Token handling reuses the exact convention already used by
 * `skills/resolve-comments/scripts/figma-comments.ts` (the repo's only other
 * Figma REST consumer): `FIGMA_TOKEN` env, falling back to a gitignored
 * `<repo-root>/.argo/figma-token` file, `X-Figma-Token` header. Duplicated,
 * not shared (see the plan's Risks section) — a few lines of near-identical
 * token() logic, extracting a shared helper is a reasonable follow-up once a
 * THIRD REST consumer exists, not before (YAGNI).
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveRepoRoot } from '../lib/repo-root.js'
import { findDesignBlock } from './prepare-tier0-audit-options.js'
import { registryComponentNames } from '../design-kit/component-names.js'
import { kitPageIndices, buildKitRegistryEntries, detectChangedKitComponents, buildCodeOwnedEntries, buildScreenEntries, hasScreenAnnotation, resolveCodeOwnedPath, parseCodeOwnedPath, parseCodeOwnedFromAnnotations } from '../design-kit/registry-reconcile.js'
import { readDesignJsonOrRebuild, writeDesignJson } from './lib/write-design-json.js'

const API = 'https://api.figma.com/v1'

export function token(cwd: string): string {
  const env = process.env.FIGMA_TOKEN
  if (env && env.trim()) return env.trim()
  try {
    return readFileSync(join(resolveRepoRoot(cwd), '.argo', 'figma-token'), 'utf8').trim()
  } catch {
    throw new Error(
      'pull-registry: No Figma token. Set FIGMA_TOKEN (needs the files:read scope) or write it to a\n' +
        'gitignored .argo/figma-token at the repo root. Never commit the token.'
    )
  }
}

export async function fetchFile(fileKey: string, figmaToken: string): Promise<RestDocument> {
  const res = await fetch(`${API}/files/${fileKey}`, { headers: { 'X-Figma-Token': figmaToken } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`pull-registry: GET /files/${fileKey} → ${res.status} ${res.statusText}\n${body}`)
  }
  return (await res.json()) as RestDocument
}

type RestNode = {
  id: string
  name: string
  type: string
  children?: RestNode[]
  componentPropertyDefinitions?: Record<string, { type: string; variantOptions?: string[] }>
  annotations?: Array<{ label?: string; labelMarkdown?: string }>
}

export type MarshaledScreenFrame = {
  name: string
  nodeId: string
  annotations?: Array<{ label?: string; labelMarkdown?: string }>
}
type RestComponentMeta = { name: string; description?: string }
type RestDocument = {
  document: { children: RestNode[] }
  components?: Record<string, RestComponentMeta>
  componentSets?: Record<string, RestComponentMeta>
}

export type MarshaledComponent = {
  name: string
  nodeId: string
  pageName: string
  pageIndex: number
  componentPropertyDefinitions?: Record<string, { type: string; variantOptions?: string[] }>
  description?: string
  annotations?: Array<{ label?: string; labelMarkdown?: string }>
}

const COMPONENT_NODE_TYPES = new Set(['COMPONENT', 'COMPONENT_SET'])
// Recurse through these plain containers when collecting components (council
// traversal-depth finding, registry-covers-kit.md's Risks section) — never
// descend INTO a component's own subtree, only stop AT one.
const TRAVERSABLE_CONTAINER_TYPES = new Set(['SECTION', 'FRAME'])

/**
 * Walks `doc.document.children` (pages) × each page's node tree, keeping
 * every COMPONENT/COMPONENT_SET (recursing into SECTION/FRAME containers,
 * stopping at component boundaries), and joins in each component's native
 * Figma description from the document-root `components`/`componentSets`
 * metadata maps (owner addendum).
 */
export function marshalRestDocument(doc: RestDocument): MarshaledComponent[] {
  const out: MarshaledComponent[] = []
  const pages = doc.document.children ?? []
  pages.forEach((page, pageIndex) => {
    collect(page.children ?? [], page.name, pageIndex, doc, out)
  })
  return out
}

function collect(nodes: RestNode[], pageName: string, pageIndex: number, doc: RestDocument, out: MarshaledComponent[]): void {
  for (const node of nodes) {
    if (COMPONENT_NODE_TYPES.has(node.type)) {
      const meta = doc.components?.[node.id] ?? doc.componentSets?.[node.id]
      out.push({
        name: node.name,
        nodeId: node.id,
        pageName,
        pageIndex,
        componentPropertyDefinitions: node.componentPropertyDefinitions,
        ...(meta?.description ? { description: meta.description } : {}),
        ...(node.annotations ? { annotations: node.annotations } : {})
      })
      continue // never descend into a component's own subtree
    }
    if (TRAVERSABLE_CONTAINER_TYPES.has(node.type) && node.children) {
      collect(node.children, pageName, pageIndex, doc, out)
    }
  }
}

/**
 * Collects the top-level frames (direct children of a PAGE) that carry an
 * `@screen` Dev annotation — the screen-identity inputs `buildScreenEntries`
 * mirrors into `kind:"screen"` registry entries. Screens are plain FRAMEs with
 * no `description`, so unlike components the marker rides the annotation layer
 * (see `hasScreenAnnotation`). Top-level only: `isScreenFrame` in the audit is
 * frame-only (parent is PAGE), so a nested frame annotated `@screen` is not a
 * screen for registry purposes.
 */
export function marshalScreenFrames(doc: RestDocument): MarshaledScreenFrame[] {
  const out: MarshaledScreenFrame[] = []
  for (const page of doc.document.children ?? []) {
    for (const node of page.children ?? []) {
      if (node.type === 'FRAME' && hasScreenAnnotation(node.annotations)) {
        out.push({ name: node.name, nodeId: node.id, ...(node.annotations ? { annotations: node.annotations } : {}) })
      }
    }
  }
  return out
}

/**
 * Pure composition: classify each marshaled component's kind by its page
 * name, then build the upsert target for newly-seen kit components. Custom
 * (project-owned) components are counted but never upserted here — that
 * stays figma-create's own per-task incremental write.
 */
export function buildPullRegistryResult({
  liveComponents,
  liveScreenFrames = [],
  orderedPageNames,
  nonKitPages,
  registry,
  now
}: {
  liveComponents: MarshaledComponent[]
  liveScreenFrames?: MarshaledScreenFrame[]
  orderedPageNames: string[]
  nonKitPages?: string[]
  registry: { components?: Record<string, unknown> }
  now: string
}) {
  const existingNames = new Set(registryComponentNames(registry))
  const registryComponents = (registry.components ?? {}) as Record<string, any>
  const kitPages = kitPageIndices(orderedPageNames, nonKitPages)
  const kitComponents = liveComponents.filter((c) => kitPages.has(c.pageIndex))
  const newEntries = buildKitRegistryEntries({ liveKitComponents: kitComponents, existingNames }, now)
  const changed = detectChangedKitComponents({ liveKitComponents: kitComponents, registryComponents })
  // Code-owned entries are derived from the @code-owned marker across ALL live
  // components (marker overrides positional kit/custom classification), and
  // merged last so they win.
  const { written: codeOwnedEntries, changed: codeOwnedChanged } = buildCodeOwnedEntries({ liveComponents, registryComponents }, now)
  const codeOwnedComponentCount = liveComponents.filter((c) => resolveCodeOwnedPath(c)).length
  // Migration-pending: still carries the marker ONLY on the legacy description,
  // not yet mirrored to a Dev annotation. The one-shot migrate copies these
  // description markers → annotations; the description read drops a release later.
  const codeOwnedMigrationPending = liveComponents
    .filter((c) => parseCodeOwnedPath(c.description) && !parseCodeOwnedFromAnnotations(c.annotations))
    .map((c) => c.name)
  const customComponentCount = liveComponents.length - kitComponents.length - codeOwnedComponentCount
  // Screens: mirror live `@screen` Dev annotations on top-level frames into
  // kind:"screen" entries (same new-or-drifted upsert as code-owned).
  const { written: screenEntries, changed: screenChanged } = buildScreenEntries({ liveScreenFrames, registryComponents }, now)
  const screenFrameCount = liveScreenFrames.length
  return {
    newEntries,
    changed,
    codeOwnedEntries,
    codeOwnedChanged,
    screenEntries,
    screenChanged,
    kitComponentCount: kitComponents.length,
    customComponentCount,
    codeOwnedComponentCount,
    codeOwnedMigrationPending,
    screenFrameCount
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cwd = process.cwd()
  const designBlock = findDesignBlock(cwd)
  const fileKey = (designBlock?.figma as { projectFileKey?: unknown } | undefined)?.projectFileKey
  if (typeof fileKey !== 'string' || !fileKey) {
    console.error('pull-registry: no design.<app>.figma.projectFileKey configured, run setup-design first')
    process.exit(1)
  }

  const figmaToken = token(cwd)
  const doc = await fetchFile(fileKey, figmaToken)
  const liveComponents = marshalRestDocument(doc)
  const liveScreenFrames = marshalScreenFrames(doc)
  const orderedPageNames = (doc.document.children ?? []).map((p) => p.name)
  const nonKitPages = Array.isArray(designBlock?.nonKitPages) ? (designBlock!.nonKitPages as string[]) : undefined

  const registry = readDesignJsonOrRebuild<{ components?: Record<string, unknown> }>(cwd, 'registry.json', {
    rebuild: () => ({ components: {} })
  })

  const now = new Date().toISOString()
  const {
    newEntries,
    changed,
    codeOwnedEntries,
    codeOwnedChanged,
    screenEntries,
    screenChanged,
    kitComponentCount,
    customComponentCount,
    codeOwnedComponentCount,
    codeOwnedMigrationPending,
    screenFrameCount
  } = buildPullRegistryResult({
    liveComponents,
    liveScreenFrames,
    orderedPageNames,
    nonKitPages,
    registry,
    now
  })

  // Re-stamp components that drifted in Figma (manual edit): refresh their
  // variantMatrix/description and flag out-of-sync so the change-scoped
  // re-audit re-verifies exactly them, not the whole kit (directives 4 + 6).
  const restamped: Record<string, any> = {}
  for (const c of changed) {
    const prev = (registry.components as Record<string, any>)?.[c.name] ?? {}
    restamped[c.name] = {
      ...prev,
      variantMatrix: c.variantMatrix,
      ...(c.description !== undefined ? { description: c.description } : {}),
      ...(c.whenToUse !== undefined ? { whenToUse: c.whenToUse } : {}),
      status: 'out-of-sync',
      lastSyncedAt: now
    }
  }

  // code-owned entries merged last: the @code-owned marker overrides any
  // positional kit/custom classification for the same name.
  const merged = { ...registry, components: { ...(registry.components ?? {}), ...newEntries, ...restamped, ...codeOwnedEntries, ...screenEntries } }
  writeDesignJson(cwd, 'registry.json', merged)

  console.log(
    JSON.stringify(
      {
        kitComponentCount,
        customComponentCount,
        codeOwnedComponentCount,
        codeOwnedMigrationPending,
        screenFrameCount,
        newEntryCount: Object.keys(newEntries).length,
        changedCount: changed.length,
        changed: changed.map((c) => ({ name: c.name, reasons: c.reasons })),
        codeOwnedWritten: Object.keys(codeOwnedEntries),
        codeOwnedChanged: codeOwnedChanged.map((c) => ({ name: c.name, reasons: c.reasons })),
        screenWritten: Object.keys(screenEntries),
        screenChanged: screenChanged.map((c) => ({ name: c.name, reasons: c.reasons }))
      },
      null,
      2
    )
  )
}
