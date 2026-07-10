import { createHash } from 'node:crypto'

/**
 * Template-drift detection: any file argo installs from a template is
 * hand-adapted per project and expected to diverge from its source. This is
 * advisory visibility into that drift, never a version-handshake gate.
 */

/** Content hash recorded in `.argo/config.json`'s `provenance` at install
 * time and recomputed against the current template on each status run. */
export function hashTemplateContent(content: string): string {
  return createHash('sha1').update(content).digest('hex')
}

export interface ProvenanceDiff {
  /** Recorded hash still matches the current template. */
  upToDate: string[]
  /** Recorded hash no longer matches — the installed file has drifted from
   * (or the template has moved past) what was adapted at install time. */
  diverged: string[]
  /** A current template with no recorded provenance. Distinct from
   * `diverged`: never flagged as a problem. */
  unrecorded: string[]
}

/**
 * Pure diff: `recorded` is the install-time path -> hash map, `current` is
 * the same shape freshly hashed from the plugin's templates now. A recorded
 * entry whose template no longer exists in `current` is silently dropped.
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
