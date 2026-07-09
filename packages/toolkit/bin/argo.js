#!/usr/bin/env node
/**
 * @argohq/toolkit single CLI entry. Subcommands:
 *   argo-hook <event>   — Claude Code hook dispatch (bash-pretooluse, post-edit-write,
 *                         playbook-permission)
 *   design <verb>       — skill-script CLI verbs (Slice 2)
 *   init | graph refresh — lifecycle verbs (Slices 4+)
 *   playbook <start|status|advance|adopt|diagram> — @argohq/core's playbook-engine
 *                         CLI verbs (playbook-engine-phase1.md, Slice 8)
 *   plans [check]       — plan lifecycle: list by status (frontmatter draft|queued,
 *                         landed derived from git, live-run overlay from the home
 *                         store); `plans check --plan <path>` is build-plan's
 *                         refuse-a-draft gate
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
  // Order: red-proof → trust → design-commit.
  // The contract-freeze / region-coverage gates are retired
  // (design-process-simplification.md, 2026-07-07): the design flow no longer
  // freezes a region-contract or writes a per-screen coverage receipt, so those
  // gates are gone from the chain and their modules deleted. design-commit-gate
  // (spec-diff receipt, the figma-to-code flow) is unaffected and stays.
  'bash-pretooluse': [
    '../dist/packs/code/red-proof-gate.js',
    '../dist/packs/code/trust-gate.js',
    '../dist/packs/design/design-commit-gate.js',
  ],
  'post-edit-write': ['../dist/packs/code/format-on-write.js', '../dist/packs/code/test-smell.js'],
  // design-guard-record/design-guard-stop retired (playbook-engine-phase1.md
  // Slice 13) — the generic playbook-permission hook below, backed by
  // pack-design's design-rules-check gate + per-stage `allows`, supersedes
  // their enforcement.
  // Generic PreToolUse permission hook (playbook-engine phase 1, Slice 8) —
  // runs on every tool call (matcher `*` in hooks/hooks.json), not just Bash,
  // since @argohq/claude-adapter-plugin's runPermissionHook needs to see Bash,
  // Edit/Write, and Figma calls alike.
  'playbook-permission': ['../dist/adapter-claude/playbook-permission-gate.js'],
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
  'record-spec-diff-receipt': '../dist/packs/design/skill-scripts/record-spec-diff-receipt.js',
  'bundle-design-rules-audit': '../dist/packs/design/skill-scripts/bundle-design-rules-audit.js',
  'prepare-design-rules-audit-options': '../dist/packs/design/skill-scripts/prepare-design-rules-audit-options.js',
  'record-audit-receipt': '../dist/packs/design/skill-scripts/record-audit-receipt.js',
  'check-instance-presence': '../dist/packs/design/skill-scripts/check-instance-presence.js',
  'registry-lookup': '../dist/packs/design/skill-scripts/registry-lookup.js',
  'register-screen': '../dist/packs/design/skill-scripts/register-screen.js',
  'completeness-checklist': '../dist/packs/design/skill-scripts/completeness-checklist.js',
  'mark-screen-composed': '../dist/packs/design/skill-scripts/mark-screen-composed.js',
  'record-completeness': '../dist/packs/design/skill-scripts/record-completeness.js',
  'generate-token-manifest': '../dist/packs/design/skill-scripts/generate-token-manifest.js',
  'emit-shims': '../dist/packs/design/skill-scripts/emit-shims.js',
  'pull-registry': '../dist/packs/design/skill-scripts/pull-registry.js',
  'assemble-fidelity-rubric': '../dist/packs/design/skill-scripts/assemble-fidelity-rubric.js',
  'validate-manifest': '../dist/packs/design/skill-scripts/validate-manifest.js',
  'ack-pending-work': '../dist/packs/design/skill-scripts/ack-pending-work.js',
  'assemble-skill': '../dist/cli/assemble-skill.js',
  // `argo design sync --check [--json]` — headless drift check over the
  // last-synced committed design/ artifacts (RUNS-R27); the module itself
  // enforces --check and documents the no-live-Figma limitation in --help.
  sync: '../dist/packs/design/skill-scripts/sync-check.js',
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
  case 'playbook': {
    const verb = rest[0]
    const args = rest.slice(1)
    const hostRoot = flagValue(args, '--host-root') ?? process.cwd()
    const { playbookStart, playbookStatus, playbookAdvance, playbookAdopt, playbookDiagram } = await import(
      '../dist/core/index.js'
    )
    switch (verb) {
      case 'list': {
        // Catalog derivation surface (argo-v2 PRD RUNS-R24). --json is the
        // only format and is accepted for explicitness.
        const { runPlaybookList } = await import('../dist/cli/playbook-list.js')
        console.log(JSON.stringify(runPlaybookList(), null, 2))
        break
      }
      case 'start': {
        const result = playbookStart(
          { name: flagValue(args, '--name'), target: flagValue(args, '--target'), key: flagValue(args, '--key') },
          { cwd: hostRoot }
        )
        console.log(JSON.stringify(result))
        break
      }
      case 'status': {
        const result = playbookStatus(flagValue(args, '--key'), { cwd: hostRoot })
        console.log(JSON.stringify(result))
        break
      }
      case 'advance': {
        const result = await playbookAdvance(flagValue(args, '--key'), { cwd: hostRoot })
        console.log(JSON.stringify(result))
        break
      }
      case 'adopt': {
        const result = await playbookAdopt(
          { name: flagValue(args, '--name'), target: flagValue(args, '--target'), key: flagValue(args, '--key') },
          { cwd: hostRoot }
        )
        console.log(JSON.stringify(result))
        break
      }
      case 'diagram': {
        console.log(playbookDiagram(flagValue(args, '--name')))
        break
      }
      default:
        process.stderr.write(
          `argo playbook: unknown verb "${verb ?? ''}" (known: list|start|status|advance|adopt|diagram)\n`
        )
        process.exit(1)
    }
    break
  }
  case 'plans': {
    const { listPlans, assertPlanQueued } = await import('../dist/cli/plans.js')
    if (rest[0] === 'check') {
      const plan = flagValue(rest, '--plan')
      if (!plan) {
        process.stderr.write('usage: argo plans check --plan <path>\n')
        process.exit(1)
      }
      try {
        assertPlanQueued(plan)
        console.log(JSON.stringify({ ok: true, plan }))
      } catch (err) {
        process.stderr.write(`${err.message}\n`)
        process.exit(1)
      }
      break
    }
    const plans = listPlans({
      hostRoot: flagValue(rest, '--host-root') ?? process.cwd(),
      stateRoot: process.env.ARGO_STATE_ROOT,
    })
    console.log(JSON.stringify(plans, null, 2))
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
    process.stderr.write('usage: argo <argo-hook|design|init|graph|playbook|plans> ...\n')
    process.exit(cmd ? 1 : 0)
}
