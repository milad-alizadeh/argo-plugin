import { renderWorkflowDiagram } from '../diagram.js'
import { getWorkflow } from '../spec.js'
import { WorkflowNotFoundError } from './errors.js'

/** `argo workflow diagram <name>` (Slice 5, step 17): resolves the spec by
 * name from the registry and renders it via `renderWorkflowDiagram`. */
export function workflowDiagram(name: string): string {
  const spec = getWorkflow(name)
  if (!spec) throw new WorkflowNotFoundError(name)
  return renderWorkflowDiagram(spec)
}
