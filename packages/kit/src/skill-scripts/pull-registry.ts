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
import { isKitPageName, buildKitRegistryEntries } from '../design-kit/registry-reconcile.js'
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
  componentPropertyDefinitions?: Record<string, { type: string; variantOptions?: string[] }>
  description?: string
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
  for (const page of doc.document.children ?? []) {
    collect(page.children ?? [], page.name, doc, out)
  }
  return out
}

function collect(nodes: RestNode[], pageName: string, doc: RestDocument, out: MarshaledComponent[]): void {
  for (const node of nodes) {
    if (COMPONENT_NODE_TYPES.has(node.type)) {
      const meta = doc.components?.[node.id] ?? doc.componentSets?.[node.id]
      out.push({
        name: node.name,
        nodeId: node.id,
        pageName,
        componentPropertyDefinitions: node.componentPropertyDefinitions,
        ...(meta?.description ? { description: meta.description } : {})
      })
      continue // never descend into a component's own subtree
    }
    if (TRAVERSABLE_CONTAINER_TYPES.has(node.type) && node.children) {
      collect(node.children, pageName, doc, out)
    }
  }
}

/**
 * Pure composition: classify each marshaled component's kind by its page
 * name, then build the upsert target for newly-seen kit components. Custom
 * (project-owned) components are counted but never upserted here — that
 * stays figma-create's own per-task incremental write.
 */
export function buildPullRegistryResult({
  liveComponents,
  registry,
  now
}: {
  liveComponents: MarshaledComponent[]
  registry: { components?: Record<string, unknown> }
  now: string
}) {
  const existingNames = new Set(registryComponentNames(registry))
  const kitComponents = liveComponents.filter((c) => isKitPageName(c.pageName))
  const customComponentCount = liveComponents.length - kitComponents.length
  const newEntries = buildKitRegistryEntries({ liveKitComponents: kitComponents, existingNames }, now)
  return { newEntries, kitComponentCount: kitComponents.length, customComponentCount }
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

  const registry = readDesignJsonOrRebuild<{ components?: Record<string, unknown> }>(cwd, 'registry.json', {
    rebuild: () => ({ components: {} })
  })

  const now = new Date().toISOString()
  const { newEntries, kitComponentCount, customComponentCount } = buildPullRegistryResult({ liveComponents, registry, now })

  const merged = { ...registry, components: { ...(registry.components ?? {}), ...newEntries } }
  writeDesignJson(cwd, 'registry.json', merged)

  console.log(
    JSON.stringify({ kitComponentCount, customComponentCount, newEntryCount: Object.keys(newEntries).length }, null, 2)
  )
}
