import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, renameSync: vi.fn(actual.renameSync) }
})

const { writeDesignJson } = await import('../scripts/write-design-json.mjs')
const { renameSync: renameSpy } = await import('node:fs')

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

  it('writes via a temp file + rename, not a direct write to the final path (crash-mid-write safety)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'write-design-json-'))
    try {
      renameSpy.mockClear()
      writeDesignJson(cwd, 'registry.json', { components: {} })
      expect(renameSpy).toHaveBeenCalledTimes(1)
      const [source, destination] = renameSpy.mock.calls[0]
      expect(destination).toBe(join(cwd, 'design', 'registry.json'))
      expect(source).not.toBe(destination)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
