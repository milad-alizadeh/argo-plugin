import type { StageSpec, PlaybookSpec } from './spec.js'

/**
 * Mermaid renderer for a playbook spec, per the design doc's "Because specs
 * are data, core ships `argo playbook diagram`" section and audit 1.5's
 * resolution: this is the phase-1-expressible skeleton ONLY — stage nodes
 * labeled FRESH/WARM (from `session`), gates on the forward edges, retry/
 * fix-round loops from `retries`/`maxRounds`, `repeat` annotated on the node.
 * It deliberately NEVER renders a runtime-decision diamond: same-convergence
 * forks ("Code-owned?", "Exists?") resolve inside a stage's skill, not as
 * branch nodes in this diagram (audit 1.5 — the historical hand-drawn
 * fixtures with decision diamonds are NOT what this generator round-trips).
 */

function nodeId(stageName: string): string {
  return stageName.replace(/[^a-zA-Z0-9_]/g, '_')
}

function nodeLabel(stage: StageSpec): string {
  const mode = (stage.session ?? 'fresh').toUpperCase()
  const repeat = stage.repeat ? ` &middot; repeat: ${stage.repeat}` : ''
  return `${stage.name} [${mode}]${repeat}`
}

export function renderPlaybookDiagram(spec: PlaybookSpec): string {
  const lines: string[] = ['flowchart TD']

  for (const stage of spec.stages) {
    lines.push(`  ${nodeId(stage.name)}["${nodeLabel(stage)}"]`)
  }

  spec.stages.forEach((stage, i) => {
    const next = spec.stages[i + 1]
    if (next) {
      const label = stage.gate ? `|gate: ${stage.gate}|` : ''
      lines.push(`  ${nodeId(stage.name)} -->${label} ${nodeId(next.name)}`)
    }
    if (stage.retries) {
      lines.push(`  ${nodeId(stage.name)} -->|retry, budget ${stage.retries}| ${nodeId(stage.name)}`)
    }
    if (stage.maxRounds) {
      lines.push(`  ${nodeId(stage.name)} -->|fix round, up to ${stage.maxRounds}| ${nodeId(stage.name)}`)
    }
  })

  return lines.join('\n')
}
