// `argo design <verb>` dispatch table, extracted from argo.js so tests can
// exercise every verb without hand-copying (and drifting from) the table
// argo.js actually dispatches on.
export const DESIGN_VERBS = {
  'record-spec-diff-receipt': '../dist/packs/design/skill-scripts/session-guard/record-spec-diff-receipt.js',
  'bundle-design-rules-audit': '../dist/packs/design/skill-scripts/audit/bundle-design-rules-audit.js',
  'prepare-design-rules-audit-options': '../dist/packs/design/skill-scripts/audit/prepare-design-rules-audit-options.js',
  'record-audit-receipt': '../dist/packs/design/skill-scripts/audit/record-audit-receipt.js',
  'check-instance-presence': '../dist/packs/design/skill-scripts/audit/check-instance-presence.js',
  'registry-lookup': '../dist/packs/design/skill-scripts/registry/registry-lookup.js',
  'register-screen': '../dist/packs/design/skill-scripts/registry/register-screen.js',
  'completeness-checklist': '../dist/packs/design/skill-scripts/registry/completeness-checklist.js',
  'mark-screen-composed': '../dist/packs/design/skill-scripts/session-guard/mark-screen-composed.js',
  'record-completeness': '../dist/packs/design/skill-scripts/registry/record-completeness.js',
  'generate-token-manifest': '../dist/packs/design/skill-scripts/assembly/generate-token-manifest.js',
  'emit-shims': '../dist/packs/design/skill-scripts/assembly/emit-shims.js',
  'pull-registry': '../dist/packs/design/skill-scripts/registry/pull-registry.js',
  'refresh-card': '../dist/packs/design/skill-scripts/registry/refresh-card.js',
  'assemble-fidelity-rubric': '../dist/packs/design/skill-scripts/audit/assemble-fidelity-rubric.js',
  'validate-manifest': '../dist/packs/design/skill-scripts/audit/validate-manifest.js',
  'ack-pending-work': '../dist/packs/design/skill-scripts/session-guard/ack-pending-work.js',
  'assemble-skill': '../dist/cli/assemble-skill.js',
  // `argo design sync --check [--json]` — headless drift check over the
  // last-synced committed design/ artifacts (RUNS-R27); the module itself
  // enforces --check and documents the no-live-Figma limitation in --help.
  sync: '../dist/packs/design/skill-scripts/audit/sync-check.js',
}

/**
 * `argo playbook <verb>` dispatch verbs, mirroring the `switch (verb)` in
 * `bin/argo.js`'s `playbook` case — kept here so an e2e drift test can
 * enumerate them without hand-copying (and drifting from) that switch.
 */
export const PLAYBOOK_VERBS = ['list', 'start', 'claim', 'status', 'advance', 'adopt', 'diagram']
