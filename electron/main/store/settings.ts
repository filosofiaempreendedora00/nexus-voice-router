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
  ]
}

export function loadSettings(): Settings {
  const s = readJson<Settings>(settingsPath(), DEFAULTS)
  return { ...DEFAULTS, ...s }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const current = loadSettings()
  const next: Settings = { ...current, ...patch }
  writeJson(settingsPath(), next)
  return next
}
