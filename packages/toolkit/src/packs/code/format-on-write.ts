#!/usr/bin/env node
/** Formatting is an auto-fix concern, never a gate: fix on write, always exit 0, no auto-install. */
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, isAbsolute } from 'node:path'

function read(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolvePromise) => {
    let d = ''
    stream.setEncoding('utf8')
    stream.on('data', (c) => (d += c))
    stream.on('end', () => resolvePromise(d))
  })
}

const raw = await read(process.stdin).catch(() => '')
let filePath: string | undefined
try {
  filePath = JSON.parse(raw)?.tool_input?.file_path
} catch {
  process.exit(0)
}

const FORMATTABLE = /\.(ts|tsx|js|jsx|mjs|cjs|css|json|md|html|ya?ml)$/
if (!filePath || !FORMATTABLE.test(filePath)) process.exit(0)

/** Walk up from the file's own dir, never CWD (the session root, often the wrong workspace). */
function findPrettier(fromFile: string): string | null {
  let dir = isAbsolute(fromFile) ? dirname(fromFile) : join(process.cwd(), dirname(fromFile))
  while (true) {
    const bin = join(dir, 'node_modules', '.bin', 'prettier')
    if (existsSync(bin)) return bin
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const bin = findPrettier(filePath)
if (bin) {
  try {
    execFileSync(bin, ['--write', '--log-level', 'silent', filePath], { stdio: 'ignore' })
  } catch {
    /* best-effort — never block on a format failure */
  }
}
process.exit(0)
