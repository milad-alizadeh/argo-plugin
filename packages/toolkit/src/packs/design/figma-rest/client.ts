/**
 * Shared Figma REST client: token resolution + the one `GET /v1/files/:key`
 * call every pull-registry-adjacent skill-script needs.
 *
 * The resolve-comments skill's own script deliberately duplicates this
 * token() convention rather than importing this client — it is a
 * standalone, kit-independent script (zero @argohq/toolkit import by
 * design) so it can't collide with the kit's own bin/exports/version churn.
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
