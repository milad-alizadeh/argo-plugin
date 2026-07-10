// One place owns the design/<file> write contract; every receipt writer shares it.

import { writeFileSync, mkdirSync, renameSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Writes to a temp file then renames over the final path — POSIX rename is atomic,
// so a crash mid-write never leaves a truncated/partial file.
export function writeDesignJson(cwd: string, filename: string, data: unknown): void {
  const dir = join(cwd, 'design')
  mkdirSync(dir, { recursive: true })
  const destination = join(dir, filename)
  const tempPath = join(dir, `.${filename}.tmp-${process.pid}-${Date.now()}`)
  writeFileSync(tempPath, JSON.stringify(data, null, 2))
  renameSync(tempPath, destination)
}

/**
 * Schema-validate-or-rebuild read contract (design-memory-placement.md A4/
 * step 3, mirroring design-guard-record.js's corrupt-state recovery): on a
 * missing file, a JSON parse failure, or (when `schema` is passed) a schema
 * validation failure, log an advisory to stderr and return `rebuild()`'s
 * result rather than throwing or crashing — this is a read-time recovery
 * path, not a hard gate.
 */
export function readDesignJsonOrRebuild<T>(
  cwd: string,
  filename: string,
  { schema, rebuild }: { schema?: { safeParse: (v: unknown) => { success: boolean; data?: T } }; rebuild: () => T }
): T {
  const path = join(cwd, 'design', filename)
  if (!existsSync(path)) {
    process.stderr.write(`readDesignJsonOrRebuild: ${filename} is absent — rebuilding.\n`)
    return rebuild()
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    process.stderr.write(`readDesignJsonOrRebuild: ${filename} is malformed JSON — rebuilding.\n`)
    return rebuild()
  }
  if (schema) {
    const result = schema.safeParse(parsed)
    if (!result.success) {
      process.stderr.write(`readDesignJsonOrRebuild: ${filename} failed schema validation — rebuilding.\n`)
      return rebuild()
    }
    return result.data as T
  }
  return parsed as T
}
