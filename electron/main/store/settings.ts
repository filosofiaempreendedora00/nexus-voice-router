import type { Settings } from '@shared/types'
import { settingsPath } from './paths'
import { readJson, writeJson } from './json-file'

const DEFAULTS: Settings = {
  hotkey: 'CommandOrControl+Shift+Space',
  environment: 'PROD',
  aiFallbackEnabled: false,
  whisperModel: 'base',
  language: 'pt',
  firstRunCompleted: false
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
