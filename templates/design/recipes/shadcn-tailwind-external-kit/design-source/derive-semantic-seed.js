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
 * Kit-side shape (LIVE-CONFIRMED against fileKey 4lPUPl8OUan4i90Bc2ZMXe,
 * semantic-seeding.md Slice 8):
 * - The collection is literally named `mode` (47 variables), with modes
 *   named `light mode`/`dark mode` (lowercase, informal — not "Light"/
 *   "Dark"). It holds every COLOR semantic plus the named FLOAT tokens
 *   (radius-*, stroke-width, border-width) as same-alias-both-modes entries.
 *   IMPORTANT: the kit file also has an `rdx/colors` collection with the
 *   same two mode names (Radix's own light/dark palette, 396 vars) — do NOT
 *   pick "any two-mode collection", match by name `mode` specifically.
 * - The kit's separate single-mode `tokens` collection is a generic 89-entry
 *   number scale (0, 1, 2, ... 9999) — NOT the named semantic floats. It is
 *   never dumped wholesale; only the named FLOAT entries of the `mode`
 *   collection are captured.
 * - This script writes the seed's per-mode keys as the CANONICAL `Light`/
 *   `Dark` names (matching seed-semantic.js's own Semantic collection mode
 *   names), not the kit's raw `light mode`/`dark mode` — mapped by fuzzy
 *   substring match ("light"/"dark") on the kit's mode name.
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
 * Role -> scopes mapping (spike Finding 2). LIVE-CONFIRMED against every one
 * of the 31 real semantic color names + 12 float names in the kit's `mode`
 * collection (semantic-seeding.md Slice 8, fileKey 4lPUPl8OUan4i90Bc2ZMXe) —
 * no name in the real file falls through to the null/throw case below.
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

async function findSemanticModeCollection() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  const collection = collections.find((c) => c.name === 'mode' && c.modes.length === 2)
  if (!collection) {
    throw new Error(
      'derive-semantic-seed: no two-mode collection named "mode" found in the kit file. ' +
      'This name was live-confirmed against fileKey 4lPUPl8OUan4i90Bc2ZMXe (semantic-seeding.md Slice 8) — ' +
      'if the kit has since been renamed, update this lookup.'
    )
  }
  return collection
}

function canonicalModeName(kitModeName) {
  const lower = kitModeName.toLowerCase()
  if (lower.includes('dark')) return 'Dark'
  if (lower.includes('light')) return 'Light'
  throw new Error(`derive-semantic-seed: could not map kit mode name "${kitModeName}" to canonical Light/Dark`)
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
  const collection = await findSemanticModeCollection()
  const [modeA, modeB] = collection.modes
  const canonicalA = canonicalModeName(modeA.name)
  const canonicalB = canonicalModeName(modeB.name)

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
          [canonicalA]: await resolveAliasTargetKey(variable, modeA.modeId),
          [canonicalB]: await resolveAliasTargetKey(variable, modeB.modeId)
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
