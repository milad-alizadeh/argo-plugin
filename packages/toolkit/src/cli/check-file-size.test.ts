import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findOversizedFiles } from './check-file-size.js'

describe('findOversizedFiles', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('flags a .ts file over the line-count ceiling', () => {
    dir = mkdtempSync(join(tmpdir(), 'check-file-size-'))
    writeFileSync(join(dir, 'big.ts'), Array.from({ length: 200 }, (_, i) => `const x${i} = ${i}`).join('\n'))

    const result = findOversizedFiles(dir)

    expect(result).toEqual([{ file: 'big.ts', lines: 200 }])
  })

  it('excludes .test.ts files and files under the ceiling', () => {
    dir = mkdtempSync(join(tmpdir(), 'check-file-size-'))
    writeFileSync(join(dir, 'big.test.ts'), Array.from({ length: 200 }, (_, i) => `const x${i} = ${i}`).join('\n'))
    writeFileSync(join(dir, 'small.ts'), 'const y = 1\n')

    const result = findOversizedFiles(dir)

    expect(result).toEqual([])
  })

  it('recurses into subdirectories', () => {
    dir = mkdtempSync(join(tmpdir(), 'check-file-size-'))
    const nested = join(dir, 'nested')
    mkdirSync(nested)
    writeFileSync(join(nested, 'big.ts'), Array.from({ length: 151 }, (_, i) => `const x${i} = ${i}`).join('\n'))

    const result = findOversizedFiles(dir)

    expect(result).toEqual([{ file: join('nested', 'big.ts'), lines: 151 }])
  })
})
