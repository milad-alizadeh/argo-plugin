/**
 * `argo doctor` — the bidirectional single-version lockstep check (decision
 * 11). Plugin and kit release together from the same repo, so there is
 * nothing to range-check: the installed kit's major.minor must EQUAL the
 * `designLibrary` string the plugin manifest declares, exactly. A mismatch in
 * EITHER direction fails loud naming that direction's exact fix command.
 */
/** The installed kit's own version — this package's package.json. */
export declare function installedKitVersion(): string;
export declare function runDoctor({ pluginRoot, kitVersion }?: {
    pluginRoot?: string;
    kitVersion?: string;
}): {
    ok: boolean;
    reason: string;
    declared?: undefined;
    installed?: undefined;
} | {
    ok: boolean;
    declared: string;
    installed: string;
    reason?: undefined;
} | {
    ok: boolean;
    declared: string;
    installed: string;
    reason: string;
};
//# sourceMappingURL=doctor.d.ts.map