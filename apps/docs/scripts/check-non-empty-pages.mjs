#!/usr/bin/env node
// Guards against a class of bug that already shipped once: a content
// pipeline step (rehype-mermaid needing a headless browser CI never
// installed) can throw mid-render and Astro/Starlight swallows it, emitting
// an empty <div class="sl-markdown-content"> instead of failing the build.
// `astro build` exits 0 either way — only inspecting the actual built HTML
// catches it.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const DIST_DIR = join(__dirname, '..', 'dist')
const MIN_CONTENT_LENGTH = 40

function* walkHtmlFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walkHtmlFiles(full)
    else if (entry.name === 'index.html') yield full
  }
}

export function findEmptyContentPages(distDir) {
  const empty = []
  for (const file of walkHtmlFiles(distDir)) {
    const html = readFileSync(file, 'utf8')
    const match = html.match(/<div class="sl-markdown-content">([\s\S]*?)<\/div><footer/)
    if (!match) continue // not a Starlight content page (e.g. the custom landing route)
    const bodyText = match[1].replace(/<[^>]+>/g, '').trim()
    if (bodyText.length < MIN_CONTENT_LENGTH) empty.push(file)
  }
  return empty
}

if (import.meta.url === `file://${process.argv[1]}`) {
  statSync(DIST_DIR) // throws with a clear error if dist/ doesn't exist yet
  const empty = findEmptyContentPages(DIST_DIR)
  if (empty.length) {
    console.error(`check-non-empty-pages: ${empty.length} page(s) built with empty content:`)
    for (const file of empty) console.error(`  ${file}`)
    process.exit(1)
  }
  console.log('check-non-empty-pages: OK')
}
