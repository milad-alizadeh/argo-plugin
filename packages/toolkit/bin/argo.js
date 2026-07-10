#!/usr/bin/env node
/**
 * @argohq/toolkit single CLI entry. Subcommands:
 *   argo-hook <event>   — Claude Code hook dispatch (bash-pretooluse, post-edit-write,
 *                         playbook-permission, bash-safety-guards, block-lockfile-edit,
 *                         block-designer-spawn, session-context)
 *   design <verb>       — skill-script CLI verbs (Slice 2)
 *   init | graph refresh — lifecycle verbs (Slices 4+)
 *   playbook <start|status|advance|adopt|diagram> — @argohq/core's playbook-engine
 *                         CLI verbs (playbook-engine-phase1.md, Slice 8)
 *   plans [check]       — plan lifecycle: list by status (frontmatter draft|queued,
 *                         landed derived from git, live-run overlay from the home
 *                         store); `plans check --plan <path>` is build-plan's
 *                         refuse-a-draft gate
 *   rules <record|status> — installed-file template-drift provenance
 *                         (skills/init/SKILL.md §1, §5): `record <installed-path>
 *                         <hash>` stamps one installed template-derived file's
 *                         source-template hash at install time; `status
 *                         --templates-dir <dir>` diffs recorded hashes against
 *                         the CURRENT templates — advisory only, never a gate
 *   status              — read-only posture report over `.argo/config.json`'s
 *                         index (testDiscipline/boundaryLint/packs/provenance),
 *                         flags config-vs-reality mismatches as plain text;
 *                         never fixes anything (no doctor, no migrations)
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
import { DESIGN_VERBS } from './design-verbs.js'

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
  // Plugin-side SAFETY hooks (moved out of the plugin checkout — see
  // hooks/hooks.json in the plugin repo, which now runs every route through
  // `npx --no-install @argohq/toolkit argo-hook <route>` instead of
  // hand-written .mjs files):
  'bash-safety-guards': ['../dist/hooks/bash-safety-guards.js'],
  'block-lockfile-edit': ['../dist/hooks/block-lockfile-edit.js'],
  'block-designer-spawn': ['../dist/hooks/block-designer-spawn.js'],
  'session-context': ['../dist/hooks/session-context.js'],
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
// Table lives in `./design-verbs.js` so the e2e drift test imports the exact
// same object instead of hand-copying it.
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

const HELP_FLAGS = new Set(['--help', '-h'])

const USAGE = {
  'argo-hook': () => `usage: argo argo-hook <event>\n  known events: ${Object.keys(HOOK_CHAINS).join(', ')}`,
  design: () => `usage: argo design <verb> [...args]\n  known verbs: ${Object.keys(DESIGN_VERBS).join(', ')}`,
  init: () => 'usage: argo init [--host-root <path>] [--marketplace-repo <owner/repo>]',
  playbook: () => 'usage: argo playbook <list|start|claim|status|advance|adopt|diagram> [...args]',
  rules: () => 'usage: argo rules <record|status> [...args]',
  plans: () => 'usage: argo plans [check --plan <path>] [--host-root <path>]',
  graph: () => 'usage: argo graph refresh [--host-root <path>]',
  status: () => 'usage: argo status [--host-root <path>]'
}

const TOP_LEVEL_USAGE = `usage: argo <${Object.keys(USAGE).join('|')}> ...`

/** `--help`/`-h` anywhere in argv short-circuits BEFORE any real (side-effecting)
 * command runs — prints usage for the named subcommand (or the top-level
 * banner) and exits 0. */
function printHelpAndExit(cmd) {
  process.stdout.write(`${(USAGE[cmd] ?? (() => TOP_LEVEL_USAGE))()}\n`)
  process.exit(0)
}

/** Warns (never blocks) on an argv flag token (`--foo`) not present in `known`
 * — misspelled/unrecognized flags used to be silently swallowed. */
function warnUnknownFlags(args, label, known) {
  const knownSet = new Set([...known, '--help', '-h'])
  for (const a of args) {
    if (a.startsWith('--') && !knownSet.has(a)) {
      process.stderr.write(`argo ${label}: warning: unrecognized flag "${a}"\n`)
    }
  }
}

const PLAYBOOK_KNOWN_FLAGS = {
  list: ['--host-root'],
  start: ['--host-root', '--name', '--target', '--key'],
  claim: ['--host-root', '--key'],
  status: ['--host-root', '--key'],
  advance: ['--host-root', '--key', '--artifacts'],
  adopt: ['--host-root', '--name', '--target', '--key', '--artifacts'],
  diagram: ['--host-root', '--name']
}

// Union of every flag any design verb script reads via its own argv parsing
// (grepped from packages/toolkit/src/packs/design/skill-scripts) — best
// effort, warn-only, since each verb owns its own flag set.
const DESIGN_KNOWN_FLAGS = [
  '--host-root', '--cwd', '--name', '--names', '--node', '--screen', '--kind', '--status', '--result',
  '--component', '--component-names', '--componentNames', '--manifest', '--template', '--options', '--out',
  '--emit', '--record', '--search', '--session', '--reason', '--check', '--cached', '--built', '--prd',
  '--briefRequirements'
]

/** Parses `--artifacts '<json>'` (item 1) into the `Record<string, string>`
 * `playbookAdvance`/`playbookAdopt` expect on `opts.artifacts` — a JSON object
 * mapping artifactKey -> path/uri. Returns `undefined` when the flag is
 * absent, so callers fall back to auto-derivation from the stage's
 * `produces` entries. Fails closed (throws, not a silent `{}`) on malformed
 * JSON so a typo'd flag never silently degrades to "no artifacts". */
function parseArtifactsFlag(args) {
  const raw = flagValue(args, '--artifacts')
  if (raw === undefined) return undefined
  const parsed = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('--artifacts must be a JSON object mapping artifactKey -> path/uri')
  }
  return parsed
}

const [cmd, ...rest] = process.argv.slice(2)

// `design` is exempt: each verb script owns its own `--help` (some print a
// verb-specific limitation notice, e.g. `design sync --help`) — re-exec'd via
// runDesignVerb below, which already never runs the side-effecting path.
if (cmd !== 'design' && (HELP_FLAGS.has(cmd) || rest.some((a) => HELP_FLAGS.has(a)))) {
  printHelpAndExit(cmd)
}

switch (cmd) {
  case 'argo-hook':
    await runHookChain(rest[0])
    break
  case 'design':
    warnUnknownFlags(rest.slice(1), `design ${rest[0] ?? ''}`, DESIGN_KNOWN_FLAGS)
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
    warnUnknownFlags(args, `playbook ${verb ?? ''}`, PLAYBOOK_KNOWN_FLAGS[verb] ?? [])
    const { playbookStart, playbookStatus, playbookAdvance, playbookAdopt, playbookDiagram } = await import(
      '../dist/core/index.js'
    )
    // Single composition-root loader: registers every pack playbook spec
    // (start/status/advance can't resolve one by name otherwise) and the
    // headless gate set (receipt-backed design-rules-check etc. — without
    // this, advance threw GateNotFoundError on every audit-gated stage).
    const { registerInstalledPacks } = await import('../dist/register-installed-packs.js')
    registerInstalledPacks()
    // Production judge (item 2): without this, fresh-eyes-review (and any
    // other ctx.judge(...)-calling gate) throws "no judge available on
    // GateContext" on every advance — nothing ever registered a judge here
    // before. Spawns a real headless `claude -p` process; tests never hit
    // this path (they inject a fake SessionSpawner directly).
    const { registerClaudeJudge, createHeadlessClaudeSpawner } = await import('../dist/adapter-claude/judge-impl.js')
    registerClaudeJudge(createHeadlessClaudeSpawner())
    const { core } = await import('../dist/core/index.js')
    switch (verb) {
      case 'list': {
        // Catalog derivation surface (argo-v2 PRD RUNS-R24). --json is the
        // only format and is accepted for explicitness.
        const { runPlaybookList } = await import('../dist/core/cli/playbook-list.js')
        console.log(JSON.stringify(runPlaybookList(), null, 2))
        break
      }
      case 'start': {
        // Session affinity: the starting session owns the run — the
        // permission gate stays inert for every other session. Same env seam
        // record-audit-receipt uses (equal to the hook payload's session_id).
        const sessionId = process.env.CLAUDE_CODE_SESSION_ID || null
        const result = playbookStart(
          { name: flagValue(args, '--name'), target: flagValue(args, '--target'), key: flagValue(args, '--key') },
          { cwd: hostRoot, sessionId }
        )
        console.log(JSON.stringify(result))
        break
      }
      case 'claim': {
        // Fresh-session takeover (stages marked session:"fresh"): the new
        // executor re-stamps the pointer with its own session id.
        const { setActiveInstance, readInstance } = await import('../dist/core/index.js')
        const key = flagValue(args, '--key')
        if (!key || !readInstance(key, { cwd: hostRoot })) {
          process.stderr.write(`playbook claim: no instance at key "${key}"\n`)
          process.exit(1)
        }
        const sessionId = process.env.CLAUDE_CODE_SESSION_ID || null
        setActiveInstance(key, { cwd: hostRoot, sessionId, claim: true })
        console.log(JSON.stringify({ key, sessionId }))
        break
      }
      case 'status': {
        const result = playbookStatus(flagValue(args, '--key'), { cwd: hostRoot })
        console.log(JSON.stringify(result))
        break
      }
      case 'advance': {
        // settings.cwd feeds receipt-backed gates (design/audit-receipt.json
        // lives under the APP workspace — run advance from apps/<app>).
        // --artifacts '<json>' maps artifactKey -> path/uri (brief-check,
        // fresh-eyes-review); when omitted, playbookAdvance auto-derives from
        // the stage spec's `produces` entries.
        const result = await playbookAdvance(flagValue(args, '--key'), {
          cwd: hostRoot,
          settings: { cwd: hostRoot },
          artifacts: parseArtifactsFlag(args),
          ctx: { judge: core.judge }
        })
        console.log(JSON.stringify(result))
        break
      }
      case 'adopt': {
        // Session affinity, same seam as `start`: adopt now sets the active
        // pointer (crash recovery), so it must record the owning session too.
        const sessionId = process.env.CLAUDE_CODE_SESSION_ID || null
        const result = await playbookAdopt(
          { name: flagValue(args, '--name'), target: flagValue(args, '--target'), key: flagValue(args, '--key') },
          { cwd: hostRoot, artifacts: parseArtifactsFlag(args), ctx: { judge: core.judge }, sessionId }
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
  case 'rules': {
    const verb = rest[0]
    const args = rest.slice(1)
    const hostRoot = flagValue(args, '--host-root') ?? process.cwd()
    switch (verb) {
      case 'record': {
        const [installedPath, hash] = args.filter((a) => !a.startsWith('--'))
        if (!installedPath || !hash) {
          process.stderr.write('usage: argo rules record <installed-path> <hash> [--host-root <path>]\n')
          process.exit(1)
        }
        const { recordProvenance } = await import('../dist/core/cli/rules-record.js')
        recordProvenance(installedPath, hash, { cwd: hostRoot })
        console.log(JSON.stringify({ file: installedPath, hash }))
        break
      }
      case 'status': {
        const { readdirSync, readFileSync } = await import('node:fs')
        const { join } = await import('node:path')
        const templatesDir = flagValue(args, '--templates-dir')
        if (!templatesDir) {
          process.stderr.write('usage: argo rules status --templates-dir <path> [--host-root <path>]\n')
          process.exit(1)
        }
        const templates = Object.fromEntries(
          readdirSync(templatesDir)
            .filter((f) => f.endsWith('.md'))
            .map((f) => [f, readFileSync(join(templatesDir, f), 'utf8')])
        )
        const { rulesStatus } = await import('../dist/core/cli/rules-status.js')
        console.log(JSON.stringify(rulesStatus({ cwd: hostRoot, templates })))
        break
      }
      default:
        process.stderr.write(`argo rules: unknown verb "${verb ?? ''}" (known: record|status)\n`)
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
  case 'status': {
    const { runStatus } = await import('../dist/core/cli/status.js')
    console.log(JSON.stringify(runStatus(flagValue(rest, '--host-root') ?? process.cwd()), null, 2))
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
    process.stderr.write(`${TOP_LEVEL_USAGE}\n`)
    process.exit(1) // bare `argo` and an unknown command are both usage errors — never a silent 0
}
