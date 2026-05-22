import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

let cachedDir: string | null = null

export function dataDir(): string {
  if (cachedDir) return cachedDir
  const dir = join(app.getPath('userData'), 'data')
  mkdirSync(dir, { recursive: true })
  cachedDir = dir
  return dir
}

export function routesPath(): string {
  return join(dataDir(), 'routes.json')
}

export function settingsPath(): string {
  return join(dataDir(), 'settings.json')
}

export function historyPath(): string {
  return join(dataDir(), 'history.json')
}
