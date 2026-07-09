import { getWorkflow } from '../spec.js';
import { readInstance } from '../state.js';
/**
 * `argo workflow status` (Slice 5, step 14): reads and formats an instance
 * for display. Never throws for a missing instance — `found: false` is the
 * documented "no active workflow" case (matches `readInstance`'s null
 * sentinel and the design doc's CLI verification wording).
 */
export function workflowStatus(key, opts = {}) {
    const instance = readInstance(key, opts);
    if (!instance)
        return { found: false, key };
    const spec = getWorkflow(instance.workflow);
    const stageSpec = spec?.stages.find((s) => s.name === instance.stage);
    const attemptsInStage = stageSpec ? instance.attempts.filter((a) => a.gate === stageSpec.gate).length : 0;
    const budget = stageSpec?.retries;
    const stuck = instance.status === 'stuck' || (budget !== undefined && attemptsInStage >= budget);
    return {
        found: true,
        key,
        workflow: instance.workflow,
        target: instance.target,
        stage: instance.stage,
        status: instance.status,
        stuck,
        attemptsInStage,
        lastVerdict: instance.history.length > 0 ? instance.history[instance.history.length - 1].verdict : null
    };
}
//# sourceMappingURL=workflow-status.js.map