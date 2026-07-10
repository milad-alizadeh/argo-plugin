/**
 * Curated language -> LSP server table. DATA, not code: adding a language is
 * a table edit, never a code change. A detected language absent here is not
 * auto-wired; the init skill falls back to a WebSearch-found community LSP,
 * flagged unverified.
 */
export const LSP_TABLE: Readonly<Record<string, string>> = Object.freeze({
  typescript: 'typescript-lsp',
  tsx: 'typescript-lsp',
  go: 'gopls',
  python: 'pyright',
  rust: 'rust-analyzer'
})
