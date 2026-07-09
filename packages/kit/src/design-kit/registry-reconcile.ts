/**
 * design-memory-placement.md A3: the figma-sync registry-reconcile sweep
 * already traverses every top-level COMPONENT/COMPONENT_SET on Custom
 * Components — this diffs that same live list against `registry.json`,
 * catching drift the per-task incremental upsert can't see on its own (a
 * crashed agent that never reached its final upsert, a human rename). Both
 * findings are advisory (never block a commit) and self-correct on the next
 * `figma-create` upsert. The nodeId-heal step ("re-resolve + persist any
 * entry whose nodeId moved") is a live-Figma-only concern (the walker must
 * call `getNodeByIdAsync`/`findAll`) and is documented, not implemented,
 * here — see `skills/figma-sync/SKILL.md`.
 *
 * `category` was dropped from the schema (design-system-reset-overhaul.md
 * Slice 4, decision 4's flat registry) — `registry-miscategorized` had
 * nothing left to compare and is deleted, not softened.
 */

import { isWireframePageName } from './tier0-rules.js'

type LiveComponent = { name: string; nodeId: string; pageName?: string }
type RegistryEntry = { name: string; nodeId: string; nodeIdResolves?: boolean }
type Violation = { rule: string; detail: string }

/** Sandbox pages never generate registry-hygiene noise (design doc decision 4). */
export function isScratchPageName(pageName: string): boolean {
  return pageName.startsWith('Scratch')
}

/** A section-separator page: name begins with 2+ dash/box-dash chars ('---', '------', '──── Wireframes ────'). */
export function isDividerPageName(pageName: string): boolean {
  return /^[─-]{2,}/.test(pageName.trim())
}

/**
 * Per-name exclusion of a project's OWN canonical pages (file-structure.md's
 * page order) and divider/sandbox pages. Used as a within-band safety filter
 * by `kitPageNames`, not as the primary kit/not-kit decision (that is
 * positional, see `kitPageNames`).
 */
/**
 * Per-project non-kit page patterns (directive 2, config-driven exclusion):
 * a page whose name matches any of these is never a kit page, regardless of
 * where it sits. A pattern is either an exact name or a `*`-glob (only `*`
 * is special; e.g. `*Icons` matches `Lucide Icons`/`HugeIcons`). Config lives
 * in `.claude/argo.json`'s `design.<app>.nonKitPages`; when absent it
 * defaults to `DEFAULT_NON_KIT_PAGE_PATTERNS` (the icon-library convention).
 * Files change per project, so this is config, not a hardcoded list.
 */
export const DEFAULT_NON_KIT_PAGE_PATTERNS = ['*Icons', '*Icon']

function matchesPagePattern(pageName: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    if (!p.includes('*')) return pageName === p
    const re = new RegExp('^' + p.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$')
    return re.test(pageName)
  })
}

export function isKitPageName(pageName: string, nonKitPages: string[] = DEFAULT_NON_KIT_PAGE_PATTERNS): boolean {
  if (pageName === 'Custom Components' || pageName === 'Foundations' || pageName === 'Screens') return false
  if (isWireframePageName(pageName)) return false // Cover + W\d{2}
  if (/^D\d{2}(\b|\s)/.test(pageName)) return false // D\d{2} hi-fi groups
  if (isScratchPageName(pageName)) return false
  if (isDividerPageName(pageName)) return false
  if (matchesPagePattern(pageName, nonKitPages)) return false
  return true
}

/**
 * Positional kit-page classifier. The shadcn starter groups its reusable
 * primitives in the FIRST divider-delimited band: pages before the first
 * separator are project/doc pages (Cover, Custom Components, Screens); the
 * pages between the first and second separator are the primitives; everything
 * from the second separator onward is the starter's demo sections
 * (Examples/Blocks/Charts) and icon libraries (Lucide/Tabler/... Icons).
 *
 * Returns page INDICES, not names, and MUST be positional: the starter reuses
 * primitive names for demo pages (this file has `Calendar`, `Sidebar`, and
 * `Tooltip` as BOTH a real primitive page AND a later demo page), so a
 * name-keyed result cannot tell the kit-band `Calendar` from the demo-band
 * `Calendar` — both share the string. A name allowlist would separately need
 * the per-file page list this project refuses to carry as config. Fails
 * closed: a file with no divider structure yields no kit pages (better than
 * enumerating every icon-library page as kit, which produced ~14k bogus
 * entries before this fix).
 */
export function kitPageIndices(orderedPageNames: string[], nonKitPages: string[] = DEFAULT_NON_KIT_PAGE_PATTERNS): Set<number> {
  const firstDivider = orderedPageNames.findIndex(isDividerPageName)
  if (firstDivider === -1) return new Set()
  let end = orderedPageNames.length
  for (let i = firstDivider + 1; i < orderedPageNames.length; i++) {
    if (isDividerPageName(orderedPageNames[i])) {
      end = i
      break
    }
  }
  const kit = new Set<number>()
  for (let i = firstDivider + 1; i < end; i++) {
    // config nonKitPages excludes icon pages regardless of band position, so
    // deleting the demo dividers (which merges primitives + icons into one
    // band) can't leak icons into the kit set.
    if (isKitPageName(orderedPageNames[i], nonKitPages)) kit.add(i)
  }
  return kit
}

export function reconcileRegistrySweep({
  liveComponents = [],
  registryEntries = []
}: { liveComponents?: LiveComponent[]; registryEntries?: RegistryEntry[] } = {}): Violation[] {
  const violations: Violation[] = []
  const registryByName = new Map(registryEntries.map((e) => [e.name, e]))

  for (const entry of registryEntries) {
    const nodeIdResolves = entry.nodeIdResolves !== false
    if (!nodeIdResolves && !liveComponents.some((c) => c.name === entry.name)) {
      violations.push({
        rule: 'registry-orphan',
        detail: `registry entry "${entry.name}" nodeId no longer resolves and no live component with that name was found`
      })
    }
  }

  for (const live of liveComponents) {
    if (live.pageName && isScratchPageName(live.pageName)) continue
    const entry = registryByName.get(live.name)
    if (!entry) {
      violations.push({ rule: 'registry-unregistered', detail: `live component "${live.name}" has no registry entry` })
    }
    if (!isPascalCaseComponentName(live.name)) {
      violations.push({
        rule: 'component-name-not-pascal',
        detail: `component "${live.name}" must be PascalCase to match its React component name (e.g. "${toPascalCase(live.name)}")`
      })
    }
  }

  return violations
}

type VariantPropertyDefinition = { type: string; variantOptions?: string[] }

/** Mirrors tier0-rules.ts's variantNamingViolations' read of the same node shape. */
export function extractVariantMatrix(
  componentPropertyDefinitions: Record<string, VariantPropertyDefinition> = {}
): Record<string, string[]> {
  const matrix: Record<string, string[]> = {}
  for (const [propName, def] of Object.entries(componentPropertyDefinitions)) {
    if (def.type === 'VARIANT' && Array.isArray(def.variantOptions)) matrix[propName] = def.variantOptions
  }
  return matrix
}

/** Icon components (lucide/*) and demo furniture keep their own naming conventions. */
const PASCAL_EXEMPT_PREFIXES = ['lucide/', 'demo/']

export function isPascalCaseComponentName(name: string): boolean {
  if (PASCAL_EXEMPT_PREFIXES.some((p) => name.startsWith(p))) return true
  return /^[A-Z][A-Za-z0-9]*$/.test(name)
}

/**
 * The `@when-to-use: <text>` usage marker — free-text guidance ("this IS the
 * children-tree solution") a resolving designer reads from the compact registry
 * index instead of guessing among look-alike components. Annotation-first, like
 * every argo marker (Dev Mode annotations are argo's documentation layer in
 * Figma — the same surface as `@screen` and `@code-owned`); the description
 * read below is the legacy transition fallback and drops a release later.
 * Captures the rest of the marker's line; pure and deterministic.
 */
export function parseWhenToUse(text?: string): string | null {
  if (!text) return null
  const m = text.match(/@when-to-use:[ \t]*([^\n]+)/)
  const value = m?.[1]?.trim()
  return value ? value : null
}

/** Annotation-source read of `@when-to-use:` — the canonical home. */
export function parseWhenToUseFromAnnotations(annotations?: Array<{ label?: string; labelMarkdown?: string }>): string | null {
  if (!Array.isArray(annotations)) return null
  for (const a of annotations) {
    const fromLabel = parseWhenToUse(a?.label)
    if (fromLabel) return fromLabel
    const fromMd = parseWhenToUse(a?.labelMarkdown)
    if (fromMd) return fromMd
  }
  return null
}

/** Dual-source resolver: annotation wins, legacy description marker is fallback (same transition pattern as `resolveCodeOwnedPath`). */
export function resolveWhenToUse({
  description,
  annotations
}: {
  description?: string
  annotations?: Array<{ label?: string; labelMarkdown?: string }>
}): string | null {
  return parseWhenToUseFromAnnotations(annotations) ?? parseWhenToUse(description)
}

type LiveKitComponent = {
  name: string
  nodeId: string
  componentPropertyDefinitions?: Record<string, VariantPropertyDefinition>
  /** Native Figma component description, owner addendum (registry-covers-kit.md). */
  description?: string
  /** Dev Mode annotations — the new canonical home of the `@code-owned:` marker. */
  annotations?: Array<{ label?: string; labelMarkdown?: string }>
}
type LeanKitEntry = {
  nodeId: string
  kind: 'kit'
  status: 'draft'
  lastSyncedAt: string
  variantMatrix: Record<string, string[]>
  description?: string
  whenToUse?: string
}

/**
 * Entries for kit components the registry has never seen, never
 * overwrites an EXISTING kit entry's status/lastSyncedAt (that stays the
 * pre-existing decision-8 staleness sweep's job, which already runs
 * file-wide over every registry entry regardless of kind); this only
 * fills the gap for a component with no entry at all. status: 'draft'
 * (never audited, never synced before), figma-create's own upsert is
 * the only writer of 'audit-clean', and only after its own self-audit.
 */
export function buildKitRegistryEntries(
  { liveKitComponents, existingNames }: { liveKitComponents: LiveKitComponent[]; existingNames: Set<string> },
  now: string
): Record<string, LeanKitEntry> {
  const entries: Record<string, LeanKitEntry> = {}
  for (const c of liveKitComponents) {
    if (existingNames.has(c.name)) continue
    if (PASCAL_EXEMPT_PREFIXES.some((p) => c.name.startsWith(p))) continue
    if (resolveCodeOwnedPath(c)) continue // code-owned wins over positional kit classification
    entries[c.name] = {
      nodeId: c.nodeId,
      kind: 'kit',
      status: 'draft',
      lastSyncedAt: now,
      variantMatrix: extractVariantMatrix(c.componentPropertyDefinitions),
      ...(c.description ? { description: c.description } : {}),
      ...(resolveWhenToUse(c) ? { whenToUse: resolveWhenToUse(c)! } : {})
    }
  }
  return entries
}

export type ChangedKitComponent = {
  name: string
  reasons: string[]
  variantMatrix: Record<string, string[]>
  description?: string
  whenToUse?: string
}

/**
 * Detects MANUAL out-of-band Figma edits to already-registered kit components
 * (directive 6): a designer/human adds a button variant, renames a variant
 * option, or edits the native description directly in Figma. Compares each
 * live kit component's variantMatrix + description against its committed
 * registry entry and reports the ones that drifted, with a human-readable
 * reason. This is the change-set the change-scoped re-audit (directive 4)
 * targets, so a manual edit is caught and re-verified without auditing the
 * whole kit. Pure: the caller supplies the committed entries.
 */
export function detectChangedKitComponents({
  liveKitComponents,
  registryComponents
}: {
  liveKitComponents: LiveKitComponent[]
  registryComponents: Record<string, { kind?: string; variantMatrix?: Record<string, string[]>; description?: string; whenToUse?: string }>
}): ChangedKitComponent[] {
  const changed: ChangedKitComponent[] = []
  for (const c of liveKitComponents) {
    if (PASCAL_EXEMPT_PREFIXES.some((p) => c.name.startsWith(p))) continue
    if (resolveCodeOwnedPath(c)) continue // handled by buildCodeOwnedEntries
    const entry = registryComponents[c.name]
    if (!entry || entry.kind !== 'kit') continue // new or non-kit handled elsewhere
    const liveMatrix = extractVariantMatrix(c.componentPropertyDefinitions)
    const liveWhenToUse = resolveWhenToUse(c)
    const reasons: string[] = []
    if (JSON.stringify(liveMatrix) !== JSON.stringify(entry.variantMatrix ?? {})) reasons.push('variantMatrix changed')
    if ((c.description ?? '') !== (entry.description ?? '')) reasons.push('description changed')
    if ((liveWhenToUse ?? '') !== (entry.whenToUse ?? '')) reasons.push('whenToUse changed')
    if (reasons.length)
      changed.push({
        name: c.name,
        reasons,
        variantMatrix: liveMatrix,
        ...(c.description ? { description: c.description } : {}),
        ...(liveWhenToUse ? { whenToUse: liveWhenToUse } : {})
      })
  }
  return changed
}

/**
 * The `@code-owned: <path>` marker read from a component `description`. The
 * marker is authored by the designer/figma-create when a placeholder screenshot
 * stands in for a code-native implementation. Returns the repo-relative path, or
 * null when the marker is absent/empty. The path is the first whitespace-
 * delimited token after the colon; the rest of the text (purpose, category) is
 * ignored. Pure and deterministic. NOTE: the marker's canonical home is moving
 * to a Dev annotation (see `resolveCodeOwnedPath`); this description read stays
 * for the transition release, then drops.
 */
export function parseCodeOwnedPath(description?: string): string | null {
  if (!description) return null
  const m = description.match(/@code-owned:\s*(\S+)/)
  return m ? m[1] : null
}

/**
 * The annotation-source read of the same `@code-owned: <path>` marker. The
 * marker is migrating from the component `description` (PublishableMixin) onto a
 * Dev Mode annotation `label`/`labelMarkdown` — the same layer screens already
 * use for `@screen` (see `hasScreenAnnotation`), so a code-owned component and a
 * screen now carry their identity marker uniformly. Returns the first
 * annotation-borne codePath, or null. Pure and deterministic.
 */
export function parseCodeOwnedFromAnnotations(annotations?: Array<{ label?: string; labelMarkdown?: string }>): string | null {
  if (!Array.isArray(annotations)) return null
  for (const a of annotations) {
    const fromLabel = parseCodeOwnedPath(a?.label)
    if (fromLabel) return fromLabel
    const fromMd = parseCodeOwnedPath(a?.labelMarkdown)
    if (fromMd) return fromMd
  }
  return null
}

/**
 * Dual-source resolver for the transition release: the annotation is the new
 * canonical home and WINS; the legacy `description` marker is still read as a
 * fallback so a not-yet-migrated file keeps classifying correctly. The
 * description read is dropped a release later (see designer-gap-closure plan) —
 * once every project has run the one-shot migration, only the annotation source
 * remains. Pure.
 */
export function resolveCodeOwnedPath({
  description,
  annotations
}: {
  description?: string
  annotations?: Array<{ label?: string; labelMarkdown?: string }>
}): string | null {
  return parseCodeOwnedFromAnnotations(annotations) ?? parseCodeOwnedPath(description)
}

type CodeOwnedEntry = {
  nodeId: string
  kind: 'code-owned'
  status: 'draft' | 'audit-clean' | 'out-of-sync' | 'orphaned'
  lastSyncedAt: string
  variantMatrix: Record<string, string[]>
  codePath: string
  description?: string
  whenToUse?: string
}

/**
 * Deterministic derivation of `code-owned` registry entries from the live
 * Figma components' `@code-owned:` marker (resolved dual-source: Dev annotation
 * first, description fallback — see `resolveCodeOwnedPath`) — runs over ALL live components regardless of
 * kit/custom page band (the marker overrides positional classification). For
 * each component carrying the `@code-owned:` marker it emits the registry
 * entry to write, but ONLY when new or drifted (nodeId/codePath/variantMatrix/
 * description changed) so a repeat pull is a no-op that preserves
 * `lastSyncedAt`. `status` is preserved from any existing entry, else
 * `audit-clean` — code-owned nodes are tier-0 exempt (a screenshot can't
 * satisfy binding rules), so "clean" is their resting state.
 */
export function buildCodeOwnedEntries(
  {
    liveComponents,
    registryComponents
  }: {
    liveComponents: LiveKitComponent[]
    registryComponents: Record<string, { kind?: string; nodeId?: string; codePath?: string; status?: string; variantMatrix?: Record<string, string[]>; description?: string; whenToUse?: string }>
  },
  now: string
): { written: Record<string, CodeOwnedEntry>; changed: ChangedKitComponent[] } {
  const written: Record<string, CodeOwnedEntry> = {}
  const changed: ChangedKitComponent[] = []
  for (const c of liveComponents) {
    const codePath = resolveCodeOwnedPath(c)
    if (!codePath) continue
    const prev = registryComponents[c.name]
    const variantMatrix = extractVariantMatrix(c.componentPropertyDefinitions)
    const whenToUse = resolveWhenToUse(c)
    const reasons: string[] = []
    if (!prev || prev.kind !== 'code-owned') reasons.push('new code-owned')
    else {
      if (prev.nodeId !== c.nodeId) reasons.push('nodeId changed')
      if (prev.codePath !== codePath) reasons.push('codePath changed')
      if (JSON.stringify(prev.variantMatrix ?? {}) !== JSON.stringify(variantMatrix)) reasons.push('variantMatrix changed')
      if ((prev.description ?? '') !== (c.description ?? '')) reasons.push('description changed')
      if ((whenToUse ?? '') !== (prev.whenToUse ?? '')) reasons.push('whenToUse changed')
    }
    if (reasons.length === 0) continue
    written[c.name] = {
      ...prev, // preserve any human/agent extras (e.g. notes) already on the entry
      nodeId: c.nodeId,
      kind: 'code-owned',
      status: (prev?.status as CodeOwnedEntry['status']) ?? 'audit-clean',
      lastSyncedAt: now,
      variantMatrix,
      codePath,
      ...(c.description ? { description: c.description } : {}),
      ...(whenToUse ? { whenToUse } : {})
    }
    changed.push({ name: c.name, reasons, variantMatrix, ...(c.description ? { description: c.description } : {}), ...(whenToUse ? { whenToUse } : {}) })
  }
  return { written, changed }
}

/**
 * A screen's identity marker (mirror of `@code-owned:`, which lives in a
 * component's `description`). Plain FRAME nodes are NOT PublishableMixin, so
 * they have no `description` field — the marker lives instead on a Dev Mode
 * `@screen` annotation (frames support AnnotationsMixin). True when any of the
 * frame's annotations carries `@screen` in its `label`/`labelMarkdown`. Pure and
 * deterministic — screen classification is a function of the live annotation
 * alone, never hand-maintained. Same word-boundary match the live tier-0 audit
 * uses (`tier0-audit.ts`'s `hasScreenAnnotation`).
 */
export function hasScreenAnnotation(annotations?: Array<{ label?: string; labelMarkdown?: string }>): boolean {
  if (!Array.isArray(annotations)) return false
  return annotations.some((a) => /@screen\b/.test(a?.label ?? '') || /@screen\b/.test(a?.labelMarkdown ?? ''))
}

type LiveScreenFrame = { name: string; nodeId: string; annotations?: Array<{ label?: string; labelMarkdown?: string }> }
type ScreenEntry = { nodeId: string; kind: 'screen'; status: string; lastSyncedAt: string; whenToUse?: string }

/**
 * Deterministic derivation of `kind:"screen"` registry entries from the live
 * top-level frames carrying an `@screen` Dev annotation — the screen analog of
 * `buildCodeOwnedEntries`. Emits an entry to write ONLY when new or drifted
 * (nodeId changed), so a repeat pull is a no-op preserving `lastSyncedAt`.
 * `status` is preserved from any existing entry, else `audit-clean` — a
 * registered screen's own artboard false positives are tier-0 exempt, so
 * "clean" is its resting state (identical rationale to code-owned).
 */
export function buildScreenEntries(
  {
    liveScreenFrames,
    registryComponents
  }: {
    liveScreenFrames: LiveScreenFrame[]
    registryComponents: Record<string, { kind?: string; nodeId?: string; status?: string; whenToUse?: string }>
  },
  now: string
): { written: Record<string, ScreenEntry>; changed: Array<{ name: string; reasons: string[] }> } {
  const written: Record<string, ScreenEntry> = {}
  const changed: Array<{ name: string; reasons: string[] }> = []
  for (const f of liveScreenFrames) {
    if (!hasScreenAnnotation(f.annotations)) continue
    const prev = registryComponents[f.name]
    // Screens are plain FRAMEs (no description), so @when-to-use is annotation-only here.
    const whenToUse = parseWhenToUseFromAnnotations(f.annotations)
    const reasons: string[] = []
    if (!prev || prev.kind !== 'screen') reasons.push('new screen')
    else {
      if (prev.nodeId !== f.nodeId) reasons.push('nodeId changed')
      if ((whenToUse ?? '') !== (prev.whenToUse ?? '')) reasons.push('whenToUse changed')
    }
    if (reasons.length === 0) continue
    written[f.name] = {
      ...prev,
      nodeId: f.nodeId,
      kind: 'screen',
      status: (prev?.status as string) ?? 'audit-clean',
      lastSyncedAt: now,
      ...(whenToUse ? { whenToUse } : {})
    }
    changed.push({ name: f.name, reasons })
  }
  return { written, changed }
}

/**
 * Derives kit ADOPTION (directive 3 refined, 2026-07-08) from live instance
 * usage: a kit master is "adopted" when a project surface (a custom/code-owned
 * component or a composed screen) instances it. figma-sync's reconcile walk
 * collects, across those surfaces, every `INSTANCE.mainComponent` id AND its
 * parent COMPONENT_SET id (a registry kit entry's `nodeId` is usually the set,
 * while an instance resolves to a child variant), passes them here as
 * `instancedNodeIds`, and stamps `adopted: true` on the returned names. Only
 * adopted kit is hard-audited/synced; raw kit (nothing instances it) is the
 * vendored mirror and stays advisory-only. Pure — the caller supplies the live
 * id set; custom/code-owned are never "adopted" (they're always in scope).
 */
export function deriveAdoption({
  registryComponents,
  instancedNodeIds
}: {
  registryComponents: Record<string, { kind?: string; nodeId?: string }>
  instancedNodeIds: Iterable<string>
}): { adoptedNames: string[] } {
  const instanced = new Set(instancedNodeIds)
  const adoptedNames: string[] = []
  for (const [name, entry] of Object.entries(registryComponents)) {
    if (entry?.kind !== 'kit') continue
    if (entry?.nodeId && instanced.has(entry.nodeId)) adoptedNames.push(name)
  }
  return { adoptedNames }
}

function toPascalCase(name: string): string {
  return name
    .split(/[\s_/-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}
