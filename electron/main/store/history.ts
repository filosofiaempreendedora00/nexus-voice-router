import { randomUUID } from 'crypto'
import type { HistoryEntry } from '@shared/types'
import { historyPath } from './paths'
import { readJson, writeJson } from './json-file'

const MAX_ENTRIES = 500

export function listHistory(limit = 100): HistoryEntry[] {
  const all = readJson<HistoryEntry[]>(historyPath(), [])
  return all.slice(0, limit)
}

export function appendHistory(entry: Omit<HistoryEntry, 'id' | 'at'>): HistoryEntry {
  const created: HistoryEntry = {
    id: randomUUID(),
    at: new Date().toISOString(),
    ...entry
  }
  const all = readJson<HistoryEntry[]>(historyPath(), [])
  all.unshift(created)
  writeJson(historyPath(), all.slice(0, MAX_ENTRIES))
  return created
}
