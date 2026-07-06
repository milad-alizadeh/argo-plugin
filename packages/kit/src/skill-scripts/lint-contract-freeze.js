#!/usr/bin/env node
/**
 * P1 freeze lint CLI (C3c, design-pipeline-efficiency-ruling.md): fs/argv
 * glue only — the pure decision (`lintContractFreeze`) lives in the kit's
 * `design-kit/region-contract.js` and is unit-tested there.
 * Usage: argo design lint-contract-freeze <previous.json|-> <next.json>
 * (previous may be omitted/absent for a first-ever freeze).
 */
import { readFileSync, existsSync } from 'node:fs'
import { lintContractFreeze } from '../design-kit/region-contract.js'

const [previousPath, nextPath] = process.argv.slice(2)
if (!nextPath) {
  console.error('lint-contract-freeze: usage: argo design lint-contract-freeze <previous.json|-> <next.json>')
  process.exit(1)
}

const previous = previousPath && previousPath !== '-' && existsSync(previousPath) ? JSON.parse(readFileSync(previousPath, 'utf8')) : undefined
const next = JSON.parse(readFileSync(nextPath, 'utf8'))

const result = lintContractFreeze(previous, next)
if (!result.ok) {
  console.error(`lint-contract-freeze: BLOCKED — ${result.reason}`)
  process.exit(1)
}
console.log('lint-contract-freeze: ok')
