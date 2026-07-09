import { assertPackAvailable, readConfig } from '../config.js'
import { getPlaybook } from '../spec.js'
import { deriveInstanceKey, setActiveInstance, writeInstance, type StateOptions, type PlaybookInstance } from '../state.js'
import { PlaybookNotFoundError } from './errors.js'

export interface PlaybookStartInput {
  /** Name of a spec previously registered via `registerPlaybook`. */
  name: string
  /** The artifact/screen/branch this instance tracks — fed to `deriveInstanceKey`. */
  target: string
  /** Override the derived instance key (rarely needed — mostly for tests wanting a stable key). */
  key?: string
}

export interface PlaybookStartResult {
  key: string
  instance: PlaybookInstance
}

/**
 * `argo playbook start` (Slice 5, step 13): resolves `input.name` against the
 * spec registry, refuses at start time (never mid-run, audit 2.4) if the
 * spec's terminal stage hands off to a disabled pack, then writes the initial
 * instance at the first stage.
 */
export function playbookStart(input: PlaybookStartInput, opts: StateOptions = {}): PlaybookStartResult {
  const spec = getPlaybook(input.name)
  if (!spec) throw new PlaybookNotFoundError(input.name)

  // Plan↔run join-key contract: `argo plans` attributes a live run to its
  // plan doc by `run.target === plan basename`. A plan-doc target passed as
  // a path (".argo/plans/foo.md") would silently break that overlay, so it
  // is rejected here at start time.
  if (input.target.endsWith('.md') && (input.target.includes('/') || input.target.includes('\\'))) {
    throw new Error(
      `playbook start: plan target "${input.target}" must be the plan's BASENAME ` +
        `(e.g. "${input.target.split(/[/\\]/).pop()}") — \`argo plans\` joins a live run to its plan by basename`
    )
  }

  const config = readConfig(opts.cwd ?? process.cwd())
  const terminalStage = spec.stages[spec.stages.length - 1]
  if (terminalStage.handsOffToPack) {
    assertPackAvailable(spec.name, terminalStage.handsOffToPack, config)
  }

  const key = input.key ?? deriveInstanceKey(input.name, input.target)
  const instance: PlaybookInstance = {
    playbook: input.name,
    target: input.target,
    stage: spec.stages[0].name,
    status: 'in-progress',
    attempts: [],
    history: []
  }
  writeInstance(key, instance, opts)
  // Newly-started instance becomes "the" active playbook for this project —
  // the permission hook has no other way to know which instance a generic
  // tool call should be checked against (see `setActiveInstance`'s doc).
  setActiveInstance(key, opts)
  return { key, instance }
}
