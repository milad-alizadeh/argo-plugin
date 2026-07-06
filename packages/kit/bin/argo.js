#!/usr/bin/env node
/**
 * @argohq/kit single CLI entry. Subcommands:
 *   argo-hook <event>   — Claude Code hook dispatch (bash-pretooluse, post-edit-write,
 *                         design-guard-record, design-guard-stop)
 *   design <verb>       — skill-script CLI verbs (Slice 2)
 *   init | update | doctor | graph refresh — lifecycle verbs (Slices 4+)
 *
 * Hook dispatch model: each hook module stays a standalone fail-closed script
 * (stdin JSON in, exit code out) — the dispatcher reads stdin ONCE and replays
 * it to each hook in the documented order as a child process, short-circuiting
 * on the first non-zero exit so the block-first-reason UX is preserved. Only
 * the files for the fired event are ever loaded (decision 12: a red-proof fire
 * never loads the design-kit comparator).
 */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HOOK_CHAINS = {
  // Order matches the pre-extraction hooks.json: red-proof → trust → design-commit → design-coverage.
  'bash-pretooluse': [
    '../src/hooks/red-proof-gate.js',
    '../src/hooks/trust-gate.js',
    '../src/hooks/design-commit-gate.js',
    '../src/hooks/design-coverage-gate.js',
  ],
  'post-edit-write': ['../src/hooks/format-on-write.js', '../src/hooks/test-smell.js'],
  'design-guard-record': ['../src/hooks/design-guard-record.js'],
  'design-guard-stop': ['../src/hooks/design-guard-stop.js'],
}

function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (data += c))
    process.stdin.on('end', () => resolve(data))
  })
}

async function runHookChain(event) {
  const chain = HOOK_CHAINS[event]
  if (!chain) {
    process.stderr.write(`argo-hook: unknown event "${event}" (known: ${Object.keys(HOOK_CHAINS).join(', ')})\n`)
    process.exit(2) // fail closed — a typo'd wiring must never silently pass
  }
  const input = await readStdin().catch(() => '')
  for (const rel of chain) {
    const file = fileURLToPath(new URL(rel, import.meta.url))
    const res = spawnSync(process.execPath, [file], { input, stdio: ['pipe', 'inherit', 'inherit'] })
    if (res.status !== 0) process.exit(res.status ?? 2)
  }
  process.exit(0)
}

const [cmd, ...rest] = process.argv.slice(2)

switch (cmd) {
  case 'argo-hook':
    await runHookChain(rest[0])
    break
  case 'design':
  case 'init':
  case 'update':
  case 'doctor':
  case 'graph':
    process.stderr.write(`argo ${cmd}: not implemented yet\n`)
    process.exit(1)
  default:
    process.stderr.write('usage: argo <argo-hook|design|init|update|doctor|graph> ...\n')
    process.exit(cmd ? 1 : 0)
}
