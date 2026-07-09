import { z } from 'zod';
/**
 * Stage-spec vocabulary, per `.claude/design/workflow-engine.md`'s "The
 * stage spec (core)" section: `requires / produces / allows / policy / gate /
 * skill / session / retries / repeat / maxRounds`. Stages are a flat list —
 * no branch field (audit 1.5: runtime forks resolve inside a stage's skill,
 * never as spec branching).
 */
export declare const SessionModeSchema: z.ZodEnum<["fresh", "warm"]>;
export declare const StageSpecSchema: z.ZodObject<{
    /** Stage name, referenced by later stages' `requires` and by `history`/`attempts` state. */
    name: z.ZodString;
    /** Names of prior stages (or cross-workflow outputs) this stage's session is fed. */
    requires: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /** Artifact paths/URIs this stage is expected to produce (checked by `adopt`, audit 2.1). */
    produces: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /**
     * Action kinds permitted while this stage is active — an open, pack-extensible
     * vocabulary of plain strings (accepted-risk 3.1: core does string-equality
     * membership only, never enumerates domain kinds itself).
     */
    allows: z.ZodArray<z.ZodString, "many">;
    /** Name of a stateful in-flight policy (e.g. `test-first`), enforced by the adapter. */
    policy: z.ZodOptional<z.ZodString>;
    /** Name of a registered `Gate` (see gate.ts) run at this stage's exit. */
    gate: z.ZodOptional<z.ZodString>;
    /** Name of the craft skill the working session is given. */
    skill: z.ZodOptional<z.ZodString>;
    /** FRESH (new session, `requires` artifacts only) or WARM (one session across repeat units). */
    session: z.ZodOptional<z.ZodEnum<["fresh", "warm"]>>;
    /** Budgeted gate-failure retries (RETRY: fresh session fed the verdict + `attempts[]`). */
    retries: z.ZodOptional<z.ZodNumber>;
    /** Name of the repeated unit this stage's WARM session iterates over (e.g. "section"). */
    repeat: z.ZodOptional<z.ZodString>;
    /** Budgeted in-session fix rounds (findings injected into the same WARM session). */
    maxRounds: z.ZodOptional<z.ZodNumber>;
    /**
     * Name of the pack a workflow's TERMINAL stage hands its output off to (e.g.
     * `design-to-code`'s build stage handing off to pack-code's
     * `screen-implement`) — audit 2.4's cross-pack refusal. Only meaningful on
     * the last stage of a spec; `workflow-start` reads it off `stages.at(-1)`
     * and calls `assertPackAvailable` before writing the initial instance, so a
     * disabled required pack is refused at start, never mid-run.
     */
    handsOffToPack: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    allows: string[];
    repeat?: string | undefined;
    requires?: string[] | undefined;
    produces?: string[] | undefined;
    policy?: string | undefined;
    gate?: string | undefined;
    skill?: string | undefined;
    session?: "fresh" | "warm" | undefined;
    retries?: number | undefined;
    maxRounds?: number | undefined;
    handsOffToPack?: string | undefined;
}, {
    name: string;
    allows: string[];
    repeat?: string | undefined;
    requires?: string[] | undefined;
    produces?: string[] | undefined;
    policy?: string | undefined;
    gate?: string | undefined;
    skill?: string | undefined;
    session?: "fresh" | "warm" | undefined;
    retries?: number | undefined;
    maxRounds?: number | undefined;
    handsOffToPack?: string | undefined;
}>;
export declare const WorkflowSpecSchema: z.ZodObject<{
    name: z.ZodString;
    stages: z.ZodArray<z.ZodObject<{
        /** Stage name, referenced by later stages' `requires` and by `history`/`attempts` state. */
        name: z.ZodString;
        /** Names of prior stages (or cross-workflow outputs) this stage's session is fed. */
        requires: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        /** Artifact paths/URIs this stage is expected to produce (checked by `adopt`, audit 2.1). */
        produces: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        /**
         * Action kinds permitted while this stage is active — an open, pack-extensible
         * vocabulary of plain strings (accepted-risk 3.1: core does string-equality
         * membership only, never enumerates domain kinds itself).
         */
        allows: z.ZodArray<z.ZodString, "many">;
        /** Name of a stateful in-flight policy (e.g. `test-first`), enforced by the adapter. */
        policy: z.ZodOptional<z.ZodString>;
        /** Name of a registered `Gate` (see gate.ts) run at this stage's exit. */
        gate: z.ZodOptional<z.ZodString>;
        /** Name of the craft skill the working session is given. */
        skill: z.ZodOptional<z.ZodString>;
        /** FRESH (new session, `requires` artifacts only) or WARM (one session across repeat units). */
        session: z.ZodOptional<z.ZodEnum<["fresh", "warm"]>>;
        /** Budgeted gate-failure retries (RETRY: fresh session fed the verdict + `attempts[]`). */
        retries: z.ZodOptional<z.ZodNumber>;
        /** Name of the repeated unit this stage's WARM session iterates over (e.g. "section"). */
        repeat: z.ZodOptional<z.ZodString>;
        /** Budgeted in-session fix rounds (findings injected into the same WARM session). */
        maxRounds: z.ZodOptional<z.ZodNumber>;
        /**
         * Name of the pack a workflow's TERMINAL stage hands its output off to (e.g.
         * `design-to-code`'s build stage handing off to pack-code's
         * `screen-implement`) — audit 2.4's cross-pack refusal. Only meaningful on
         * the last stage of a spec; `workflow-start` reads it off `stages.at(-1)`
         * and calls `assertPackAvailable` before writing the initial instance, so a
         * disabled required pack is refused at start, never mid-run.
         */
        handsOffToPack: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        allows: string[];
        repeat?: string | undefined;
        requires?: string[] | undefined;
        produces?: string[] | undefined;
        policy?: string | undefined;
        gate?: string | undefined;
        skill?: string | undefined;
        session?: "fresh" | "warm" | undefined;
        retries?: number | undefined;
        maxRounds?: number | undefined;
        handsOffToPack?: string | undefined;
    }, {
        name: string;
        allows: string[];
        repeat?: string | undefined;
        requires?: string[] | undefined;
        produces?: string[] | undefined;
        policy?: string | undefined;
        gate?: string | undefined;
        skill?: string | undefined;
        session?: "fresh" | "warm" | undefined;
        retries?: number | undefined;
        maxRounds?: number | undefined;
        handsOffToPack?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    name: string;
    stages: {
        name: string;
        allows: string[];
        repeat?: string | undefined;
        requires?: string[] | undefined;
        produces?: string[] | undefined;
        policy?: string | undefined;
        gate?: string | undefined;
        skill?: string | undefined;
        session?: "fresh" | "warm" | undefined;
        retries?: number | undefined;
        maxRounds?: number | undefined;
        handsOffToPack?: string | undefined;
    }[];
}, {
    name: string;
    stages: {
        name: string;
        allows: string[];
        repeat?: string | undefined;
        requires?: string[] | undefined;
        produces?: string[] | undefined;
        policy?: string | undefined;
        gate?: string | undefined;
        skill?: string | undefined;
        session?: "fresh" | "warm" | undefined;
        retries?: number | undefined;
        maxRounds?: number | undefined;
        handsOffToPack?: string | undefined;
    }[];
}>;
export type SessionMode = z.infer<typeof SessionModeSchema>;
export type StageSpec = z.infer<typeof StageSpecSchema>;
export type WorkflowSpec = z.infer<typeof WorkflowSpecSchema>;
/**
 * Validates a workflow spec against the stage vocabulary shape and returns it
 * unchanged — specs are pure data (no runtime mutation, no defaults injected).
 * Throws a zod error synchronously on an invalid shape (missing/malformed
 * required field), per the design doc's "fails closed at `argo workflow
 * start`" rule for malformed specs.
 */
export declare function defineWorkflow<T extends WorkflowSpec>(spec: T): T;
/** Throws if a workflow with the same `name` is already registered. */
export declare function registerWorkflow(spec: WorkflowSpec): void;
export declare function getWorkflow(name: string): WorkflowSpec | undefined;
//# sourceMappingURL=spec.d.ts.map