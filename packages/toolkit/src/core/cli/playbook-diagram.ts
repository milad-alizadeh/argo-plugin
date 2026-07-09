import { renderPlaybookDiagram } from '../diagram.js'
import { getPlaybook } from '../spec.js'
import { PlaybookNotFoundError } from './errors.js'

/** `argo playbook diagram <name>` (Slice 5, step 17): resolves the spec by
 * name from the registry and renders it via `renderPlaybookDiagram`. */
export function playbookDiagram(name: string): string {
  const spec = getPlaybook(name)
  if (!spec) throw new PlaybookNotFoundError(name)
  return renderPlaybookDiagram(spec)
}
