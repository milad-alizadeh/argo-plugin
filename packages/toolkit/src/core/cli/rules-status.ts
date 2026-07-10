import { readConfig } from '../config.js'
import { diffProvenance, hashTemplateContent, type ProvenanceDiff } from '../provenance.js'

/**
 * `argo rules status` (skills/init/SKILL.md §1): advisory drift report
 * between installed rules' recorded provenance and their CURRENT plugin
 * template content. `templates` is the caller-supplied {filename: content}
 * map — reading `templates/rules/*.md` off disk is the bin wrapper's job so
 * this stays a pure comparison over `readConfig`'s output. Keys `current` as
 * `.claude/rules/<filename>` to match the installed-path keys `provenance`
 * is recorded under.
 */
export function rulesStatus(opts: { cwd?: string; templates: Record<string, string> }): ProvenanceDiff {
  const config = readConfig(opts.cwd ?? process.cwd())
  const current = Object.fromEntries(
    Object.entries(opts.templates).map(([file, content]) => [`.claude/rules/${file}`, hashTemplateContent(content)])
  )
  return diffProvenance({ recorded: config.provenance, current })
}
