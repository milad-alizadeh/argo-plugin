export function createFreshEyesReviewGate() {
    return {
        name: 'fresh-eyes-review',
        async check(input, ctx) {
            if (!ctx?.judge) {
                throw new Error('fresh-eyes-review: no judge available on GateContext');
            }
            // Forward ONLY the artifact URIs the judge needs (brief + finished
            // artifact) — never a transcript field. `JudgeRequest`'s own type has
            // no transcript field, so this is also enforced at the type level one
            // layer up; picking explicitly here keeps this call site honest even
            // if `input` is ever widened.
            const verdict = await ctx.judge({ artifacts: input.artifacts });
            return {
                passed: verdict.passed,
                findings: verdict.findings,
                evidence: verdict.evidence,
                rerunnable: verdict.rerunnable
            };
        }
    };
}
//# sourceMappingURL=fresh-eyes-review.js.map