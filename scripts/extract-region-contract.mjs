#!/usr/bin/env node
/**
 * P1 extract CLI (build-design-workflow.md, C1 fix): fs/argv glue only —
 * the pure shape function (`buildRegionContract`, which wraps
 * `flattenToRegions`) lives in `packages/figma-design-kit/region-contract.js`
 * and is unit-tested there, off-Figma. This script never calls Figma itself;
 * the caller pipes the MCP `get_metadata` output in as either a normalized
 * JSON metadata tree (`{name, type, layoutMode?, children: [...]}`) or the
 * raw XML `get_metadata` returns (auto-detected and adapted via
 * `parseMetadataXml`, the C1-gap ingest step) via a file arg or stdin.
 */
import { readFileSync } from 'node:fs'
import { buildRegionContract } from '../packages/figma-design-kit/region-contract.js'
import { parseMetadataXml } from '../packages/figma-design-kit/xml-metadata-adapter.js'

const [treePath, screen, wireframeNodeId, figmaFileVersion] = process.argv.slice(2)
if (!screen || !wireframeNodeId || !figmaFileVersion) {
  console.error(
    'extract-region-contract: usage: node scripts/extract-region-contract.mjs <tree.json|tree.xml|-> <screen> <wireframeNodeId> <figmaFileVersion>'
  )
  process.exit(1)
}

const raw = treePath && treePath !== '-' ? readFileSync(treePath, 'utf8') : readFileSync(0, 'utf8')
const tree = raw.trim().startsWith('<') ? parseMetadataXml(raw) : JSON.parse(raw)
console.log(JSON.stringify(buildRegionContract(tree, { screen, wireframeNodeId, figmaFileVersion }), null, 2))
