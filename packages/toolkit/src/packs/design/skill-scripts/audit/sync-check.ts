#!/usr/bin/env node
// SCOPE / STATED LIMITATION: a CLI can't assume live Figma access, so this checks
// only the last-synced committed design/ artifacts — it does NOT see human
// hand-edits made in Figma since the last sync; that needs a figma-sync run first.
import { RegistryEntrySchema } from '../../design-kit/schemas.js'
import { isRawUnadoptedKit } from '../../design-kit/staleness.js'

export interface SyncCheckFinding {
  rule: 'invalid-registry-entry' | 'missing-spec' | 'orphan-spec' | 'spec-diff-receipt'
  component: string
  message: string
}

export interface SyncCheckReport {
  status: 'clean' | 'dirty'
  checkedAt: string
  scope: { swept: string[]; advisorySkipped: string[]; exempt: string[] }
  findings: SyncCheckFinding[]
  limitation: string
}

export const SYNC_CHECK_LIMITATION =
  'Runs against the last-synced committed design/ artifacts only (no live Figma access): ' +
  'human hand-edits made in Figma since the last figma-sync are NOT visible to this check.'

export function runSyncCheck({
  registry,
  specComponents,
  specDiffReceipt,
  now = new Date()
}: {
  registry: { components?: Record<string, unknown> }
  specComponents: string[]
  specDiffReceipt?: { exitCode?: number } | undefined
  now?: Date
}): SyncCheckReport {
  const components = registry.components ?? {}
  const specs = new Set(specComponents)
  const findings: SyncCheckFinding[] = []
  const swept: string[] = []
  const advisorySkipped: string[] = []
  const exempt: string[] = []

  for (const [name, raw] of Object.entries(components)) {
    const parsed = RegistryEntrySchema.safeParse(raw)
    if (!parsed.success) {
      findings.push({
        rule: 'invalid-registry-entry',
        component: name,
        message: `registry entry fails RegistryEntrySchema: ${parsed.error.issues.map((i) => i.message).join('; ')}`
      })
      continue
    }
    const entry = parsed.data as { kind: string; adopted?: boolean }
    if (isRawUnadoptedKit(entry)) {
      advisorySkipped.push(name)
      continue
    }
    if (entry.kind === 'screen' || entry.kind === 'code-owned') {
      exempt.push(name)
      continue
    }
    swept.push(name)
    if (!specs.has(name)) {
      findings.push({
        rule: 'missing-spec',
        component: name,
        message: `adopted registry entry has no committed design/specs/${name}.json — re-run figma-sync`
      })
    }
  }

  for (const specName of specComponents) {
    if (!(specName in components)) {
      findings.push({
        rule: 'orphan-spec',
        component: specName,
        message: `design/specs/${specName}.json has no registry entry — stale spec or missing registration`
      })
    }
  }

  if (!specDiffReceipt) {
    findings.push({
      rule: 'spec-diff-receipt',
      component: '(project)',
      message: 'no design/spec-diff-receipt.json — the spec-diff walker has never recorded a run'
    })
  } else if (specDiffReceipt.exitCode !== 0) {
    findings.push({
      rule: 'spec-diff-receipt',
      component: '(project)',
      message: `last recorded spec-diff run FAILED (exitCode ${specDiffReceipt.exitCode}) — code no longer matches the committed specs`
    })
  }

  return {
    status: findings.length === 0 ? 'clean' : 'dirty',
    checkedAt: now.toISOString(),
    scope: { swept, advisorySkipped, exempt },
    findings,
    limitation: SYNC_CHECK_LIMITATION
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync, readdirSync, existsSync } = await import('node:fs')
  const { join, basename } = await import('node:path')

  const args = process.argv.slice(2)
  if (args.includes('--help')) {
    console.log(
      [
        'usage: argo design sync --check [--json]   (run from the app root, like its skill-script siblings)',
        '',
        'Headless, deterministic, registry-scoped drift check over the committed design/',
        'artifacts. Emits a JSON report ({status: clean|dirty, findings[]}) — JSON is the',
        'only output format, --json is accepted for explicitness. No LLM, no network.',
        '',
        `LIMITATION: ${SYNC_CHECK_LIMITATION}`
      ].join('\n')
    )
    process.exit(0)
  }
  if (!args.includes('--check')) {
    console.error('argo design sync: only the headless check is available from the CLI — pass --check (see --help)')
    process.exit(1)
  }

  const designDir = join(process.cwd(), 'design')
  const registryPath = join(designDir, 'registry.json')
  if (!existsSync(registryPath)) {
    console.error(`argo design sync --check: no ${registryPath} — run from the app root of a synced project`)
    process.exit(1)
  }
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'))
  const specsDir = join(designDir, 'specs')
  const specComponents = existsSync(specsDir)
    ? readdirSync(specsDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => basename(f, '.json'))
    : []
  const receiptPath = join(designDir, 'spec-diff-receipt.json')
  const specDiffReceipt = existsSync(receiptPath) ? JSON.parse(readFileSync(receiptPath, 'utf8')) : undefined

  const report = runSyncCheck({ registry, specComponents, specDiffReceipt })
  console.log(JSON.stringify(report, null, 2))
  process.exit(report.status === 'clean' ? 0 : 1)
}
