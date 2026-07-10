#!/usr/bin/env node
// Forbidden-word-list lint for docs prose. Reads its phrase list from
// templates/rules/documentation-style.md itself (single source of truth,
// per this repo's own engineering-principles rule) — never a hand-duplicated
// array that can drift from the rule doc.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

function flagValue(args, name) {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

const args = process.argv.slice(2)
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = flagValue(args, '--repo-root') ?? join(__dirname, '..', '..', '..')
const contentDir = flagValue(args, '--content-dir') ?? join(__dirname, '..', 'src/content/docs')

export function loadForbiddenPhrases(rulePath) {
  const source = readFileSync(rulePath, 'utf8')
  const match = source.match(/```forbidden-phrases\n([\s\S]*?)```/)
  if (!match) throw new Error(`no fenced "forbidden-phrases" block found in ${rulePath}`)
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

// reference/ is machine-generated verbatim from skills/*/SKILL.md and
// agents/*.md frontmatter descriptions — this style rule governs hand-shaped
// prose an editor writes, not source text copied from elsewhere in the repo.
function* walkMarkdownFiles(dir, isTopLevel = true) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (isTopLevel && entry.name === 'reference') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walkMarkdownFiles(full, false)
    } else if (/\.(md|mdx)$/.test(entry.name)) {
      yield full
    }
  }
}

export function lintFile(filePath, phrases) {
  const lines = readFileSync(filePath, 'utf8').split('\n')
  const hits = []
  lines.forEach((line, i) => {
    for (const phrase of phrases) {
      const matched =
        phrase === 'em dash'
          ? line.includes('—')
          : line.toLowerCase().includes(phrase.toLowerCase())
      if (matched) hits.push({ line: i + 1, phrase })
    }
  })
  return hits
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const phrases = loadForbiddenPhrases(join(repoRoot, 'templates/rules/documentation-style.md'))
  let hadFailures = false
  try {
    statSync(contentDir)
  } catch {
    console.log(`lint-docs-style: no content dir at ${contentDir}, nothing to lint`)
    process.exit(0)
  }
  for (const file of walkMarkdownFiles(contentDir)) {
    for (const hit of lintFile(file, phrases)) {
      hadFailures = true
      console.error(`${file}:${hit.line}: forbidden phrase "${hit.phrase}"`)
    }
  }
  process.exit(hadFailures ? 1 : 0)
}
