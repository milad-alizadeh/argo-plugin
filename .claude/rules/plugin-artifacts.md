# Plugin artifacts

No logic in plugin-checkout executables. `hooks/hooks.json` invokes the
host-installed `@argohq/toolkit` via `npx --no-install --offline`; all hook
logic is toolkit TypeScript under `packages/toolkit/src/hooks/`. Never a
hand-written `.mjs`/`.sh` in the plugin, never `@latest` — the host's own
lockfile pins the version.
