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

export function classifyOnly(input: string): ClassifyResult {
  const intent = classify(input)
  return { input, normalized: input.trim(), intent }
}

export async function executeInput(input: string): Promise<ExecuteResult> {
  const intent = classify(input)
  return runIntent(input, intent)
}

export async function executeChoice(
  input: string,
  candidate: NavCandidate
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
    })
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
  })
}

async function runIntent(input: string, intent: Intent): Promise<ExecuteResult> {
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
        await typeIntoClaudeCode(intent.text)
        appendHistory({
          input,
          intent: 'prompt_claude',
          prompt: intent.text,
          status: 'executed'
        })
        return { ok: true, message: 'Prompt enviado ao Claude Code (ainda não confirmado).' }
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
