# Stack-detected LSP wiring

Feature (not a council fix). Argo detects a project's languages and wires the
matching LSP servers for Claude Code, so agents get type-aware navigation and
diagnostics. Honors: wire-don't-wrap, recommend-don't-auto-install-globals,
language-agnostic (table is data), config.json-as-index.

## Trigger
- After `/argo:scaffold` (stack is known deterministically), and
- During `/argo:init` on an existing repo (detect from manifests + file
  extensions present).

## Mechanism
1. Curated language → LSP plugin-id table (DATA, not code — so new languages
   are a table edit, not a code change; `lsp-table.ts`):
   - typescript/tsx → typescript-lsp, go → gopls-lsp, python → pyright-lsp,
     rust → rust-analyzer-lsp, c/cpp → clangd-lsp, csharp → csharp-lsp,
     java → jdtls-lsp, kotlin → kotlin-lsp, lua → lua-lsp, php → php-lsp,
     ruby → ruby-lsp, swift → swift-lsp
   - all plugin ids on the official `claude-plugins-official` marketplace
   - (extend as stacks are actually hit)
2. For each DETECTED language in the table: verify the table's plugin id
   still exists on the live marketplace (read the cached manifest, refresh
   if stale — see SKILL.md §8c step 2) before offering it, then offer to
   install+enable it. Wiring means enabling the plugin
   (`<id>@claude-plugins-official` under `enabledPlugins` in
   `.claude/settings.json`) — the plugin's own manifest carries the
   `lspServers` entry, argo never writes that surface directly (it doesn't
   exist as a settings.json field). Consent required per-language before any
   global binary install (no-auto-install-globals). A server already present
   is wired without a new install.
3. For a detected language NOT in the table: `WebSearch` the community LSP and
   SUGGEST it, explicitly flagged "unverified — argo has not validated this."
   Never auto-wire an online-discovered server.
4. Record posture in `.argo/config.json` as an index row (pointer, not the LSP
   config itself):
   `tooling.lsp: { typescript: "wired", go: "recommended-not-installed", ... }`
5. `argo status` reports the LSP row alongside TDD/boundaries/packs.

## Decision: consent posture
- Curated-table LSPs: wire the config on per-language consent; prompt before any
  global-binary install.
- Online-discovered LSPs: suggest only, never wire without explicit user action.

## Ship gate
Ship for the 4-5 stacks actually hit first; MEASURE whether agents use the LSP
before investing in the long-tail online-discovery path. Do not build the
discovery path speculatively (YAGNI) until a real unknown-stack project needs it.

## Non-goals
- Not in .argo/config.json's job to hold the LSP server config (Claude Code owns
  that surface). config.json only records which are wired (index).
- No version handshake / doctor / migrations (settled).
