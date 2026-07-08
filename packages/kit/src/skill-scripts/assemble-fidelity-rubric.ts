#!/usr/bin/env node
/**
 * Blind VLM fidelity rubric assembly: mechanically merges a
 * category template's fixed visual criteria (`templates/design/category-
 * rubrics/<category>.md`, human-authored once per category) with brief-
 * NAMED requirements only — never the build transcript, never the
 * builder's self-report — same isolation contract as design-verifier's
 * PRD-checklist assembly. `briefRequirements` are id/prompt pairs the
 * caller has already extracted Node-side from the screen brief's own
 * "Regions -> component map"; this function does no PRD parsing itself.
 */

export type FidelityCriterion = { id: string; prompt: string; requiresZoomedCrop: boolean }
export type FidelityRubric = { category: string; criteria: FidelityCriterion[] }

export function assembleFidelityRubric(
  categoryTemplate: FidelityRubric,
  briefRequirements: { id: string; prompt: string; requiresZoomedCrop?: boolean }[]
): FidelityRubric {
  return {
    category: categoryTemplate.category,
    criteria: [
      ...categoryTemplate.criteria,
      ...briefRequirements.map((r) => ({ id: r.id, prompt: r.prompt, requiresZoomedCrop: r.requiresZoomedCrop ?? false }))
    ]
  }
}

/**
 * Cost lever (task's explicit ask): a category with zero visual criteria
 * never spawns the VLM agent — a plain button stays tier-0-only.
 */
export function shouldSpawnFidelityVerifier(rubric: FidelityRubric): boolean {
  return rubric.criteria.length > 0
}

/**
 * CLI wrapper. Takes the category template and brief requirements as JSON
 * flags, already parsed — this repo has no markdown-frontmatter parser
 * anywhere (grepped, none found), so reading `templates/design/category-
 * rubrics/<category>.md`'s YAML frontmatter into `{ category, criteria }`
 * is the CALLER's job (the figma-create step-4 spawner), not this script's;
 * inventing a frontmatter parser for one CLI wrapper is exactly the
 * speculative surface the owner mandate forbids.
 */
function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const templateJson = flagValue(args, '--template')
  if (!templateJson) {
    process.stderr.write('assemble-fidelity-rubric: usage: argo design assemble-fidelity-rubric --template <json> [--briefRequirements <json>]\n')
    process.exit(1)
  }
  const briefRequirementsJson = flagValue(args, '--briefRequirements')
  const rubric = assembleFidelityRubric(JSON.parse(templateJson), briefRequirementsJson ? JSON.parse(briefRequirementsJson) : [])
  console.log(JSON.stringify({ rubric, shouldSpawn: shouldSpawnFidelityVerifier(rubric) }))
}
