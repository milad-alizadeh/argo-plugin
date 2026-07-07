/**
 * P4b completeness-checklist generator (design-process-simplification.md,
 * 2026-07-07): the DETERMINISTIC half of the advisory completeness pass. It
 * parses a feature PRD and emits, for one screen, the list of requirements the
 * design-verifier agent must rule present/absent against the built screenshot.
 *
 * Deterministic selection (no LLM, no judgement): a requirement belongs on a
 * screen's checklist iff the PRD's feature→screen matrix disposes it
 * `covered-by` that screen AND its `Visible in build?` is `yes` or `partial`.
 * Generating the checklist mechanically (rather than letting the verifier pick
 * rows out of the raw PRD) is what keeps the check honest and reproducible — the
 * verifier only judges the screenshot, it never decides what's in scope.
 *
 * PURE: parses markdown text, no fs. The skill reads the PRD file and passes it.
 */

export type Requirement = { id: string; requirement: string; acceptance: string; visible: string }
export type ChecklistEntry = { id: string; requirement: string; acceptance: string; visible: string }

/** Split a markdown table row into trimmed cells, dropping the leading/trailing
 * empties from the outer pipes. Returns null for a non-row or a separator row
 * (`| --- | --- |`). */
function tableCells(line: string): string[] | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return null
  const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
  if (cells.every((c) => /^:?-+:?$/.test(c) || c === '')) return null
  return cells
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, '')
}

/**
 * Parses the requirements table (the one whose header carries a
 * `Visible in build?` column). Column order is discovered from the header, so
 * an extra column (e.g. a REQ-ID rename) doesn't shift the parse.
 */
export function parseRequirements(md: string): Requirement[] {
  const lines = md.split('\n')
  const out: Requirement[] = []
  let cols: { id: number; requirement: number; acceptance: number; visible: number } | null = null

  for (const line of lines) {
    const cells = tableCells(line)
    if (!cells) {
      if (cols && line.trim() === '') cols = null // blank line ends the table
      continue
    }
    const header = cells.map(normalize)
    const visibleIdx = header.findIndex((h) => h.includes('visibleinbuild'))
    if (visibleIdx !== -1) {
      cols = {
        id: header.findIndex((h) => h === 'id'),
        requirement: header.findIndex((h) => h.startsWith('requirement')),
        acceptance: header.findIndex((h) => h.startsWith('acceptance')),
        visible: visibleIdx
      }
      continue
    }
    if (!cols) continue
    const id = cols.id === -1 ? '' : cells[cols.id] ?? ''
    if (!id || id === '…' || id === '...') continue
    out.push({
      id,
      requirement: cols.requirement === -1 ? '' : cells[cols.requirement] ?? '',
      acceptance: cols.acceptance === -1 ? '' : cells[cols.acceptance] ?? '',
      visible: normalize(cols.visible === -1 ? '' : cells[cols.visible] ?? '')
    })
  }
  return out
}

/**
 * Parses the feature→screen matrix (header has both `Requirement` and
 * `Disposition`). Returns each `{ id, disposition }`. Disposition text is kept
 * raw so `selectChecklistForScreen` can read its `covered-by:` screen list.
 */
export function parseMatrix(md: string): { id: string; disposition: string }[] {
  const lines = md.split('\n')
  const out: { id: string; disposition: string }[] = []
  let cols: { id: number; disposition: number } | null = null

  for (const line of lines) {
    const cells = tableCells(line)
    if (!cells) {
      if (cols && line.trim() === '') cols = null
      continue
    }
    const header = cells.map(normalize)
    const reqIdx = header.findIndex((h) => h.startsWith('requirement') || h === 'id')
    const dispIdx = header.findIndex((h) => h.startsWith('disposition'))
    if (reqIdx !== -1 && dispIdx !== -1) {
      cols = { id: reqIdx, disposition: dispIdx }
      continue
    }
    if (!cols) continue
    const id = cells[cols.id] ?? ''
    if (!id || id === '…' || id === '...') continue
    out.push({ id, disposition: cells[cols.disposition] ?? '' })
  }
  return out
}

/** True when a `covered-by: a, b, c` disposition names `screen` (normalized,
 * tolerant of surface-list punctuation). Only `covered-by` counts — `deferred:`
 * / `open:` dispositions are not on any screen's build checklist. */
function coversScreen(disposition: string, screen: string): boolean {
  const m = /covered-by\s*:?\s*(.+)$/i.exec(disposition.trim())
  if (!m) return false
  const target = normalize(screen)
  return m[1]
    .split(/[,;/]+/)
    .map((t) => normalize(t))
    .some((t) => t !== '' && (t === target || t.includes(target) || target.includes(t)))
}

/**
 * The deterministic checklist for one screen: requirements the matrix disposes
 * `covered-by` this screen whose `Visible in build?` is `yes` or `partial`.
 * `no`/absent-visibility requirements and non-covered requirements are excluded.
 */
export function selectChecklistForScreen(md: string, screen: string): ChecklistEntry[] {
  const covered = new Set(
    parseMatrix(md)
      .filter((row) => coversScreen(row.disposition, screen))
      .map((row) => normalize(row.id))
  )
  const seen = new Set<string>()
  const checklist: ChecklistEntry[] = []
  for (const r of parseRequirements(md)) {
    const key = normalize(r.id)
    if (seen.has(key)) continue
    if (!covered.has(key) || (r.visible !== 'yes' && r.visible !== 'partial')) continue
    seen.add(key)
    checklist.push({ id: r.id, requirement: r.requirement, acceptance: r.acceptance, visible: r.visible })
  }
  return checklist
}
