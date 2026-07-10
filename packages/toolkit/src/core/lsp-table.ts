/**
 * Curated language -> LSP plugin id table. Values are plugin ids on the
 * `claude-plugins-official` marketplace (install via
 * `<id>@claude-plugins-official`), not settings keys or raw binary names.
 * DATA, not code: adding a language is a table edit, never a code change. A
 * detected language absent here is not auto-wired; the init skill falls back
 * to a WebSearch-found community LSP, flagged unverified.
 *
 * This table is a cached hint, not a guarantee — plugin ids can be renamed
 * upstream. The init skill verifies each id against the live marketplace
 * manifest before offering to install (see SKILL.md §8c step 2).
 */
export const LSP_TABLE: Readonly<Record<string, string>> = Object.freeze({
  typescript: 'typescript-lsp',
  tsx: 'typescript-lsp',
  go: 'gopls-lsp',
  python: 'pyright-lsp',
  rust: 'rust-analyzer-lsp',
  c: 'clangd-lsp',
  cpp: 'clangd-lsp',
  csharp: 'csharp-lsp',
  java: 'jdtls-lsp',
  kotlin: 'kotlin-lsp',
  lua: 'lua-lsp',
  php: 'php-lsp',
  ruby: 'ruby-lsp',
  swift: 'swift-lsp'
})
