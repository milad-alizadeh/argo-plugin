/** Single source of truth for .argo/config.json's documented field shape. */
export interface ConfigSchemaEntry {
  field: string
  type: string
  description: string
}

export const CONFIG_SCHEMA: ConfigSchemaEntry[] = [
  {
    field: 'landing',
    type: '"merge" | "pr"',
    description: 'How a finished branch lands — straight to the default branch, or via a pull request.'
  },
  {
    field: 'noPlaybook',
    type: '"allow" | "coach" | "deny-edits"',
    description: 'How code edits with no registered playbook are treated. Missing key reads as "allow".'
  },
  {
    field: 'design',
    type: 'object',
    description: "Inert keys owned by /argo:setup-design's design pack; init never writes their contents."
  },
  {
    field: 'docs',
    type: '{ mode: "starlight" | "markdown" | "none"; path?: string }',
    description: 'Human-facing docs opt-in — an existing site to keep in sync, a scaffolded tree, or none.'
  }
]
