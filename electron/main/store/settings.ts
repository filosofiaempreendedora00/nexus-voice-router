import type { Settings } from '@shared/types'
import { settingsPath } from './paths'
import { readJson, writeJson } from './json-file'

const DEFAULTS: Settings = {
  hotkey: 'CommandOrControl+Shift+Space',
  environment: 'PROD',
  aiFallbackEnabled: false,
  whisperModel: 'base',
  language: 'pt',
  firstRunCompleted: false,
  wakeMode: true,
  wakeWord: 'nexus',
  silenceSubmitMs: 1300,
  vadThreshold: 0.04,
  baseUrls: [
    { id: 'local', url: 'http://localhost:3000', label: 'Local (Octopus)' },
    { id: 'render', url: 'https://sales-jornada.onrender.com', label: 'Render (Sales Jornada)' }
  ],
  claudeAutoEnter: true,
  claudeCodeApp: 'Claude',
  anthropicApiKey: '',
  anthropicModel: 'claude-sonnet-4-5-20250929',
  ngrokAuthtoken: '',
  ngrokStaticDomain: '',
  // Tailscale is the only sane backend now: cloudflared is disposable and
  // ngrok's free tier no longer offers static domains. Defaulting to
  // 'tailscale' means new installs go straight to a stable URL, and the
  // tunnel manager retries hard before giving up.
  mobileTunnelPreference: 'tailscale'
}

export function loadSettings(): Settings {
  const s = readJson<Settings>(settingsPath(), DEFAULTS)
  const merged = { ...DEFAULTS, ...s }
  // Migration: cloudflared quick tunnel + ngrok free tier are deprecated for
  // the mobile use case. Anything that landed on 'auto' is auto-upgraded to
  // 'tailscale' so post-sleep races stop silently downgrading to a disposable URL.
  if (merged.mobileTunnelPreference === ('auto' as Settings['mobileTunnelPreference'])) {
    merged.mobileTunnelPreference = 'tailscale'
  }
  return merged
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const current = loadSettings()
  const next: Settings = { ...current, ...patch }
  writeJson(settingsPath(), next)
  return next
}
