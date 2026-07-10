// Hash-manifest read/write/compare for AI-owned prose pages. Pure functions,
// shared by the integrator's doc-sync instructions and the /argo:docs-refresh
// skill — the single implementation both surfaces drive.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

export function hashOf(content) {
  return createHash('sha256').update(content).digest('hex')
}

export function readManifest(manifestPath) {
  if (!existsSync(manifestPath)) return {}
  return JSON.parse(readFileSync(manifestPath, 'utf8'))
}

export function writeManifest(manifestPath, manifest) {
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

/**
 * A page with no manifest entry is treated as human-owned (the safe
 * default) — only a page whose recorded hash matches its current content is
 * AI-owned.
 */
export function isAiOwned(pagePath, currentContent, manifest) {
  const recorded = manifest[pagePath]
  if (!recorded) return false
  return recorded === hashOf(currentContent)
}

export function recordGenerated(pagePath, content, manifest) {
  return { ...manifest, [pagePath]: hashOf(content) }
}

/** Removes a page from AI-owned tracking so future syncs stop flagging it. */
export function markHumanOwned(pagePath, manifest) {
  const { [pagePath]: _dropped, ...rest } = manifest
  return rest
}

/** Every manifest-tracked page whose on-disk content no longer matches its recorded hash. */
export function listEditedPages(manifest, readCurrentContent) {
  return Object.keys(manifest).filter((pagePath) => {
    let current
    try {
      current = readCurrentContent(pagePath)
    } catch {
      return false
    }
    return manifest[pagePath] !== hashOf(current)
  })
}
