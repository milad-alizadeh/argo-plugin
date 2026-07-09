import { assertPackAvailable, readConfig } from '../config.js';
import { getWorkflow } from '../spec.js';
import { deriveInstanceKey, setActiveInstance, writeInstance } from '../state.js';
import { WorkflowNotFoundError } from './errors.js';
/**
 * `argo workflow start` (Slice 5, step 13): resolves `input.name` against the
 * spec registry, refuses at start time (never mid-run, audit 2.4) if the
 * spec's terminal stage hands off to a disabled pack, then writes the initial
 * instance at the first stage.
 */
export function workflowStart(input, opts = {}) {
    const spec = getWorkflow(input.name);
    if (!spec)
        throw new WorkflowNotFoundError(input.name);
    const config = readConfig(opts.cwd ?? process.cwd());
    const terminalStage = spec.stages[spec.stages.length - 1];
    if (terminalStage.handsOffToPack) {
        assertPackAvailable(spec.name, terminalStage.handsOffToPack, config);
    }
    const key = input.key ?? deriveInstanceKey(input.name, input.target);
    const instance = {
        workflow: input.name,
        target: input.target,
        stage: spec.stages[0].name,
        status: 'in-progress',
        attempts: [],
        history: []
    };
    writeInstance(key, instance, opts);
    // Newly-started instance becomes "the" active workflow for this project —
    // the permission hook has no other way to know which instance a generic
    // tool call should be checked against (see `setActiveInstance`'s doc).
    setActiveInstance(key, opts);
    return { key, instance };
}
//# sourceMappingURL=workflow-start.js.map