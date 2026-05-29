import Anthropic from '@anthropic-ai/sdk'
import type { AgentMessage, AgentSendResult, MessageUsage, UsageEntry } from '@shared/types'
import { getAgent } from './agent-config'
import { appendMessage, listMessages } from './agent-storage'
import { agentEvents } from './agent-events'
import { appendUsage } from './usage-store'
import { computeUsd } from './pricing'
import { loadSettings } from '../store/settings'

/**
 * Soft cap on how many past turns we ship with each call. Roberto's chats
 * will grow over time; without a cap we'd burn tokens and slow him down on
 * every request. 60 turns ≈ a long working session — enough context to feel
 * continuous, cheap enough to not spike the bill.
 */
const MAX_HISTORY_TURNS = 60

/**
 * The token budget for the assistant reply. Roberto wants short, voice-
 * friendly answers; this also keeps cost predictable.
 */
const MAX_TOKENS = 1024

let client: Anthropic | null = null
let clientKey = ''

function getClient(apiKey: string): Anthropic {
  if (client && clientKey === apiKey) return client
  client = new Anthropic({ apiKey })
  clientKey = apiKey
  return client
}

/**
 * Send a user message to the named agent. Pulls the agent's system prompt,
 * loads recent history from JSONL, calls Anthropic, appends both turns to
 * the file, returns the reply.
 *
 * Cost optimization: we mark the system prompt with `cache_control:
 * ephemeral` so Anthropic stores it in its 5-minute prompt cache. Subsequent
 * calls within 5 minutes pay ~10% of the input rate for the cached portion.
 * Roberto's system prompts are static per agent, so this is pure win.
 *
 * Never logs the API key. Never includes it in error messages.
 */
export async function sendToAgent(agentId: string, userText: string): Promise<AgentSendResult> {
  const agent = getAgent(agentId)
  if (!agent) {
    return { ok: false, agentId, error: `Agente desconhecido: ${agentId}` }
  }
  const text = userText.trim()
  if (!text) {
    return { ok: false, agentId, error: 'Prompt vazio.' }
  }

  const settings = loadSettings()
  const apiKey = (settings.anthropicApiKey || '').trim()
  if (!apiKey) {
    return {
      ok: false,
      agentId,
      error: 'Faltando chave da Anthropic. Vá em Configurações → API Anthropic.'
    }
  }

  // Build the message array: tail of history + this new user turn.
  const history = listMessages(agentId).slice(-MAX_HISTORY_TURNS)
  const apiMessages = history.map((m) => ({ role: m.role, content: m.content }))
  apiMessages.push({ role: 'user' as const, content: text })

  // Persist the user turn *before* the API call so it isn't lost if the call
  // crashes mid-flight. The assistant turn is appended after a successful reply.
  const userMsg: AgentMessage = { role: 'user', content: text, at: new Date().toISOString() }
  try {
    appendMessage(agentId, userMsg)
    agentEvents.emitMessage({ agentId, ...userMsg })
  } catch (err) {
    console.error('[agent-claude] failed to persist user msg:', err)
  }

  const model = settings.anthropicModel || 'claude-sonnet-4-5-20250929'

  try {
    const anthropic = getClient(apiKey)
    const resp = await anthropic.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      // System as an array with cache_control on the only block triggers
      // Anthropic's ephemeral prompt cache. Identical to passing a string,
      // but adds the marker that enables caching.
      system: [
        {
          type: 'text',
          text: agent.systemPrompt,
          cache_control: { type: 'ephemeral' }
        }
      ],
      messages: apiMessages
    })

    // Flatten Anthropic's content blocks → plain text. v1 ignores tool_use etc.
    const reply = resp.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    if (!reply) {
      return { ok: false, agentId, error: 'Resposta vazia do Claude.' }
    }

    // Capture usage. The SDK uses snake_case field names; we normalize to
    // camelCase for the rest of the codebase. Cache fields can be undefined
    // for the first call before anything is cached.
    const u = resp.usage
    const usage: MessageUsage = {
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cacheCreationInputTokens: u.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: u.cache_read_input_tokens ?? 0,
      usd: 0,
      model
    }
    usage.usd = computeUsd(model, {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
      cacheReadInputTokens: usage.cacheReadInputTokens
    })

    const at = new Date().toISOString()

    // Append to the permanent usage ledger (~/.nexus/usage.jsonl).
    const ledger: UsageEntry = {
      at,
      agentId,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
      cacheReadInputTokens: usage.cacheReadInputTokens,
      usd: usage.usd
    }
    try {
      appendUsage(ledger)
    } catch (err) {
      console.error('[agent-claude] failed to append usage:', err)
    }

    const assistantMsg: AgentMessage = {
      role: 'assistant',
      content: reply,
      at,
      usage
    }
    try {
      appendMessage(agentId, assistantMsg)
      agentEvents.emitMessage({ agentId, ...assistantMsg })
    } catch (err) {
      console.error('[agent-claude] failed to persist assistant msg:', err)
    }
    return { ok: true, agentId, reply, usage }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    // Strip anything that looks like an API key from error surface.
    const safe = raw.replace(/sk-ant-[A-Za-z0-9_-]+/g, 'sk-ant-***')
    console.error('[agent-claude] API error:', safe)
    return { ok: false, agentId, error: safe }
  }
}
