import type { Route, RouteTemplate, NavCandidate, FilledSlots } from '@shared/types'
import { meaningfulTokens, normalize, stripAccents } from './normalizer'
import { getSlotValues } from './slot-discovery'

export interface MatchResult {
  candidates: NavCandidate[]
}

export function matchAll(
  input: string,
  routes: Route[],
  templates: RouteTemplate[]
): MatchResult {
  const inputTokens = meaningfulTokens(input)
  const normalizedInput = normalize(input)

  if (inputTokens.length === 0) {
    return { candidates: [] }
  }

  const candidates: NavCandidate[] = []

  for (const route of routes) {
    const score = scoreRoute(route, inputTokens, normalizedInput)
    if (score > 0) {
      candidates.push({ kind: 'route', routeId: route.id, score, url: route.url })
    }
  }

  for (const tpl of templates) {
    const tplMatch = scoreTemplate(tpl, inputTokens)
    if (tplMatch && tplMatch.score > 0) {
      candidates.push({
        kind: 'template',
        templateId: tpl.id,
        score: tplMatch.score,
        url: buildUrl(tpl.urlPattern, tplMatch.slots),
        slots: tplMatch.slots
      })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  return { candidates }
}

function scoreRoute(route: Route, inputTokens: string[], normalizedInput: string): number {
  let total = 0

  const aliasMatch = route.aliases.find((alias) => {
    const aliasNorm = normalize(alias)
    return normalizedInput.includes(aliasNorm) || aliasNorm.includes(normalizedInput)
  })
  if (aliasMatch) total += 5

  const commandNorm = normalize(route.command)
  const commandTokens = commandNorm.split(' ').filter(Boolean)
  let commandHits = 0
  for (const ct of commandTokens) {
    if (inputTokens.includes(ct)) commandHits += 1
  }
  if (commandHits > 0) {
    const ratio = commandHits / commandTokens.length
    total += commandHits * 1.5 + (ratio === 1 ? 1.5 : 0)
  }

  let keywordHits = 0
  const keywordSet = new Set(route.keywords.map((k) => stripAccents(k.toLowerCase())))
  for (const token of inputTokens) {
    if (keywordSet.has(token)) keywordHits += 1
  }
  total += keywordHits * 1.0

  total += Math.min(route.useCount * 0.05, 0.5)

  return total
}

interface TemplateMatch {
  score: number
  slots: FilledSlots
}

function scoreTemplate(tpl: RouteTemplate, inputTokens: string[]): TemplateMatch | null {
  const slots: FilledSlots = {}
  const usedTokens = new Set<number>()
  let totalScore = 0
  let filledRequired = 0
  const requiredCount = tpl.slots.filter((s) => s.required).length

  for (const slot of tpl.slots) {
    const values = getSlotValues(tpl, slot.name)
    if (values.length === 0) continue

    let best: { value: string; tokenIndex: number; points: number } | null = null

    for (let i = 0; i < inputTokens.length; i++) {
      if (usedTokens.has(i)) continue
      const tok = inputTokens[i]
      for (const sv of values) {
        const canonical = stripAccents(sv.value.toLowerCase())
        const aliases = (sv.aliases ?? []).map((a) => stripAccents(a.toLowerCase()))

        let points = 0
        if (tok === canonical) points = 3
        else if (aliases.includes(tok)) points = 2.5
        else if (canonical.length >= 4 && tok.length >= 4 && (canonical.includes(tok) || tok.includes(canonical))) {
          points = 1.5
        }

        if (points > 0 && (!best || points > best.points)) {
          best = { value: sv.value, tokenIndex: i, points }
        }
      }
    }

    if (best) {
      slots[slot.name] = best.value
      usedTokens.add(best.tokenIndex)
      totalScore += best.points
      if (slot.required) filledRequired += 1
    }
  }

  if (requiredCount > 0 && filledRequired < requiredCount) return null
  if (totalScore === 0) return null

  if (requiredCount > 0 && filledRequired === requiredCount) {
    totalScore += 1.0
  }

  totalScore += Math.min(tpl.useCount * 0.05, 0.5)

  return { score: totalScore, slots }
}

function buildUrl(pattern: string, slots: FilledSlots): string {
  return pattern.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, name: string) => {
    return slots[name] ?? `{${name}}`
  })
}
