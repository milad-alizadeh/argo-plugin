/**
 * Mermaid renderer for a workflow spec, per the design doc's "Because specs
 * are data, core ships `argo workflow diagram`" section and audit 1.5's
 * resolution: this is the phase-1-expressible skeleton ONLY — stage nodes
 * labeled FRESH/WARM (from `session`), gates on the forward edges, retry/
 * fix-round loops from `retries`/`maxRounds`, `repeat` annotated on the node.
 * It deliberately NEVER renders a runtime-decision diamond: same-convergence
 * forks ("Code-owned?", "Exists?") resolve inside a stage's skill, not as
 * branch nodes in this diagram (audit 1.5 — the historical hand-drawn
 * fixtures with decision diamonds are NOT what this generator round-trips).
 */
function nodeId(stageName) {
    return stageName.replace(/[^a-zA-Z0-9_]/g, '_');
}
function nodeLabel(stage) {
    const mode = (stage.session ?? 'fresh').toUpperCase();
    const repeat = stage.repeat ? ` &middot; repeat: ${stage.repeat}` : '';
    return `${stage.name} [${mode}]${repeat}`;
}
export function renderWorkflowDiagram(spec) {
    const lines = ['flowchart TD'];
    for (const stage of spec.stages) {
        lines.push(`  ${nodeId(stage.name)}["${nodeLabel(stage)}"]`);
    }
    spec.stages.forEach((stage, i) => {
        const next = spec.stages[i + 1];
        if (next) {
            const label = stage.gate ? `|gate: ${stage.gate}|` : '';
            lines.push(`  ${nodeId(stage.name)} -->${label} ${nodeId(next.name)}`);
        }
        if (stage.retries) {
            lines.push(`  ${nodeId(stage.name)} -->|retry, budget ${stage.retries}| ${nodeId(stage.name)}`);
        }
        if (stage.maxRounds) {
            lines.push(`  ${nodeId(stage.name)} -->|fix round, up to ${stage.maxRounds}| ${nodeId(stage.name)}`);
        }
    });
    return lines.join('\n');
}
//# sourceMappingURL=diagram.js.map