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
  // Order: red-proof → trust → design-commit → design-contract-freeze → design-coverage.
  // The freeze gate runs before coverage because coverage grades against the
  // frozen contract — its integrity must be checked before it is trusted.
  'bash-pretooluse': [
    '../dist/hooks/red-proof-gate.js',
    '../dist/hooks/trust-gate.js',
    '../dist/hooks/design-commit-gate.js',
    '../dist/hooks/design-contract-freeze-gate.js',
    '../dist/hooks/design-coverage-gate.js',
  ],
  'post-edit-write': ['../dist/hooks/format-on-write.js', '../dist/hooks/test-smell.js'],
  'design-guard-record': ['../dist/hooks/design-guard-record.js'],
  'design-guard-stop': ['../dist/hooks/design-guard-stop.js'],
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

// `argo design <verb>` — each verb is a standalone skill-script module whose CLI
// block reads process.argv; re-exec the module with the verb's own argv so the
// scripts keep their `import.meta.url === file://argv[1]` guard semantics.
const DESIGN_VERBS = {
  'record-spec-diff-receipt': '../dist/skill-scripts/record-spec-diff-receipt.js',
  'check-anti-recreation': '../dist/skill-scripts/check-anti-recreation.js',
  'bundle-tier0-audit': '../dist/skill-scripts/bundle-tier0-audit.js',
  'prepare-tier0-audit-options': '../dist/skill-scripts/prepare-tier0-audit-options.js',
  'record-audit-receipt': '../dist/skill-scripts/record-audit-receipt.js',
  'capture-kit-inventory': '../dist/skill-scripts/capture-kit-inventory.js',
  'region-coverage': '../dist/skill-scripts/region-coverage.js',
  'record-coverage-receipt': '../dist/skill-scripts/record-coverage-receipt.js',
  'extract-region-contract': '../dist/skill-scripts/extract-region-contract.js',
  'extract-built-regions': '../dist/skill-scripts/extract-built-regions.js',
  'lint-contract-freeze': '../dist/skill-scripts/lint-contract-freeze.js',
  'capture-kit-corpus': '../dist/skill-scripts/capture-kit-corpus.js',
  'emit-shims': '../dist/skill-scripts/emit-shims.js',
}

function runDesignVerb(verb, args) {
  const rel = DESIGN_VERBS[verb]
  if (!rel) {
    process.stderr.write(`argo design: unknown verb "${verb}" (known: ${Object.keys(DESIGN_VERBS).join(', ')})\n`)
    process.exit(1)
  }
  const file = fileURLToPath(new URL(rel, import.meta.url))
  const res = spawnSync(process.execPath, [file, ...args], { stdio: 'inherit' })
  process.exit(res.status ?? 1)
}

function flagValue(args, name) {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

const [cmd, ...rest] = process.argv.slice(2)

switch (cmd) {
  case 'argo-hook':
    await runHookChain(rest[0])
    break
  case 'design':
    runDesignVerb(rest[0], rest.slice(1))
    break
  case 'init': {
    const { runInit } = await import('../dist/cli/init.js')
    const repo = flagValue(rest, '--marketplace-repo')
    const report = runInit({
      hostRoot: flagValue(rest, '--host-root') ?? process.cwd(),
      marketplaceSource: repo ? { source: 'github', repo } : undefined,
    })
    console.log(JSON.stringify(report))
    break
  }
  case 'update': {
    const { runUpdate } = await import('../dist/cli/update.js')
    const report = runUpdate({ hostRoot: flagValue(rest, '--host-root') ?? process.cwd() })
    console.log(JSON.stringify(report))
    break
  }
  case 'doctor': {
    const { runDoctor } = await import('../dist/cli/doctor.js')
    const result = runDoctor({ pluginRoot: flagValue(rest, '--plugin-root') ?? process.env.CLAUDE_PLUGIN_ROOT })
    if (!result.ok) {
      process.stderr.write(`${result.reason}\n`)
      process.exit(1)
    }
    console.log(`doctor: ok — designLibrary ${result.declared} === installed kit ${result.installed}`)
    break
  }
  case 'graph': {
    if (rest[0] !== 'refresh') {
      process.stderr.write(`argo graph: unknown verb "${rest[0] ?? ''}" (known: refresh)\n`)
      process.exit(1)
    }
    const { runGraphRefresh } = await import('../dist/cli/graph-refresh.js')
    console.log(JSON.stringify(runGraphRefresh({ cwd: flagValue(rest, '--host-root') ?? process.cwd() })))
    break
  }
  default:
    process.stderr.write('usage: argo <argo-hook|design|init|update|doctor|graph> ...\n')
    process.exit(cmd ? 1 : 0)
}
