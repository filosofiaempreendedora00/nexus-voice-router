import type { ClassifyResult, ExecuteResult, Intent, NavCandidate } from '@shared/types'
import { classify } from './classifier'
import {
  bumpRouteUsage,
  getRoute,
  bumpTemplateUsage,
  getTemplate
} from '../store/routes'
import { appendHistory } from '../store/history'
import { openUrlInChrome, runChromeShortcut } from '../execution/chrome'
import { typeIntoClaudeCode, sendEnterInClaudeCode } from '../execution/claude-code'
import { getAgentByChatTrigger } from '../agents/agent-config'
import { sendToAgent } from '../agents/agent-claude'

export function classifyOnly(input: string): ClassifyResult {
  const intent = classify(input)
  return { input, normalized: input.trim(), intent }
}

export async function executeInput(
  input: string,
  overrideIntent?: Intent,
  signal?: AbortSignal
): Promise<ExecuteResult> {
  const intent = overrideIntent ?? classify(input)
  return runIntent(input, intent, signal)
}

export async function executeChoice(
  input: string,
  candidate: NavCandidate,
  signal?: AbortSignal
): Promise<ExecuteResult> {
  if (candidate.kind === 'route') {
    const route = getRoute(candidate.routeId)
    if (!route) {
      appendHistory({
        input,
        intent: 'unknown',
        status: 'failed',
        errorMessage: `Route ${candidate.routeId} not found`
      })
      return { ok: false, message: 'Rota não encontrada.' }
    }
    return runIntent(input, {
      kind: 'navigation',
      routeId: route.id,
      url: route.url,
      score: candidate.score
    }, signal)
  }
  const tpl = getTemplate(candidate.templateId)
  if (!tpl) {
    appendHistory({
      input,
      intent: 'unknown',
      status: 'failed',
      errorMessage: `Template ${candidate.templateId} not found`
    })
    return { ok: false, message: 'Template não encontrado.' }
  }
  return runIntent(input, {
    kind: 'template_navigation',
    templateId: tpl.id,
    url: candidate.url,
    slots: candidate.slots,
    score: candidate.score
  }, signal)
}

async function runIntent(input: string, intent: Intent, signal?: AbortSignal): Promise<ExecuteResult> {
  try {
    switch (intent.kind) {
      case 'navigation': {
        const route = getRoute(intent.routeId)
        if (!route) {
          appendHistory({ input, intent: 'navigation', status: 'failed', errorMessage: 'route gone' })
          return { ok: false, message: 'Rota não encontrada.' }
        }
        await openUrlInChrome(route.url)
        bumpRouteUsage(route.id)
        appendHistory({
          input,
          intent: 'navigation',
          matchedRouteId: route.id,
          url: route.url,
          status: 'executed'
        })
        return { ok: true, message: `Abrindo ${route.command}` }
      }

      case 'template_navigation': {
        const tpl = getTemplate(intent.templateId)
        if (!tpl) {
          appendHistory({ input, intent: 'template_navigation', status: 'failed', errorMessage: 'template gone' })
          return { ok: false, message: 'Template não encontrado.' }
        }
        await openUrlInChrome(intent.url)
        bumpTemplateUsage(tpl.id)
        appendHistory({
          input,
          intent: 'template_navigation',
          matchedTemplateId: tpl.id,
          filledSlots: intent.slots,
          url: intent.url,
          status: 'executed'
        })
        const slotSummary = Object.values(intent.slots).join(' · ')
        return { ok: true, message: `${tpl.command}: ${slotSummary}` }
      }

      case 'navigation_ambiguous': {
        appendHistory({ input, intent: 'navigation_ambiguous', status: 'ambiguous' })
        return { ok: false, message: 'Mais de uma rota possível.' }
      }

      case 'prompt_claude': {
        // NEW: if the wake's chatTrigger maps to a NEXUS-managed agent, route
        // to the Anthropic API instead of pasting to the Claude desktop app.
        // This is the v1 of the "agent-shell" architecture Roberto approved:
        // each tool gets its own JSONL conversation owned by NEXUS.
        const agent = intent.targetChat ? getAgentByChatTrigger(intent.targetChat) : undefined

        // Strip an opening "claude " token if the wake forced it (single-word
        // Claude wake prefixes the buffer). The actual prompt for the agent
        // is everything after "claude".
        const cleanText = intent.text.replace(/^(claude|cloud|cl[aá]udi[oa])\s+/i, '').trim()

        if (agent) {
          const result = await sendToAgent(agent.id, cleanText, signal)
          if (!result.ok) {
            appendHistory({
              input,
              intent: 'prompt_claude',
              prompt: cleanText,
              status: 'failed',
              errorMessage: result.error
            })
            return { ok: false, message: `Falha no agente ${agent.displayName}: ${result.error}` }
          }
          appendHistory({
            input,
            intent: 'prompt_claude',
            prompt: cleanText,
            status: 'executed'
          })
          // The HUD shows this briefly; full reply goes to the Chat page.
          const preview = (result.reply ?? '').slice(0, 80)
          return {
            ok: true,
            message: `${agent.displayName}: ${preview}${(result.reply ?? '').length > 80 ? '…' : ''}`
          }
        }

        // Fallback: legacy Claude-desktop paste path (still used when no
        // matching agent is configured — e.g. ad-hoc Cláudio wake).
        await typeIntoClaudeCode(intent.text, undefined, intent.targetChat)
        appendHistory({
          input,
          intent: 'prompt_claude',
          prompt: intent.text,
          status: 'executed'
        })
        const where = intent.targetChat ? ` → ${intent.targetChat}` : ''
        return { ok: true, message: `Prompt enviado ao Claude${where}` }
      }

      case 'operational': {
        if (intent.action === 'send') {
          await sendEnterInClaudeCode()
        } else {
          await runChromeShortcut(intent.action)
        }
        appendHistory({ input, intent: 'operational', status: 'executed' })
        return { ok: true, message: `Comando executado: ${intent.action}` }
      }

      case 'unknown':
      default: {
        appendHistory({
          input,
          intent: 'unknown',
          status: 'rejected',
          errorMessage: intent.kind === 'unknown' ? intent.reason : ''
        })
        return { ok: false, message: 'Não entendi.' }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    appendHistory({ input, intent: intent.kind as any, status: 'failed', errorMessage: msg })
    return { ok: false, message: `Falhou: ${msg}` }
  }
}
