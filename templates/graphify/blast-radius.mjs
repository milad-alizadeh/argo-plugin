#!/usr/bin/env node
/**
 * Emit the graphify blast-radius hot-set → .argo/blast-radius.json (an array of repo-
 * relative paths with the most DEPENDENTS). build-slice's shouldReview escalates to an
 * independent review when a slice touches one — the risky-path glob's data-derived cousin,
 * catching the UNNAMED central module the hand-named glob misses.
 *
 * CORRECTNESS: counts in-degree over DEPENDENCY relations only (imports/calls/references),
 * NEVER structural `contains` edges — otherwise config files (package.json → its fields)
 * dominate and the signal is garbage. On a shallow graph with few real dep edges this
 * emits little or nothing → it simply adds no escalation until the graph is rich enough.
 * Run by refresh-graph.sh after the graph is (re)built, on the default branch.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DEP_RELATIONS = new Set([
  'imports', 'imports_from', 'calls', 'references', 'depends_on', 'uses', 'extends', 'implements',
])
const TOP_N = 25
const MIN_DEPENDENTS = 3 // below this it isn't a meaningful hub — don't flag it

// Find every graphify-out/graph.json in the repo (monorepo: one per workspace).
function findGraphs(dir, hits = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'graphify-out') {
        try { readFileSync(join(p, 'graph.json')); hits.push(join(p, 'graph.json')) } catch { /* none */ }
      } else findGraphs(p, hits)
    }
  }
  return hits
}

const hot = new Set()
for (const graphPath of findGraphs(process.cwd())) {
  let g
  try { g = JSON.parse(readFileSync(graphPath, 'utf8')) } catch { continue }
  const pathById = Object.fromEntries((g.nodes ?? []).map((n) => [n.id, n.source_file]))
  const dependents = {}
  for (const l of g.links ?? []) {
    if (DEP_RELATIONS.has(l.relation)) dependents[l.target] = (dependents[l.target] ?? 0) + 1
  }
  Object.entries(dependents)
    .filter(([, d]) => d >= MIN_DEPENDENTS)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .forEach(([id]) => { if (pathById[id]) hot.add(pathById[id]) })
}

mkdirSync('.argo', { recursive: true })
writeFileSync('.argo/blast-radius.json', JSON.stringify([...hot], null, 2) + '\n')
console.log(`blast-radius: ${hot.size} high-impact path(s) → .argo/blast-radius.json`)
