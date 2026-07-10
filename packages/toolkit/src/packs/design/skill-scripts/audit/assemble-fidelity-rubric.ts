#!/usr/bin/env node
// Merges category-template criteria with brief-named requirements only — never the
// build transcript or builder self-report, to keep the verifier blind.

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

// Cost lever: a category with zero visual criteria never spawns the VLM agent.
export function shouldSpawnFidelityVerifier(rubric: FidelityRubric): boolean {
  return rubric.criteria.length > 0
}

// CLI wrapper: takes already-parsed template/requirements JSON, since frontmatter
// parsing is the caller's job — no parser exists here by design (YAGNI).
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
