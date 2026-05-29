import type { Intent, OpAction, NavCandidate } from '@shared/types'
import { matchAll } from './matcher'
import { normalize, isNavigationVerb, tokenize } from './normalizer'
import { listRoutes, listTemplates } from '../store/routes'

const OPERATIONAL_COMMANDS: Record<string, OpAction> = {
  'enviar': 'send',
  'envia': 'send',
  'envie': 'send',
  'mandar': 'send',
  'manda': 'send',
  'submit': 'send',

  'voltar': 'back',
  'volta': 'back',
  'pagina anterior': 'back',

  'avancar': 'forward',
  'avanca': 'forward',
  'proxima pagina': 'forward',

  'atualizar': 'refresh',
  'atualiza': 'refresh',
  'recarregar': 'refresh',
  'recarrega': 'refresh',
  'refresh': 'refresh',
  'reload': 'refresh',

  'fechar aba': 'close_tab',
  'fecha aba': 'close_tab',
  'fechar a aba': 'close_tab',
  'fechar esta aba': 'close_tab',

  'nova aba': 'new_tab',
  'abrir aba': 'new_tab',

  'proxima aba': 'next_tab',
  'aba seguinte': 'next_tab',

  'aba anterior': 'prev_tab',
  'aba previa': 'prev_tab',

  'copiar': 'copy',
  'copia': 'copy',

  'colar': 'paste',
  'cola': 'paste',

  'cancelar': 'cancel',
  'cancela': 'cancel',
  'esquece': 'cancel',
  'esqueca': 'cancel'
}

const CLAUDE_PREFIXES = ['claude', 'cloud', 'cláudio', 'claudio']

export function classify(input: string): Intent {
  const trimmed = input.trim()
  if (!trimmed) return { kind: 'unknown', reason: 'empty input' }

  const normalized = normalize(trimmed)

  const op = matchOperational(normalized)
  if (op) return { kind: 'operational', action: op }

  const claudePrompt = matchClaudePrompt(normalized, trimmed)
  if (claudePrompt) return { kind: 'prompt_claude', text: claudePrompt }

  return matchNavigation(trimmed)
}

function matchOperational(normalized: string): OpAction | null {
  if (OPERATIONAL_COMMANDS[normalized]) return OPERATIONAL_COMMANDS[normalized]

  const tokens = tokenize(normalized)
  if (tokens.length <= 3) {
    for (const [phrase, action] of Object.entries(OPERATIONAL_COMMANDS)) {
      if (normalized.includes(phrase)) return action
    }
  }
  return null
}

function matchClaudePrompt(normalized: string, original: string): string | null {
  const firstToken = normalized.split(' ')[0]
  if (!CLAUDE_PREFIXES.includes(firstToken)) return null

  const stripped = original
    .replace(/^\s*(claude|cloud|cl[aá]udi[oa])\s*[,:!\-]?\s*/i, '')
    .trim()

  if (!stripped) return null
  return stripped
}

function matchNavigation(input: string): Intent {
  const routes = listRoutes()
  const templates = listTemplates()
  const result = matchAll(input, routes, templates)

  if (result.candidates.length === 0) {
    return { kind: 'unknown', reason: 'no matching route' }
  }

  const top = result.candidates[0]
  const second = result.candidates[1]

  const isClearWinner =
    top.score >= 3.0 && (!second || top.score - second.score >= 1.0)

  if (isClearWinner) {
    return candidateToIntent(top)
  }

  // Require a meaningful match before treating it as ambiguous-but-resolvable.
  // A bare nav verb alone (e.g. "abre repetitos") shouldn't latch onto any
  // candidate — it should be rejected so the user retries.
  const hasAnyDecentMatch = top.score >= 1.5
  if (!hasAnyDecentMatch) {
    return { kind: 'unknown', reason: 'low confidence' }
  }

  return {
    kind: 'navigation_ambiguous',
    candidates: result.candidates.slice(0, 3)
  }
}

function candidateToIntent(c: NavCandidate): Intent {
  if (c.kind === 'route') {
    return { kind: 'navigation', routeId: c.routeId, url: c.url, score: c.score }
  }
  return {
    kind: 'template_navigation',
    templateId: c.templateId,
    url: c.url,
    slots: c.slots,
    score: c.score
  }
}

function hasNavVerb(input: string): boolean {
  return tokenize(input).some(isNavigationVerb)
}
