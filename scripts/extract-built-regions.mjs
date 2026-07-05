#!/usr/bin/env node
/**
 * P5 extract CLI, built-screen side (build-design-workflow.md, C1 fix):
 * fs/argv glue only — the pure shape function (`buildBuiltRegions`, the same
 * promotion rule as the wireframe extractor) lives in
 * `packages/figma-design-kit/region-contract.js` and is unit-tested there,
 * off-Figma. This script never calls Figma itself; the caller pipes the MCP
 * `get_metadata` output for the BUILT screen in as a normalized JSON
 * metadata tree (`{name, type, layoutMode?, componentName?, children: [...]}`)
 * via a file arg or stdin.
 */
import { readFileSync } from 'node:fs'
import { buildBuiltRegions } from '../packages/figma-design-kit/region-contract.js'

const [treePath] = process.argv.slice(2)

const raw = treePath && treePath !== '-' ? readFileSync(treePath, 'utf8') : readFileSync(0, 'utf8')
const tree = JSON.parse(raw)
console.log(JSON.stringify({ builtRegions: buildBuiltRegions(tree) }, null, 2))
