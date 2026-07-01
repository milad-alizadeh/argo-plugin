#!/usr/bin/env node
/**
 * Format-on-write (PostToolUse on Edit|Write). Formatting is an auto-fix concern, never a
 * gate — so we fix the file the moment an agent writes it, keeping every later layer
 * (pre-push, CI) a no-op. Best-effort and SILENT: never blocks the turn (always exit 0),
 * uses the project's OWN prettier if present, and does nothing if it isn't (no auto-install).
 */
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

function read(stream) {
  return new Promise((resolve) => {
    let d = ''
    stream.setEncoding('utf8')
    stream.on('data', (c) => (d += c))
    stream.on('end', () => resolve(d))
  })
}

const raw = await read(process.stdin).catch(() => '')
let filePath
try {
  filePath = JSON.parse(raw)?.tool_input?.file_path
} catch {
  process.exit(0)
}

const FORMATTABLE = /\.(ts|tsx|js|jsx|mjs|cjs|css|json|md|html|ya?ml)$/
if (!filePath || !FORMATTABLE.test(filePath)) process.exit(0)

// Use the project's own prettier only — do not auto-install one.
const bin = 'node_modules/.bin/prettier'
if (existsSync(bin)) {
  try {
    execFileSync(bin, ['--write', '--log-level', 'silent', filePath], { stdio: 'ignore' })
  } catch {
    /* best-effort — never block on a format failure */
  }
}
process.exit(0)
