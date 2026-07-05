import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { readDesignJsonOrRebuild } from '../scripts/write-design-json.mjs'

describe('readDesignJsonOrRebuild (schema-validate-or-rebuild read contract)', () => {
  it('returns the parsed file when it is well-formed', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'read-design-json-'))
    try {
      mkdirSync(join(cwd, 'design'), { recursive: true })
      writeFileSync(join(cwd, 'design', 'registry.json'), JSON.stringify({ components: {} }))
      const result = readDesignJsonOrRebuild(cwd, 'registry.json', { rebuild: () => ({ components: { fallback: true } }) })
      expect(result).toEqual({ components: {} })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('rebuilds (never throws) on a truncated/malformed JSON file', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'read-design-json-'))
    try {
      mkdirSync(join(cwd, 'design'), { recursive: true })
      writeFileSync(join(cwd, 'design', 'registry.json'), '{ "components": ')
      const result = readDesignJsonOrRebuild(cwd, 'registry.json', { rebuild: () => ({ components: { fallback: true } }) })
      expect(result).toEqual({ components: { fallback: true } })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('rebuilds on a well-formed file that fails schema validation', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'read-design-json-'))
    try {
      mkdirSync(join(cwd, 'design'), { recursive: true })
      writeFileSync(join(cwd, 'design', 'registry.json'), JSON.stringify({ wrongShape: true }))
      const schema = z.object({ components: z.record(z.string(), z.unknown()) })
      const result = readDesignJsonOrRebuild(cwd, 'registry.json', { schema, rebuild: () => ({ components: { fallback: true } }) })
      expect(result).toEqual({ components: { fallback: true } })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
