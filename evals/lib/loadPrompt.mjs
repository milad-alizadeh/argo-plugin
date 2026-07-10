/**
 * loadPrompt — reads one or more prompt-surface files (agent bodies, SKILL
 * docs, rule templates) fresh from disk on every call, so evals always score
 * the wording actually shipped, never a pasted snapshot.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

/**
 * @param {string|string[]} relativePaths one or more paths relative to the repo root
 * @returns {string} the file contents concatenated with a blank-line separator
 */
export function loadPrompt(relativePaths) {
  const paths = Array.isArray(relativePaths) ? relativePaths : [relativePaths]
  return paths
    .map((relativePath) => readFileSync(join(REPO_ROOT, relativePath), 'utf8'))
    .join('\n\n')
}
