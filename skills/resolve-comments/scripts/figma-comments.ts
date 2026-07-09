// Self-contained Figma REST client for the resolve-comments skill.
//
// Authored as TypeScript so it folds into @argohq/toolkit as a typed
// `argo design comments <verb>` CLI verb once the kit's TS migration lands.
// Until then it lives here under the skill and stays kit-independent (zero
// @argohq/toolkit import) so it can't collide with the migration's bin/exports/
// version churn. It is written in erasable TS only (no enums/namespaces/param
// properties), so it runs today via Node's type stripping:
//   node --experimental-strip-types figma-comments.ts <verb> …
// (flag-free on Node ≥ 23.6; this repo's Node supports the flag).
//
// The Figma REST comments API is the ONLY surface that exposes comments — the
// Figma MCP and the Plugin API sandbox both have no comment access. There is
// also no resolve endpoint (open Figma feature request), so this client can
// read threads and post replies but CANNOT mark a thread resolved; the skill
// posts a "✅ Fixed" reply and the human clicks resolve.
//
// Usage (token from $FIGMA_TOKEN or <cwd>/.argo/figma-token):
//   … figma-comments.ts whoami
//   … figma-comments.ts list <fileKey>            # open threads needing triage
//   … figma-comments.ts list <fileKey> --all      # every comment, raw
//   … figma-comments.ts reply <fileKey> <commentId> <message>
//
// IMPORTANT — shared-account model. The bot posts replies using a HUMAN's
// personal access token, so "the bot" and "the user" are the same Figma
// author. We therefore CANNOT tell a bot reply from a user reply by author id
// (filtering by own-id would drop the user's own feedback comments, which are
// the whole point). Instead, handled-state is detected by MESSAGE MARKERS the
// skill agrees to post — the same convention the "there is no resolve
// endpoint" workaround already relies on:
//   FIX_MARKER      "✅ Fixed"  — a reply the bot posts after applying a fix.
//   QUESTION_MARKER "❓"        — a reply the bot posts to ask for clarification.
// A root thread is:
//   handled       → has a ✅ Fixed reply (done; awaiting the human's resolve click)
//   awaitingUser  → its LAST reply is a ❓ question (bot asked, no answer yet)
//   needsTriage   → neither (surfaced in openThreads)
// The skill MUST prefix its replies with these markers so re-sweeps converge.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const API = 'https://api.figma.com/v1'
// Figma stores/returns emoji as SHORTCODES, not literal Unicode — a posted "✅"
// comes back over REST as ":white_check_mark:", a "❓" as ":question:". So each
// marker is detected in both forms; the skill may post either.
const FIX_PREFIXES = ['✅', ':white_check_mark:']
const QUESTION_PREFIXES = ['❓', ':question:']

function startsWithAny(msg: string, prefixes: string[]): boolean {
  return prefixes.some((p) => msg.startsWith(p))
}

interface FigmaUser {
  id: string
  handle: string
  email?: string
}

interface ClientMeta {
  node_id?: string
  node_offset?: { x: number; y: number }
  x?: number
  y?: number
}

interface FigmaComment {
  id: string
  parent_id?: string
  message: string
  created_at: string
  resolved_at?: string | null
  user?: FigmaUser
  client_meta?: ClientMeta | null
}

type ThreadState = 'handled' | 'awaitingUser' | 'needsTriage'

interface OpenThread {
  id: string
  message: string
  author?: string
  createdAt: string
  nodeId: string | null
  pin: ClientMeta | null
  replyCount: number
  state: ThreadState
}

function token(): string {
  const env = process.env.FIGMA_TOKEN
  if (env && env.trim()) return env.trim()
  try {
    return readFileSync(resolve(process.cwd(), '.argo/figma-token'), 'utf8').trim()
  } catch {
    return fail(
      'No Figma token. Set FIGMA_TOKEN (needs the file_comments scope) or write it to a\n' +
        'gitignored .argo/figma-token at the repo root. Never commit the token.',
    )
  }
}

function fail(msg: string): never {
  process.stderr.write(`figma-comments: ${msg}\n`)
  process.exit(1)
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'X-Figma-Token': token(),
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    fail(`${init.method ?? 'GET'} ${path} → ${res.status} ${res.statusText}\n${body}`)
  }
  return res.json() as Promise<T>
}

async function whoami(): Promise<{ id: string; handle: string; email?: string }> {
  const me = await api<FigmaUser>('/me')
  return { id: me.id, handle: me.handle, email: me.email }
}

function threadState(replies: FigmaComment[]): ThreadState {
  // replies sorted oldest→newest; markers, not author, decide state (see header).
  if (replies.some((r) => startsWithAny(r.message, FIX_PREFIXES))) return 'handled'
  const last = replies[replies.length - 1]
  if (last && startsWithAny(last.message, QUESTION_PREFIXES)) return 'awaitingUser'
  return 'needsTriage'
}

async function list(fileKey: string | undefined, all: boolean) {
  if (!fileKey) fail('list requires <fileKey>')
  const me = await whoami()
  const { comments } = await api<{ comments: FigmaComment[] }>(`/files/${fileKey}/comments`)
  if (all) return { me, comments }
  const byParent = new Map<string, FigmaComment[]>()
  for (const c of comments) {
    if (!c.parent_id) continue
    const arr = byParent.get(c.parent_id) ?? []
    arr.push(c)
    byParent.set(c.parent_id, arr)
  }
  const openThreads: OpenThread[] = comments
    // root threads only — replies carry parent_id; the skill reads a thread by
    // its root and posts replies under it.
    .filter((c) => !c.parent_id)
    // unresolved only.
    .filter((c) => !c.resolved_at)
    .map((c) => {
      const replies = (byParent.get(c.id) ?? []).sort((a, b) =>
        a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
      )
      return {
        id: c.id,
        message: c.message,
        author: c.user?.handle,
        createdAt: c.created_at,
        // client_meta carries either a node pin ({ node_id, node_offset }) or a
        // bare canvas coordinate; node_id is what the skill resolves to a page.
        nodeId: c.client_meta?.node_id ?? null,
        pin: c.client_meta ?? null,
        replyCount: replies.length,
        // marker-derived state — NOT author-derived (shared-account model).
        state: threadState(replies),
      }
    })
    // surface only threads still needing action; handled/awaitingUser drop out
    // so re-sweeps converge without re-triaging fixes or re-asking questions.
    .filter((t) => t.state === 'needsTriage')
  return { me, openThreads }
}

async function reply(
  fileKey: string | undefined,
  commentId: string | undefined,
  message: string,
) {
  if (!fileKey || !commentId || !message) fail('reply requires <fileKey> <commentId> <message>')
  const posted = await api<FigmaComment>(`/files/${fileKey}/comments`, {
    method: 'POST',
    body: JSON.stringify({ message, comment_id: commentId }),
  })
  return { id: posted.id, parentId: commentId, message: posted.message }
}

const [cmd, ...rest] = process.argv.slice(2)
let out: unknown
switch (cmd) {
  case 'whoami':
    out = await whoami()
    break
  case 'list': {
    const args = rest.filter((a) => a !== '--all')
    out = await list(args[0], rest.includes('--all'))
    break
  }
  case 'reply':
    out = await reply(rest[0], rest[1], rest.slice(2).join(' '))
    break
  default:
    fail(`unknown command "${cmd ?? ''}". Use whoami | list | reply.`)
}
process.stdout.write(JSON.stringify(out, null, 2) + '\n')
