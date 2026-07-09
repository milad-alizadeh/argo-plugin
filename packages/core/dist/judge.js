let activeJudge;
/** Called by the active adapter at startup to install its judging session implementation. */
export function registerJudge(fn) {
    activeJudge = fn;
}
export const core = {
    /** Throws "no judge registered" if called before an adapter has registered one. */
    async judge(request) {
        if (!activeJudge) {
            throw new Error('no judge registered');
        }
        return activeJudge(request);
    }
};
//# sourceMappingURL=judge.js.map