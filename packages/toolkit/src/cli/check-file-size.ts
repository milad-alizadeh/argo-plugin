import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface OversizedFile {
  file: string
  lines: number
}

const DEFAULT_LIMIT = 150

function listTsFiles(rootDir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(rootDir)) {
    const full = join(rootDir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...listTsFiles(full))
      continue
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

export function findOversizedFiles(rootDir: string, limit = DEFAULT_LIMIT): OversizedFile[] {
  const results: OversizedFile[] = []
  for (const full of listTsFiles(rootDir)) {
    const lines = readFileSync(full, 'utf8').split('\n').length
    if (lines > limit) {
      results.push({ file: relative(rootDir, full), lines })
    }
  }
  return results.sort((a, b) => b.lines - a.lines)
}

// Advisory report only (templates/rules/file-structure.md "150 line" soft
// ceiling has 14+ pre-existing violations) — never exits non-zero, so this
// stays a `bun run check:file-size` report, not a build/CI gate.
function main() {
  const rootDir = process.argv[2] ?? join(fileURLToPath(new URL('.', import.meta.url)), '..')
  const oversized = findOversizedFiles(rootDir)
  if (oversized.length === 0) {
    console.log(`No files over ${DEFAULT_LIMIT} lines.`)
    return
  }
  console.log(`${oversized.length} file(s) over the ${DEFAULT_LIMIT}-line soft ceiling:`)
  for (const { file, lines } of oversized) {
    console.log(`  ${lines}\t${file}`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
