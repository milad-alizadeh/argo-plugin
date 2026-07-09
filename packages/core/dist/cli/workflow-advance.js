import { getGate } from '../gate.js';
import { getWorkflow } from '../spec.js';
import { readInstance, recordAttempt, recordHistory, writeInstance } from '../state.js';
import { GateNotFoundError, InstanceNotFoundError, StageNotFoundError, WorkflowNotFoundError } from './errors.js';
/**
 * `argo workflow advance` (Slice 5, step 15): runs the current stage's gate,
 * records the verdict to `history`, and either advances `stage` (pass),
 * records an `attempts[]` entry and stays for a retry (fail, budget left), or
 * parks `status: "stuck"` (fail, budget exhausted). A stage with no `gate`
 * declared advances immediately (nothing to check at its exit).
 */
export async function workflowAdvance(key, opts = {}) {
    const instance = readInstance(key, opts);
    if (!instance)
        throw new InstanceNotFoundError(key);
    const spec = getWorkflow(instance.workflow);
    if (!spec)
        throw new WorkflowNotFoundError(instance.workflow);
    const stageIndex = spec.stages.findIndex((s) => s.name === instance.stage);
    const stageSpec = spec.stages[stageIndex];
    if (!stageSpec)
        throw new StageNotFoundError(instance.stage, instance.workflow);
    if (!stageSpec.gate) {
        return advanceToNextStage(key, spec, stageIndex, opts);
    }
    const gate = getGate(stageSpec.gate);
    if (!gate)
        throw new GateNotFoundError(stageSpec.gate);
    const verdict = await gate.check({
        target: instance.target,
        artifacts: opts.artifacts ?? {},
        settings: opts.settings ?? {}
    });
    recordHistory(key, { stage: stageSpec.name, gate: stageSpec.gate, at: new Date().toISOString(), verdict }, opts);
    if (verdict.passed) {
        return advanceToNextStage(key, spec, stageIndex, opts);
    }
    // Fail: attempts[] is a whole-instance append-only log, so scope the
    // budget check to attempts recorded against THIS stage's gate — otherwise
    // an earlier, already-passed stage's failed attempts would count against
    // a later stage's budget.
    const attemptsSoFar = instance.attempts.filter((a) => a.gate === stageSpec.gate).length;
    const round = attemptsSoFar + 1;
    recordAttempt(key, { round, gate: stageSpec.gate, findings: verdict.findings, whatWasTried: opts.whatWasTried ?? '' }, opts);
    const budget = stageSpec.retries ?? 0;
    const updated = readInstance(key, opts);
    if (!updated)
        throw new InstanceNotFoundError(key); // unreachable: we just wrote it
    updated.status = round >= budget ? 'stuck' : 'in-progress';
    writeInstance(key, updated, opts);
    return updated;
}
function advanceToNextStage(key, spec, stageIndex, opts) {
    const instance = readInstance(key, opts);
    if (!instance)
        throw new InstanceNotFoundError(key);
    const nextStage = spec.stages[stageIndex + 1];
    if (nextStage) {
        instance.stage = nextStage.name;
        instance.status = 'in-progress';
    }
    else {
        instance.status = 'done';
    }
    writeInstance(key, instance, opts);
    return instance;
}
//# sourceMappingURL=workflow-advance.js.map