import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs'

export function readJson<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback
    const raw = readFileSync(path, 'utf-8')
    if (!raw.trim()) return fallback
    return JSON.parse(raw) as T
  } catch (err) {
    console.error(`[store] Failed to read ${path}:`, err)
    return fallback
  }
}

export function writeJson<T>(path: string, data: T): void {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(tmp, path)
}
