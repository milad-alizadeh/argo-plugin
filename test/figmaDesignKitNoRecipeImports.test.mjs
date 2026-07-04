import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MECHANISM_DIR = join(import.meta.dirname, '..', 'packages', 'figma-design-kit')
// Only real import/export statements count as a leak — prose in doc comments
// (e.g. naming the sibling recipe package for context) is not an import.
const FORBIDDEN_PATTERNS = [
  /(?:from|require\()\s*['"]figma-design-kit-shadcn-tailwind['"]/,
  /(?:from|require\()\s*['"][^'"]*templates\/design\/recipes[^'"]*['"]/
]

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
}

describe('figma-design-kit never imports recipe knowledge', () => {
  it('has no source file referencing the recipe package or templates/design/recipes', () => {
    const offenders = []
    for (const file of sourceFiles(MECHANISM_DIR)) {
      const text = readFileSync(file, 'utf8')
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(text)) offenders.push({ file, pattern: pattern.toString() })
      }
    }
    expect(offenders).toEqual([])
  })
})
