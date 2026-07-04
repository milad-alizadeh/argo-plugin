/**
 * Derives semantic-seed.json's content from the published shadcn kit library
 * file (D19/D23-F3). RUNS IN THE KIT FILE, NOT THE PROJECT FILE — this is a
 * maintenance script, run on-demand via `use_figma` against the kit's own
 * fileKey, never installed into a host project (templates-reference.md marks
 * it "reference only").
 *
 * Why a separate file/call: getLocalVariableCollectionsAsync() only resolves
 * a file's OWN local collections — the teamLibrary API visible from the
 * project file exposes library names/keys but not valuesByMode/alias targets
 * (semantic-seeding.md's spike Finding 1). Deriving the seed therefore
 * requires a live use_figma call scoped to the kit file itself.
 *
 * Kit-side shape (spike-confirmed, semantic-seeding.md §2 decision 1):
 * - A two-mode collection ("shadcn's stock semantics as per-mode aliases to
 *   kit primitives") holds every COLOR semantic plus the named FLOAT tokens
 *   (radius-*, stroke-width, border-width) as same-alias-both-modes entries.
 *   The exact collection name/mode names (Light/Dark vs. mode) are confirmed
 *   live in semantic-seeding.md's Slice 8 — this script looks for a
 *   collection with exactly two modes rather than hardcoding a name.
 * - The kit's separate single-mode `tokens` collection is a generic 89-entry
 *   number scale (0, 1, 2, ... 9999) — NOT the named semantic floats. It is
 *   never dumped wholesale; only the named FLOAT entries of the two-mode
 *   collection are captured.
 *
 * Output: writes semantic-seed.json's shape (see that file for the schema).
 */

// Demo-only variables shipped in the stock kit that are not part of the real
// semantic set (spike Finding 1, confirmed live) — excluded from the dump.
const DEMO_ARTIFACT_NAMES = new Set([
  'background-color',
  'semantic-background',
  'semantic-border',
  'semantic-foreground'
])

/**
 * Role -> scopes mapping (spike Finding 2, verbatim). Match by suffix/exact
 * name, not prefix — the real kit names are suffixed, not prefixed, except
 * for the chart- and radius- prefixed entries. Confirm this table
 * against the REAL variable name list in the live-verification slice
 * (semantic-seeding.md Slice 8) before treating it as ground truth.
 */
function roleScopesFor(name) {
  if (['background', 'card', 'popover', 'sidebar'].includes(name)) return ['FRAME_FILL', 'SHAPE_FILL']
  if (name === 'foreground' || name.endsWith('-foreground')) return ['TEXT_FILL', 'SHAPE_FILL']
  if ([
    'primary', 'secondary', 'muted', 'accent', 'destructive',
    'sidebar-primary', 'sidebar-accent'
  ].includes(name)) return ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL']
  if (['border', 'ring', 'sidebar-border', 'sidebar-ring'].includes(name)) return ['STROKE_COLOR']
  if (name === 'input') return ['STROKE_COLOR', 'FRAME_FILL']
  if (name.startsWith('chart-')) return ['SHAPE_FILL', 'STROKE_COLOR']
  if (name.startsWith('radius-')) return ['CORNER_RADIUS']
  if (name === 'stroke-width' || name === 'border-width') return ['STROKE_FLOAT']
  return null
}

async function findTwoModeCollection() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  const candidates = collections.filter((c) => c.modes.length === 2)
  if (candidates.length !== 1) {
    throw new Error(
      `derive-semantic-seed: expected exactly one two-mode collection in the kit file, found ${candidates.length}. ` +
      'Confirm the kit\'s real collection name/shape (semantic-seeding.md Slice 8) and adjust this lookup if needed.'
    )
  }
  return candidates[0]
}

async function resolveAliasTargetKey(variable, modeId) {
  const value = variable.valuesByMode[modeId]
  if (value?.type !== 'VARIABLE_ALIAS') {
    throw new Error(`derive-semantic-seed: expected variable "${variable.name}" mode ${modeId} to be an alias, got ${JSON.stringify(value)}`)
  }
  const target = await figma.variables.getVariableByIdAsync(value.id)
  if (!target) throw new Error(`derive-semantic-seed: alias target for "${variable.name}" could not be resolved`)
  return target.key
}

async function deriveSemanticSeed() {
  const collection = await findTwoModeCollection()
  const [modeA, modeB] = collection.modes

  const colors = []
  const floats = []

  for (const variableId of collection.variableIds) {
    const variable = await figma.variables.getVariableByIdAsync(variableId)
    if (!variable) continue
    if (DEMO_ARTIFACT_NAMES.has(variable.name)) continue

    const scopes = roleScopesFor(variable.name)
    if (!scopes) {
      throw new Error(`derive-semantic-seed: no role-scope mapping for variable "${variable.name}" — extend roleScopesFor and re-run`)
    }

    if (variable.resolvedType === 'COLOR') {
      colors.push({
        name: variable.name,
        resolvedType: 'COLOR',
        scopes,
        modes: {
          [modeA.name]: await resolveAliasTargetKey(variable, modeA.modeId),
          [modeB.name]: await resolveAliasTargetKey(variable, modeB.modeId)
        }
      })
    } else if (variable.resolvedType === 'FLOAT') {
      // Spike-confirmed: each mode aliases the same primitive for the named
      // float tokens (radius-*, stroke-width, border-width) — one key, not
      // per-mode.
      floats.push({
        name: variable.name,
        resolvedType: 'FLOAT',
        scopes,
        key: await resolveAliasTargetKey(variable, modeA.modeId)
      })
    }
  }

  return { colors, floats }
}

deriveSemanticSeed
