import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { AgentMessage } from '@shared/types'

/**
 * Conversation persistence — one JSONL file per agent under ~/.nexus/agents/.
 * JSONL (one JSON object per line) is chosen so:
 *   - appends are O(1) and atomic at the line level
 *   - a corrupted line never poisons the whole history (we just skip it)
 *   - it's git-diff-friendly when Roberto backs the folder up to GitHub
 *
 * Roberto explicitly wants this folder backed by his own GitHub so account
 * portability survives Turbo team churn.
 */
const AGENTS_DIR = join(homedir(), '.nexus', 'agents')

function ensureDir(): void {
  try {
    mkdirSync(AGENTS_DIR, { recursive: true })
  } catch (err) {
    console.error('[agent-storage] mkdir failed:', err)
  }
}

function fileFor(agentId: string): string {
  return join(AGENTS_DIR, `${agentId}.jsonl`)
}

export function listMessages(agentId: string): AgentMessage[] {
  const path = fileFor(agentId)
  if (!existsSync(path)) return []
  const raw = readFileSync(path, 'utf-8')
  const out: AgentMessage[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const m = JSON.parse(trimmed) as AgentMessage
      if (
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        typeof m.at === 'string'
      ) {
        out.push(m)
      }
    } catch {
      // Skip corrupted line, keep going.
    }
  }
  return out
}

export function appendMessage(agentId: string, msg: AgentMessage): void {
  ensureDir()
  const path = fileFor(agentId)
  appendFileSync(path, JSON.stringify(msg) + '\n', 'utf-8')
}

/**
 * Clear conversation: not a destructive delete — we rename the file with a
 * timestamp so Roberto can recover if he triggered it by mistake (or via
 * voice). His content is precious; voice is fallible.
 */
export function clearConversation(agentId: string): void {
  const path = fileFor(agentId)
  if (!existsSync(path)) return
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const archive = join(AGENTS_DIR, `${agentId}.${stamp}.archived.jsonl`)
  try {
    const { renameSync } = require('fs') as typeof import('fs')
    renameSync(path, archive)
  } catch (err) {
    console.error('[agent-storage] archive failed:', err)
  }
}

export function agentsDir(): string {
  return AGENTS_DIR
}
