# Preflight — bun link distribution for `@argohq/kit` (amended decision 4)

Run-once-and-record preflight (2026-07-06, bun v1.3.3, macOS/darwin): does the
dev-phase `bun link` mechanism hold end-to-end? **Yes — all three assertions
pass.** Not a repeatable vitest test — it exercises `bun link`/`bun install`
themselves; the hermetic equivalents live in the Slice 6 acid suites.

## Commands run and output

Register the link (once per machine, from the plugin repo):

```
$ cd packages/kit && bun link
bun link v1.3.3 (274e01c7)
Success! Registered "@argohq/kit"
```

Scratch consumer with the committed dep line:

```
$ mkdir /tmp/argo-link-preflight && cd /tmp/argo-link-preflight
$ cat package.json
{"name":"link-consumer","private":true,"dependencies":{"@argohq/kit":"link:@argohq/kit"}}
$ bun install
+ @argohq/kit@link:@argohq/kit
1 package installed [8.00ms]
```

Assertions:

- **(a) symlink** — `node_modules/@argohq/kit` is a symlink to the linked
  repo's `packages/kit` (verified with `ls -l`).
- **(b) bin exposure** — `node_modules/.bin/argo -> ../@argohq/kit/bin/argo.js`.
- **(c) hooks.json wrapper path** — from the consumer dir, a benign PreToolUse
  payload through the exact wrapper command resolves and exits 0:
  `echo '{"tool_input":{"command":"ls"},"cwd":"/tmp"}' | npx --no @argohq/kit argo-hook bash-pretooluse` → exit 0.

(The fail-closed half — kit NOT installed → wrapper exits 2 with "argo gates
inactive" — is a standing vitest assertion: `hooks/fail-closed-hook.test.mjs`.)

## Findings / caveats (none blocking)

1. **`bun install` does NOT install a linked package's own dependencies** into
   the consumer (`1 package installed` = the symlink only). The kit's runtime
   deps (`zod`, `tdd-guard`) resolve through Node's directory walk-up from the
   REAL path of `packages/kit` — i.e. from the plugin repo's own root
   `node_modules`. This is why Slice 5 step 20 makes the plugin repo a bun
   workspace (`workspaces: ["packages/*"]`) and keeps its root install green:
   the linked kit is only as resolvable as the plugin repo's install. The kit's
   hook/CLI dispatch paths use node builtins only, so gates fire even before
   the plugin repo has run `bun install`.
2. **The link registration is per-machine, per-registering-checkout.** This
   preflight registered from the build worktree; after this branch lands,
   re-register once from the main checkout (`cd <plugin repo>/packages/kit &&
   bun link`) so consumers resolve the canonical path. `bun link` overwrites
   the prior registration silently — no cleanup step needed.
3. **Release path** (documented, not fired here): `npm publish` from
   `packages/kit` via the Slice 7 OIDC workflow; consumers swap
   `"link:@argohq/kit"` → `"^<version>"`. No `vendor/` dir, no tarballs, no
   pack script anywhere.
