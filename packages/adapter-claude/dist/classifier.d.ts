import { GIT_HISTORY_MUTATION } from '@argohq/core';
/**
 * The `(toolName, toolInput) → actionKind` table (design doc's "adapter-owned
 * classifier" seam; audit 1.2's fail-closed-on-ambiguity requirement).
 *
 * Action kinds returned here are plain strings, membership-checked by
 * `core`'s `isActionAllowed` against a stage's `allows` list — core never
 * enumerates them (audit 3.1). This module is the one place that *is*
 * domain-aware (Bash command strings, the Figma plugin API shape), by
 * design: it's adapter-owned, provider-specific knowledge.
 */
/** Generic kinds this classifier can produce for non-Bash, non-Figma tools. */
export declare const FILE_READ = "file-read";
export declare const FILE_EDIT = "file-edit";
export declare const GIT_COMMIT = "git-commit";
export declare const TEST_RUN = "test-run";
export declare const WEB_FETCH = "web-fetch";
export declare const FIGMA_READ = "figma-read";
export declare const FIGMA_WRITE = "figma-write";
/**
 * Sentinel for "this tool call did not match any enumerated kind." The hook
 * (`hook.ts`, Slice 7) must treat this value as pass-through-to-stage-default
 * rather than a deny — it is NOT itself a general "allowed" bypass of the
 * stage's `allows` list. It is safe to leave unclassified calls unenumerated
 * ONLY because every kind this module considers dangerous
 * (`git-history-mutation`) is matched *before* falling through to this
 * sentinel (audit 1.2's "the enforcer only narrows what it understands, and
 * that is safe only because destructive kinds are explicitly enumerated and
 * denied" invariant). A brand-new destructive-sounding Bash subcommand that
 * is NOT in the enumerated list below (e.g. some future `git purge-history`)
 * would currently fall through to this sentinel too — that is expected and
 * documented here, not a bug: this classifier's safety argument rests on the
 * enumerated list being deny-tagged, not on catching everything.
 */
export declare const UNCLASSIFIED = "unclassified";
export type ActionKind = typeof FILE_READ | typeof FILE_EDIT | typeof GIT_COMMIT | typeof TEST_RUN | typeof WEB_FETCH | typeof FIGMA_READ | typeof FIGMA_WRITE | typeof GIT_HISTORY_MUTATION | typeof UNCLASSIFIED;
/** Classifies a Bash tool call's command string. Ambiguity (a compound/chained
 * command containing both a benign and a destructive subcommand) fails closed
 * to `GIT_HISTORY_MUTATION` (audit 1.2). */
export declare function classifyBashCommand(command: string): ActionKind;
/** Script-sniffs a `use_figma` tool call's script input for write-shaped vs
 * read-only Figma plugin API usage. */
export declare function classifyFigmaScript(script: string): ActionKind;
/** The one `(toolName, toolInput) → actionKind` table this adapter uses to
 * feed the permission hook (`hook.ts`, Slice 7) and the classifier tests
 * below. Unrecognized tool names / malformed inputs fall through to
 * `UNCLASSIFIED` (see its doc comment for why that is safe). */
export declare function classifyAction(toolName: string, toolInput: unknown): ActionKind;
//# sourceMappingURL=classifier.d.ts.map