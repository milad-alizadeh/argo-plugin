/**
 * extractCard — reads the CARD template literal out of the real
 * hooks/session-context.mjs source, rather than a pasted copy, so evals
 * always score the wording actually shipped.
 */
import { readFileSync } from 'node:fs'

export function extractCard(sourcePath) {
  const source = readFileSync(sourcePath, 'utf8')
  const match = source.match(/const CARD = `([\s\S]*?)`/)
  if (!match) {
    throw new Error(`extractCard: no CARD template literal found in ${sourcePath}`)
  }
  return match[1]
}
