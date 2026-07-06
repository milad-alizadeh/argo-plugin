/**
 * `argo doctor` — the bidirectional single-version lockstep check (decision
 * 11). Plugin and kit release together from the same repo, so there is
 * nothing to range-check: the installed kit's major.minor must EQUAL the
 * `designLibrary` string the plugin manifest declares, exactly. A mismatch in
 * EITHER direction fails loud naming that direction's exact fix command.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

function majorMinor(version: string | undefined | null): string | null {
  const m = /^(\d+)\.(\d+)/.exec(version ?? '')
  return m ? `${m[1]}.${m[2]}` : null
}

/** The installed kit's own version — this package's package.json. */
export function installedKitVersion(): string {
  const pkgPath = fileURLToPath(new URL('../../package.json', import.meta.url))
  return JSON.parse(readFileSync(pkgPath, 'utf8')).version
}

export function runDoctor({ pluginRoot, kitVersion = installedKitVersion() }: { pluginRoot?: string; kitVersion?: string } = {}) {
  if (!pluginRoot) {
    return { ok: false, reason: 'doctor: no plugin root (set CLAUDE_PLUGIN_ROOT or pass --plugin-root)' }
  }
  const manifestPath = join(pluginRoot, '.claude-plugin', 'plugin.json')
  if (!existsSync(manifestPath)) {
    return { ok: false, reason: `doctor: no plugin manifest at ${manifestPath} (default-deny — cannot verify lockstep)` }
  }
  let manifest: any
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    return { ok: false, reason: `doctor: plugin manifest at ${manifestPath} is unreadable/malformed (default-deny)` }
  }

  const declared = majorMinor(manifest.designLibrary)
  const installed = majorMinor(kitVersion)
  if (!declared) return { ok: false, reason: 'doctor: plugin.json declares no designLibrary major.minor (default-deny)' }
  if (!installed) return { ok: false, reason: `doctor: installed kit version "${kitVersion}" is not parseable (default-deny)` }

  if (declared === installed) return { ok: true, declared, installed }

  const [dMaj, dMin] = declared.split('.').map(Number)
  const [iMaj, iMin] = installed.split('.').map(Number)
  const kitBehind = iMaj < dMaj || (iMaj === dMaj && iMin < dMin)
  return {
    ok: false,
    declared,
    installed,
    reason: kitBehind
      ? `doctor: installed @argohq/kit ${kitVersion} is BEHIND the plugin's declared designLibrary ${declared} — fix: bun update @argohq/kit`
      : `doctor: installed @argohq/kit ${kitVersion} is AHEAD of the plugin's declared designLibrary ${declared} — fix: claude plugin update argo@argo`,
  }
}
