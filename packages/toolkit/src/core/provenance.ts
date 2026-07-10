import { createHash } from 'node:crypto'

/**
 * Template-drift detection (skills/init/SKILL.md §1, §5): any file argo
 * installs from a template — `.claude/rules/*.md` today, lefthook/probity/
 * depcruise starters later — is hand-adapted per project and expected to
 * diverge from its source template. This is advisory visibility into that
 * drift, never a version-handshake gate (the policy that init's re-run mode
 * explicitly opts out of).
 */

/** Content hash recorded in `.argo/config.json`'s `provenance` at install
 * time and recomputed against the CURRENT template on each `argo rules
 * status` run — sha1 matches the id scheme `state.ts` already uses. */
export function hashTemplateContent(content: string): string {
  return createHash('sha1').update(content).digest('hex')
}

export interface ProvenanceDiff {
  /** Recorded hash still matches the current template. */
  upToDate: string[]
  /** Recorded hash no longer matches — the installed file has drifted from
   * (or the template has moved past) what was adapted at install time. */
  diverged: string[]
  /** A current template with no recorded provenance — installed by hand or
   * predates provenance tracking. Distinct from `diverged`: never flagged as
   * a problem, per the init skill's "never flagged" rule for hand-installed
   * files. */
  unrecorded: string[]
}

/**
 * Pure diff: `recorded` is `.argo/config.json`'s `provenance` map (installed
 * path -> hash at install time), `current` is the same shape freshly hashed
 * from the plugin's own templates right now. A recorded entry whose template
 * no longer exists in `current` (retired template) is silently dropped —
 * nothing to compare against.
 */
export function diffProvenance(input: {
  recorded: Record<string, string>
  current: Record<string, string>
}): ProvenanceDiff {
  const upToDate: string[] = []
  const diverged: string[] = []
  const unrecorded: string[] = []

  for (const [path, currentHash] of Object.entries(input.current)) {
    const recordedHash = input.recorded[path]
    if (recordedHash === undefined) {
      unrecorded.push(path)
    } else if (recordedHash === currentHash) {
      upToDate.push(path)
    } else {
      diverged.push(path)
    }
  }

  return { upToDate, diverged, unrecorded }
}
