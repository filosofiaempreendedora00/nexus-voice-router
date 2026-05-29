import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { UsageEntry, UsageSummary } from '@shared/types'

/**
 * Append-only log of every Anthropic call. One JSON object per line, lives at
 * ~/.nexus/usage.jsonl. Roberto can back the folder up to GitHub for a
 * permanent record. Never edit — only append. The dashboard derives every
 * stat from this raw log.
 */
const USAGE_DIR = join(homedir(), '.nexus')
const USAGE_FILE = join(USAGE_DIR, 'usage.jsonl')

function ensureDir(): void {
  try {
    mkdirSync(USAGE_DIR, { recursive: true })
  } catch (err) {
    console.error('[usage-store] mkdir failed:', err)
  }
}

export function appendUsage(entry: UsageEntry): void {
  ensureDir()
  appendFileSync(USAGE_FILE, JSON.stringify(entry) + '\n', 'utf-8')
}

export function listUsage(): UsageEntry[] {
  if (!existsSync(USAGE_FILE)) return []
  const raw = readFileSync(USAGE_FILE, 'utf-8')
  const out: UsageEntry[] = []
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      const e = JSON.parse(t) as UsageEntry
      if (e && typeof e.at === 'string' && typeof e.usd === 'number') out.push(e)
    } catch {
      // Skip corrupted line.
    }
  }
  return out
}

// =================== Aggregation ===================

function sumZero() {
  return {
    usd: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    calls: 0
  }
}

function addInto(target: ReturnType<typeof sumZero>, e: UsageEntry): void {
  target.usd += e.usd
  target.inputTokens += e.inputTokens
  target.outputTokens += e.outputTokens
  target.cacheCreationInputTokens += e.cacheCreationInputTokens
  target.cacheReadInputTokens += e.cacheReadInputTokens
  target.calls += 1
}

/**
 * Build all the numbers the dashboard needs in one pass over the log.
 * Buckets:
 *   - today (local date)
 *   - last 7 days (rolling)
 *   - last 30 days (rolling)
 *   - all-time
 *   - per agent (all-time)
 *   - per day (last 30) for the chart
 */
export function summarize(): UsageSummary {
  const entries = listUsage()
  const now = Date.now()
  const DAY = 24 * 60 * 60 * 1000

  const today = sumZero()
  const week = sumZero()
  const month = sumZero()
  const all = sumZero()
  const perAgent: Record<string, ReturnType<typeof sumZero>> = {}
  const perDay: Record<string, ReturnType<typeof sumZero>> = {}

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const startOfTodayMs = startOfToday.getTime()

  for (const e of entries) {
    const ts = Date.parse(e.at)
    if (Number.isNaN(ts)) continue

    addInto(all, e)

    if (ts >= startOfTodayMs) addInto(today, e)
    if (now - ts <= 7 * DAY) addInto(week, e)
    if (now - ts <= 30 * DAY) addInto(month, e)

    if (!perAgent[e.agentId]) perAgent[e.agentId] = sumZero()
    addInto(perAgent[e.agentId], e)

    // Bucket by local YYYY-MM-DD; only keep last 30 days.
    if (now - ts <= 30 * DAY) {
      const d = new Date(ts)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!perDay[key]) perDay[key] = sumZero()
      addInto(perDay[key], e)
    }
  }

  return { today, week, month, all, perAgent, perDay }
}

export function usagePath(): string {
  return USAGE_FILE
}
