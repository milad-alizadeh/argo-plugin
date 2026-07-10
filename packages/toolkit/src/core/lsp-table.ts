/**
 * Curated language -> LSP server table (Slice: stack-detected-lsp). DATA, not
 * code — adding a new language is a table edit, never a code change. Keys are
 * detected-language identifiers (matching the tokens `argo init`/`argo
 * scaffold` detection already produces, e.g. from a manifest or file
 * extension sweep); values are the community-standard LSP server name for
 * that language. A detected language absent from this table is NOT wired —
 * the init skill suggests a WebSearch-found community LSP instead, flagged
 * "unverified", never auto-wired (see .argo/plans/stack-detected-lsp.md).
 */
export const LSP_TABLE: Readonly<Record<string, string>> = Object.freeze({
  typescript: 'typescript-lsp',
  tsx: 'typescript-lsp',
  go: 'gopls',
  python: 'pyright',
  rust: 'rust-analyzer'
})
