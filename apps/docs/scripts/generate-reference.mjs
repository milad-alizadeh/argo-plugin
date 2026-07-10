#!/usr/bin/env node
// Build-time generator: writes apps/docs/src/content/docs/reference/** from
// the plugin's own real surfaces (playbooks, skills, agents, CLI verbs,
// config schema) — never hand-copied prose, so reference pages can't drift.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..')
const ARGO_BIN = join(REPO_ROOT, 'packages/toolkit/bin/argo.js')
const REFERENCE_DIR = join(__dirname, '..', 'src/content/docs/reference')

function runArgo(args) {
  return execFileSync('node', [ARGO_BIN, ...args], { cwd: REPO_ROOT, encoding: 'utf8' })
}

/** Minimal flat frontmatter parser — `key: value` lines between `---` fences. */
function parseFrontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const fields = {}
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([a-zA-Z_-]+):\s*(.*)$/)
    if (m) fields[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
  }
  return fields
}

function writePage(relPath, frontmatterTitle, body) {
  const outPath = join(REFERENCE_DIR, relPath)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, `---\ntitle: ${frontmatterTitle}\n---\n\n${body}\n`, 'utf8')
}

function generatePlaybooks(catalog) {
  rmSync(join(REFERENCE_DIR, 'playbooks'), { recursive: true, force: true })
  for (const entry of catalog) {
    const diagram = runArgo(['playbook', 'diagram', '--name', entry.slug]).trim()
    const stageRows = entry.stages
      .map(
        (s) =>
          `| ${s.name} | ${s.gate ?? '—'} | ${s.session ?? '—'} | ${s.retries ?? '—'} | ${s.repeat ?? '—'} |`
      )
      .join('\n')
    const body = `${entry.pack} pack playbook.\n\n\`\`\`mermaid\n${diagram}\n\`\`\`\n\n| Stage | Gate | Session | Retries | Repeat |\n|---|---|---|---|---|\n${stageRows}\n`
    writePage(`playbooks/${entry.slug}.md`, entry.displayName, body)
  }
  return catalog.length
}

function generateSkills(playbookSlugs) {
  const skillsRoot = join(REPO_ROOT, 'skills')
  rmSync(join(REFERENCE_DIR, 'skills'), { recursive: true, force: true })
  const dirs = readdirSync(skillsRoot, { withFileTypes: true }).filter((e) => e.isDirectory())
  for (const dir of dirs) {
    const skillPath = join(skillsRoot, dir.name, 'SKILL.md')
    if (!existsSync(skillPath)) continue
    const fm = parseFrontmatter(readFileSync(skillPath, 'utf8'))
    const name = fm.name ?? dir.name
    const hasPlaybook = playbookSlugs.has(name)
    const body = `${fm.description ?? ''}\n\n${
      hasPlaybook
        ? `See the matching [playbook diagram](../playbooks/${name}/).`
        : 'No playbook diagram — this skill runs as a single session, not a staged playbook.'
    }\n`
    writePage(`skills/${name}.md`, name, body)
  }
  return dirs.length
}

function generateAgents() {
  const agentsRoot = join(REPO_ROOT, 'agents')
  rmSync(join(REFERENCE_DIR, 'agents'), { recursive: true, force: true })
  const files = readdirSync(agentsRoot).filter(
    (f) => f.endsWith('.md') && f !== '_operator-protocol.md'
  )
  for (const file of files) {
    const fm = parseFrontmatter(readFileSync(join(agentsRoot, file), 'utf8'))
    const name = fm.name ?? file.replace(/\.md$/, '')
    const body = `${fm.description ?? ''}\n\n- **Model:** ${fm.model ?? '—'}\n- **Tools:** ${fm.tools ?? '—'}\n`
    writePage(`agents/${name}.md`, name, body)
  }
  return files.length
}

function generateCli() {
  const binSource = readFileSync(ARGO_BIN, 'utf8')
  // Only 2-space-indented `case` labels are top-level commands — nested verb
  // switches inside a command's block are indented further, so their exact
  // byte offset (not a name-based indexOf, which would find the FIRST
  // occurrence of a reused label like nested 'status' before the real one)
  // anchors each command's block.
  const topLevel = [...binSource.matchAll(/^\s{2}case '([a-z-]+)':/gm)].map((m) => ({
    cmd: m[1],
    index: m.index
  }))
  const sections = topLevel.map(({ cmd, index }, i) => {
    const nextIndex = topLevel[i + 1]?.index ?? binSource.length
    const block = binSource.slice(index, nextIndex)
    const verbs = [...new Set([...block.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]))].filter(
      (v) => v !== cmd
    )
    return `### \`argo ${cmd}\`\n\n${verbs.length ? verbs.map((v) => `- \`${v}\``).join('\n') : '(no sub-verbs)'}\n`
  })
  writePage('cli.md', 'CLI reference', sections.join('\n'))
}

async function generateConfigSchema() {
  const { CONFIG_SCHEMA } = await import(
    join(REPO_ROOT, 'packages/toolkit/dist/core/cli/config-schema.js')
  )
  const rows = CONFIG_SCHEMA.map((e) => `| \`${e.field}\` | ${e.type} | ${e.description} |`).join(
    '\n'
  )
  writePage(
    'config-schema.md',
    'config.json reference',
    `| Field | Type | Description |\n|---|---|---|\n${rows}\n`
  )
}

const catalog = JSON.parse(runArgo(['playbook', 'list']))
const playbookCount = generatePlaybooks(catalog)
const playbookSlugs = new Set(catalog.map((e) => e.slug))
const skillCount = generateSkills(playbookSlugs)
const agentCount = generateAgents()
generateCli()
await generateConfigSchema()

if (process.argv.includes('--check')) {
  const skillFiles = readdirSync(join(REPO_ROOT, 'skills')).filter((d) =>
    existsSync(join(REPO_ROOT, 'skills', d, 'SKILL.md'))
  ).length
  const agentFiles = readdirSync(join(REPO_ROOT, 'agents')).filter(
    (f) => f.endsWith('.md') && f !== '_operator-protocol.md'
  ).length
  const failures = []
  if (skillCount !== skillFiles)
    failures.push(`skills: generated ${skillCount}, expected ${skillFiles}`)
  if (agentCount !== agentFiles)
    failures.push(`agents: generated ${agentCount}, expected ${agentFiles}`)
  if (playbookCount !== catalog.length)
    failures.push(`playbooks: generated ${playbookCount}, expected ${catalog.length}`)
  if (failures.length) {
    console.error(failures.join('\n'))
    process.exit(1)
  }
  console.log('generate-reference --check: OK')
}
