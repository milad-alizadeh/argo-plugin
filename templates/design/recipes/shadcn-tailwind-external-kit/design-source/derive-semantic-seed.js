/**
 * Derives the live colors/floats data setup-design's §4a seeding pipeline
 * hands to seed-semantic.js (D19/D23-F3). RUNS IN THE KIT FILE, NOT THE
 * PROJECT FILE — installed alongside the seeder (baseSource ==
 * "external-library"), invoked via `use_figma` against the CONFIGURED kit
 * file key (`recipeConfig.figma.kitLibraryFileKey`) on EVERY seeding run,
 * and rerunnable by `design-upgrade` after a Library Swap.
 *
 * Why a separate file/call: getLocalVariableCollectionsAsync() only resolves
 * a file's OWN local collections — the teamLibrary API visible from the
 * project file exposes library names/keys but not valuesByMode/alias targets.
 * Deriving therefore requires a live use_figma call scoped to the kit file.
 *
 * Why nothing kit-derived is ever committed (semantic-seeding.md §2 Decision
 * 1): Figma variable KEYS are per-copy — every team's duplicate of the
 * community kit mints new variables with new keys, and a design-upgrade
 * re-import mints a new copy again. A committed key snapshot breaks on the
 * first upgrade and is useless to any project whose kit copy isn't the one
 * it was derived from. The stable cross-copy contract is NAMES (the `mode`
 * collection shape, variable names, the exclusion list, the role-scope
 * patterns) — those survive duplication/re-import; keys are resolved fresh
 * on every run. This script therefore RETURNS its { colors, floats } dump
 * in-session — it never writes a file — and the invoking skill hands that
 * return value to seed-semantic.js moments later in the same pipeline run.
 *
 * {{DERIVE_CONFIG_JSON}} — a JSON literal of this recipe's
 *   design-source/semantic-seed.json `derive` section
 *   (`{ excludeNames: string[], roleScopes: { exact, suffixes, prefixes } }`),
 *   injected by the invoking skill on every invocation — a use_figma script
 *   can't read project files itself, so this config can't be a static
 *   `import` like semantic-seed.json's project-owned sections are in
 *   seed-semantic.js.
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
 * - This script returns per-mode keys under the CANONICAL `Light`/`Dark`
 *   names (matching seed-semantic.js's own Semantic collection mode names),
 *   not the kit's raw `light mode`/`dark mode` — mapped by fuzzy substring
 *   match ("light"/"dark") on the kit's mode name.
 *
 * Confirmed live (Slice 8): the return shape is 31 COLOR entries (per-mode
 * keys) + 12 FLOAT entries (single key) = 43 total (47 minus the 4
 * exclusions) — no real variable name falls through to the "no role-scope
 * mapping" throw below.
 */

const DERIVE_CONFIG = JSON.parse('{{DERIVE_CONFIG_JSON}}')
const EXCLUDE_NAMES = new Set(DERIVE_CONFIG.excludeNames)

/** Match by exact name, then suffix, then prefix — data-driven, no hardcoded names here. */
function roleScopesFor(name) {
  if (DERIVE_CONFIG.roleScopes.exact[name]) return DERIVE_CONFIG.roleScopes.exact[name]
  for (const { suffix, scopes } of DERIVE_CONFIG.roleScopes.suffixes ?? []) {
    if (name.endsWith(suffix)) return scopes
  }
  for (const { prefix, scopes } of DERIVE_CONFIG.roleScopes.prefixes ?? []) {
    if (name.startsWith(prefix)) return scopes
  }
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
    if (EXCLUDE_NAMES.has(variable.name)) continue

    const scopes = roleScopesFor(variable.name)
    if (!scopes) {
      throw new Error(`derive-semantic-seed: no role-scope mapping for variable "${variable.name}" — extend semantic-seed.json's derive.roleScopes and re-run`)
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
