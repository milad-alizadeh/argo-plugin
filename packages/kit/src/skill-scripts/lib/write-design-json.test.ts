import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { writeDesignJson } = await import('./write-design-json.js')

describe('writeDesignJson (atomic temp-file+rename write)', () => {
  it('writes the final file with no stray temp file left behind', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'write-design-json-'))
    try {
      writeDesignJson(cwd, 'registry.json', { components: {} })
      const onDisk = JSON.parse(readFileSync(join(cwd, 'design', 'registry.json'), 'utf8'))
      expect(onDisk).toEqual({ components: {} })
      const files = readdirSync(join(cwd, 'design'))
      expect(files).toEqual(['registry.json'])
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('leaves no stray .tmp-* file and exact final content, on a pre-existing final file (crash-mid-write safety)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'write-design-json-'))
    try {
      writeDesignJson(cwd, 'registry.json', { components: { old: true } })
      writeDesignJson(cwd, 'registry.json', { components: { fresh: true } })
      const files = readdirSync(join(cwd, 'design'))
      expect(files).toEqual(['registry.json'])
      const staleTemp = files.find((f) => f.startsWith('.registry.json.tmp-'))
      expect(staleTemp).toBeUndefined()
      const onDisk = JSON.parse(readFileSync(join(cwd, 'design', 'registry.json'), 'utf8'))
      expect(onDisk).toEqual({ components: { fresh: true } })
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
