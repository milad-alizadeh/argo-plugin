import { getWorkflow, isActionAllowed, isProtectedPath } from '@argohq/core';
import { classifyAction, FIGMA_WRITE, FILE_EDIT } from './classifier.js';
function allow() {
    return { decision: 'allow' };
}
function deny(reason) {
    return { decision: 'deny', reason };
}
/** Kinds treated as "edit-shaped" for `noWorkflow: "deny-edits"` purposes —
 * anything that writes/mutates a working artifact. `git-commit` and
 * `git-history-mutation` are deliberately excluded here: with no active
 * workflow there is no stage to violate, and blocking commits/history ops
 * outside a workflow is a stricter policy this hook doesn't own (that's the
 * unconditional protected-path/classifier-level denial below, which already
 * covers the dangerous cases regardless of `noWorkflow`). */
const EDIT_SHAPED_KINDS = new Set([FILE_EDIT, FIGMA_WRITE]);
/** Best-effort extraction of a file path from a tool call's input, for the
 * protected-path check and for naming "the correct path" in a coaching
 * message. Returns `undefined` when no path-shaped field is present (e.g.
 * Bash calls, which are checked by `isProtectedPath` too when they happen to
 * carry a recognizable path-bearing field, but usually won't). */
function extractPath(toolInput) {
    if (toolInput && typeof toolInput === 'object') {
        const record = toolInput;
        const candidate = record.file_path ?? record.path ?? record.notebook_path;
        if (typeof candidate === 'string')
            return candidate;
    }
    return undefined;
}
/**
 * The PreToolUse hook body. Order (per the design doc + audit 1.1's fix):
 *
 * 1. Protected-path check — UNCONDITIONAL, before anything else, regardless
 *    of whether a workflow instance is active or what a stage's `allows`
 *    says. This is audit 1.1: a stage whose `allows` includes `file-edit`
 *    must never be able to write a protected path.
 * 2. Read the active instance. No active instance ⇒ `config.noWorkflow`
 *    decides: `"allow"` passes everything through; `"deny-edits"` blocks
 *    edit-shaped action kinds with a coaching message to start a workflow.
 * 3. An active instance ⇒ resolve its stage's `allows` (fail closed if the
 *    workflow/stage can't be resolved — an instance pointing at an unknown
 *    workflow or stage name is treated as a denial, never a silent allow).
 * 4. Classify the tool call, membership-check it against `allows`, deny
 *    with a message naming the stage, the violated rule, and (when
 *    derivable) the correct path.
 */
export function runPermissionHook(input, config, readActiveInstance) {
    const path = extractPath(input.tool_input);
    if (path !== undefined && isProtectedPath(path)) {
        return deny(`"${path}" is a protected path (state store / config / registry / manifests) — no stage or config setting may write it`);
    }
    const instance = readActiveInstance();
    if (!instance) {
        if (config.noWorkflow === 'allow')
            return allow();
        // config.noWorkflow === 'deny-edits'
        const kind = classifyAction(input.tool_name, input.tool_input);
        if (EDIT_SHAPED_KINDS.has(kind)) {
            return deny(`no active workflow — this project requires one before file edits are allowed ` +
                `("noWorkflow": "deny-edits"). Start a workflow first (\`argo workflow start <name> --target <target>\`).`);
        }
        return allow();
    }
    const spec = getWorkflow(instance.workflow);
    if (!spec) {
        return deny(`active workflow "${instance.workflow}" has no registered spec — denying (fail closed)`);
    }
    const stage = spec.stages.find((s) => s.name === instance.stage);
    if (!stage) {
        return deny(`active workflow "${instance.workflow}" is at unknown stage "${instance.stage}" — denying (fail closed)`);
    }
    const kind = classifyAction(input.tool_name, input.tool_input);
    if (isActionAllowed(kind, stage.allows))
        return allow();
    const pathSuffix = path !== undefined ? ` (path: "${path}")` : '';
    return deny(`stage "${instance.stage}" of workflow "${instance.workflow}" does not allow "${kind}"${pathSuffix} — ` +
        `allowed action kinds here: ${stage.allows.join(', ')}`);
}
//# sourceMappingURL=hook.js.map