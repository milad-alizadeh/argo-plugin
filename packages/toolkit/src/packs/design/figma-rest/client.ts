/**
 * Shared Figma REST client — token resolution + the one `GET /v1/files/:key`
 * call every pull-registry-adjacent skill-script needs. Extracted out of
 * `skill-scripts/pull-registry.ts` (where `refresh-card.ts` already reused it
 * directly) once a second in-toolkit consumer needed the exact same
 * token()/fetchFile() pair — see templates/rules/file-structure.md's "group
 * by domain" guidance: this is Figma-REST-transport, not registry-pull logic.
 *
 * `skills/resolve-comments/scripts/figma-comments.ts` duplicates the same
 * token() convention (FIGMA_TOKEN env, falling back to a gitignored
 * `.argo/figma-token` file, `X-Figma-Token` header) but is deliberately NOT
 * pointed at this client — it is a standalone, kit-independent script (zero
 * @argohq/toolkit import by design, run via `node --experimental-strip-types`
 * against source, not toolkit's built dist) so it can't collide with the
 * kit's own bin/exports/version churn. See that file's own header comment.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveRepoRoot } from '../../../lib/repo-root.js'

export const FIGMA_REST_API = 'https://api.figma.com/v1'

/** FIGMA_TOKEN env, falling back to a gitignored `<repo-root>/.argo/figma-token` file. */
export function token(cwd: string): string {
  const env = process.env.FIGMA_TOKEN
  if (env && env.trim()) return env.trim()
  try {
    return readFileSync(join(resolveRepoRoot(cwd), '.argo', 'figma-token'), 'utf8').trim()
  } catch {
    throw new Error(
      'No Figma token. Set FIGMA_TOKEN (needs the files:read scope) or write it to a\n' +
        'gitignored .argo/figma-token at the repo root. Never commit the token.'
    )
  }
}

export async function fetchFile<T>(fileKey: string, figmaToken: string): Promise<T> {
  const res = await fetch(`${FIGMA_REST_API}/files/${fileKey}`, { headers: { 'X-Figma-Token': figmaToken } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`GET /files/${fileKey} → ${res.status} ${res.statusText}\n${body}`)
  }
  return (await res.json()) as T
}
