#!/usr/bin/env node
/** Warns, never blocks: test quality is a judgement call. Exit 2 on PostToolUse
 * surfaces the smell via stderr without undoing the write. */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

export const TEST_FILE = /\.(test|spec|ct\.spec|e2e)\.[cm]?[jt]sx?$/

export function detectBridgeAssertion(src: string): boolean {
  return /expect\s*\(\s*(await\s+)?window\.(api|electron)\b/.test(src)
}

export function detectVacuousAssertion(src: string): boolean {
  return (
    /expect\s*\(\s*true\s*\)\s*\.\s*toBe(Truthy)?\s*\(/.test(src) ||
    /expect\s*\(\s*(\d+)\s*\)\s*\.\s*toBe\s*\(\s*\1\s*\)/.test(src)
  )
}

export function detectSelfMock(src: string, base: string): string | undefined {
  const mockRe = /(?:vi|jest)\.mock\s*\(\s*['"]([^'"]+)['"]/g
  for (let m: RegExpExecArray | null; (m = mockRe.exec(src)); ) {
    const mocked = basename(m[1]).replace(/\.[cm]?[jt]sx?$/, '')
    if (mocked === base) return m[1]
  }
  return undefined
}

function read(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolvePromise) => {
    let d = ''
    stream.setEncoding('utf8')
    stream.on('data', (c) => (d += c))
    stream.on('end', () => resolvePromise(d))
  })
}

async function main() {
  const raw = await read(process.stdin).catch(() => '')
  let filePath: string | undefined
  try {
    filePath = JSON.parse(raw)?.tool_input?.file_path
  } catch {
    process.exit(0)
  }

  if (!filePath || !TEST_FILE.test(filePath)) process.exit(0)

  let src: string
  try {
    src = readFileSync(filePath, 'utf8')
  } catch {
    process.exit(0)
  }

  const warnings: string[] = []

  if (detectBridgeAssertion(src)) {
    warnings.push(
      'asserts on the internal bridge (window.api/window.electron) — assert the rendered DOM the user sees instead; an internal-API check is a unit test wearing an e2e costume (ok only as an explicit stand-in before the UI exists)',
    )
  }

  if (detectVacuousAssertion(src)) {
    warnings.push('contains a vacuous assertion (expect(true)/expect(n).toBe(n)) — it can never fail, so it proves nothing')
  }

  const base = basename(filePath).replace(TEST_FILE, '')
  const selfMock = detectSelfMock(src, base)
  if (selfMock) {
    warnings.push(`mocks the module under test ("${selfMock}") — the test then exercises the mock, not the code`)
  }

  if (warnings.length === 0) process.exit(0)

  process.stderr.write(
    `Test-smell warning (non-blocking) in ${filePath}:\n` +
      warnings.map((w) => `  - ${w}`).join('\n') +
      '\nFix now if the smell is real; if intentional, say why in the test file.\n',
  )
  process.exit(2)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
