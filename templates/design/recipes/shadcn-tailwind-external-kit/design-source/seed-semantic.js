/**
 * Bootstraps the Primitives + Semantic variable collections in a PROJECT file
 * (D19/D23-F3) — companion to derive-semantic-seed.js, which runs in the kit
 * file. Idempotent: safe to re-run against an already-seeded file (per-
 * collection AND per-variable skip-if-present, semantic-seeding.md §2
 * decision 4) — this script only ever creates/imports, never deletes or
 * renames.
 *
 * Reads the bundled semantic-seed.json (installed alongside this script by
 * setup-design, a plain relative import — this script, unlike the tier-0
 * audit, runs as a normal Node module, not inside the `use_figma` sandbox)
 * for its project-owned `primitives`/`semanticSpacing` sections (D10:
 * Primitives are project-local
 * — never kit-derived). Nothing in this script hardcodes the spacing scale
 * or the starter token names; a project wanting a different starter scale
 * edits the seed data, never this script.
 *
 * {{DERIVED_SEED_JSON}} — the `{ colors, floats }` object returned moments
 * earlier by derive-semantic-seed.js running against the kit file, injected
 * by the invoking skill (setup-design §4a) as this pipeline's in-session
 * hand-off. NOT read from a committed file — Figma variable keys are
 * per-copy, so nothing kit-derived is ever committed (semantic-seeding.md
 * §2 Decision 1); this data is fresh on every seeding run.
 */

import semanticSeed from './semantic-seed.json'

const DERIVED_SEED = JSON.parse('{{DERIVED_SEED_JSON}}')

async function ensurePrimitivesCollection() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  let primitives = collections.find((c) => c.name === 'Primitives')
  let created = false

  if (!primitives) {
    primitives = figma.variables.createVariableCollection('Primitives')
    created = true
  }

  const existingNames = new Set()
  for (const variableId of primitives.variableIds) {
    const variable = await figma.variables.getVariableByIdAsync(variableId)
    if (variable) existingNames.add(variable.name)
  }

  const modeId = primitives.modes[0].modeId
  let variablesCreated = 0
  let variablesSkipped = 0
  for (const value of semanticSeed.primitives?.spacing ?? []) {
    const name = `spacing/${value}`
    if (existingNames.has(name)) { variablesSkipped += 1; continue }
    const variable = figma.variables.createVariable(name, primitives, 'FLOAT')
    variable.scopes = ['GAP', 'WIDTH_HEIGHT']
    variable.setValueForMode(modeId, value)
    variablesCreated += 1
  }

  return { collection: primitives, collectionCreated: created, variablesCreated, variablesSkipped }
}

async function ensureSemanticCollection() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  let semantic = collections.find((c) => c.name === 'Semantic')
  let collectionCreated = false
  let darkModeCreated = false

  if (!semantic) {
    semantic = figma.variables.createVariableCollection('Semantic')
    semantic.renameMode(semantic.modes[0].modeId, 'Light')
    collectionCreated = true
  }

  if (semantic.modes.length === 1) {
    semantic.addMode('Dark')
    darkModeCreated = true
  }
  // 2+ modes already present: already seeded, skip mode creation entirely.

  return { collection: semantic, collectionCreated, darkModeCreated }
}

async function importColorVariables(semantic) {
  const existingNames = new Set()
  for (const variableId of semantic.variableIds) {
    const variable = await figma.variables.getVariableByIdAsync(variableId)
    if (variable) existingNames.add(variable.name)
  }

  const lightMode = semantic.modes.find((m) => m.name === 'Light') ?? semantic.modes[0]
  const darkMode = semantic.modes.find((m) => m.name === 'Dark') ?? semantic.modes[1]

  let created = 0
  let skipped = 0
  for (const entry of DERIVED_SEED.colors ?? []) {
    if (existingNames.has(entry.name)) { skipped += 1; continue }

    const variable = figma.variables.createVariable(entry.name, semantic, 'COLOR')
    variable.scopes = entry.scopes

    for (const [modeName, kitKey] of Object.entries(entry.modes)) {
      const mode = modeName === 'Light' ? lightMode : modeName === 'Dark' ? darkMode : null
      if (!mode) continue
      const imported = await figma.variables.importVariableByKeyAsync(kitKey)
      variable.setValueForMode(mode.modeId, figma.variables.createVariableAlias(imported))
    }
    created += 1
  }
  return { created, skipped }
}

async function importFloatVariables(semantic) {
  const existingNames = new Set()
  for (const variableId of semantic.variableIds) {
    const variable = await figma.variables.getVariableByIdAsync(variableId)
    if (variable) existingNames.add(variable.name)
  }

  let created = 0
  let skipped = 0
  for (const entry of DERIVED_SEED.floats ?? []) {
    if (existingNames.has(entry.name)) { skipped += 1; continue }

    const variable = figma.variables.createVariable(entry.name, semantic, 'FLOAT')
    variable.scopes = entry.scopes
    const imported = await figma.variables.importVariableByKeyAsync(entry.key)
    const alias = figma.variables.createVariableAlias(imported)
    // Same alias for both modes — the named float tokens (radius/stroke/
    // border-width) are mode-agnostic (spike-confirmed).
    for (const mode of semantic.modes) {
      variable.setValueForMode(mode.modeId, alias)
    }
    created += 1
  }
  return { created, skipped }
}

/**
 * D24 starter layout tokens — local aliases into the (now-seeded) Primitives
 * spacing scale, so a project has at least one legal Semantic spacing
 * binding out of the box. Driven entirely by the seed's `semanticSpacing`
 * entries (name + which local Primitives variable each aliases) — no names
 * or values hardcoded here.
 */
async function createSpacingStarterTokens(semantic, primitives) {
  const existingNames = new Set()
  for (const variableId of semantic.variableIds) {
    const variable = await figma.variables.getVariableByIdAsync(variableId)
    if (variable) existingNames.add(variable.name)
  }

  const primitivesVarByName = new Map()
  for (const variableId of primitives.variableIds) {
    const variable = await figma.variables.getVariableByIdAsync(variableId)
    if (variable) primitivesVarByName.set(variable.name, variable)
  }

  let created = 0
  let skipped = 0
  for (const starter of semanticSeed.semanticSpacing ?? []) {
    if (existingNames.has(starter.name)) { skipped += 1; continue }
    const source = primitivesVarByName.get(starter.primitive)
    if (!source) continue

    const variable = figma.variables.createVariable(starter.name, semantic, 'FLOAT')
    variable.scopes = ['GAP']
    const alias = figma.variables.createVariableAlias(source)
    for (const mode of semantic.modes) {
      variable.setValueForMode(mode.modeId, alias)
    }
    created += 1
  }
  return { created, skipped }
}

async function seedSemantic() {
  const {
    collection: primitives,
    collectionCreated: primitivesCollectionCreated,
    variablesCreated: primitivesVariablesCreated,
    variablesSkipped: primitivesVariablesSkipped
  } = await ensurePrimitivesCollection()
  const { collection: semantic, collectionCreated: semanticCollectionCreated, darkModeCreated } =
    await ensureSemanticCollection()

  const colors = await importColorVariables(semantic)
  const floats = await importFloatVariables(semantic)
  const starters = await createSpacingStarterTokens(semantic, primitives)

  const summary = {
    primitivesCollectionCreated,
    primitivesVariablesCreated,
    primitivesVariablesSkipped,
    semanticCollectionCreated,
    darkModeCreated,
    semanticColorVariablesCreated: colors.created,
    semanticColorVariablesSkipped: colors.skipped,
    semanticFloatVariablesCreated: floats.created,
    semanticFloatVariablesSkipped: floats.skipped,
    spacingStarterVariablesCreated: starters.created,
    spacingStarterVariablesSkipped: starters.skipped
  }
  console.log('seed-semantic summary:', JSON.stringify(summary))
  return summary
}

seedSemantic
