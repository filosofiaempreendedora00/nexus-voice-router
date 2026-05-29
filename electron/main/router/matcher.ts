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
    const tplMatch = scoreTemplate(tpl, inputTokens, normalizedInput)
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
  const explained = new Set<number>()
  const markIfTokenMatches = (target: string): void => {
    for (let i = 0; i < inputTokens.length; i++) {
      if (inputTokens[i] === target) { explained.add(i); return }
    }
  }

  // Alias match: score proportional to how much of the input the alias covers.
  let bestAliasScore = 0
  let bestAliasTokens: string[] = []
  for (const alias of route.aliases) {
    const aliasNorm = normalize(alias)
    if (!aliasNorm) continue
    const matches = normalizedInput.includes(aliasNorm) || aliasNorm.includes(normalizedInput)
    if (!matches) continue
    const aliasTokens = aliasNorm.split(' ').filter(Boolean)
    const inputCount = Math.max(inputTokens.length, 1)
    const coverage = Math.min(1, aliasTokens.length / inputCount)
    const aliasScore = 2 + 3 * coverage
    if (aliasScore > bestAliasScore) {
      bestAliasScore = aliasScore
      bestAliasTokens = aliasTokens
    }
  }
  total += bestAliasScore
  bestAliasTokens.forEach(markIfTokenMatches)

  const commandNorm = normalize(route.command)
  const commandTokens = commandNorm.split(' ').filter(Boolean)
  let commandHits = 0
  for (const ct of commandTokens) {
    if (inputTokens.includes(ct)) {
      commandHits += 1
      markIfTokenMatches(ct)
    } else if (anyFuzzyMatch(ct, inputTokens)) commandHits += 0.7
  }
  if (commandHits > 0) {
    const ratio = commandHits / commandTokens.length
    total += commandHits * 1.5 + (ratio >= 0.9 ? 1.5 : 0)
  }

  let keywordHits = 0
  const keywordSet = new Set(route.keywords.map((k) => stripAccents(k.toLowerCase())))
  for (let i = 0; i < inputTokens.length; i++) {
    if (keywordSet.has(inputTokens[i])) {
      keywordHits += 1
      explained.add(i)
    }
  }
  total += keywordHits * 1.0

  // Penalty: input tokens this route did not explain.
  // Pushes the matcher to prefer templates that consume more of the input.
  const unexplained = inputTokens.length - explained.size
  if (unexplained > 0 && total > 0) {
    total -= unexplained * 2.8
  }

  // useCount boost ONLY when there's a real match. Without this guard, a
  // frequently-used route would score positive on inputs that don't actually
  // match it at all, and could win navigation_ambiguous auto-pick.
  if (total > 0.5) {
    total += Math.min(route.useCount * 0.04, 0.3)
  }
  return total
}

interface TemplateMatch {
  score: number
  slots: FilledSlots
}

function scoreTemplate(
  tpl: RouteTemplate,
  inputTokens: string[],
  normalizedInput: string
): TemplateMatch | null {
  const slots: FilledSlots = {}
  const usedTokens = new Set<number>()
  let totalScore = 0
  let filledRequired = 0
  const requiredCount = tpl.slots.filter((s) => s.required).length

  // Command-name bonus: if the input contains a word from the template's
  // command name (e.g. "jornada" appears in input → tpl-jornada wins over
  // tpl-calculadora even when both share a "lead" vertical value).
  const cmdName = tpl.command.replace(/\([^)]*\)/g, '').trim()
  const cmdTokens = normalize(cmdName)
    .split(' ')
    .filter((t) => t.length >= 4)
  let cmdHits = 0
  const usedByCmd: number[] = []
  for (const ct of cmdTokens) {
    let matched = false
    for (let i = 0; i < inputTokens.length; i++) {
      if (usedTokens.has(i) || usedByCmd.includes(i)) continue
      const tok = inputTokens[i]
      if (tok === ct) { cmdHits += 1; usedByCmd.push(i); matched = true; break }
      // singular/plural tolerance
      if (tok === ct.replace(/s$/, '') || tok + 's' === ct) {
        cmdHits += 0.9; usedByCmd.push(i); matched = true; break
      }
      if (tok.length >= 4 && editDistance(tok, ct) <= 1) {
        cmdHits += 0.7; usedByCmd.push(i); matched = true; break
      }
    }
    if (!matched) {
      // try fuzzy against singular form too
      const ctSing = ct.replace(/s$/, '')
      for (let i = 0; i < inputTokens.length; i++) {
        if (usedTokens.has(i) || usedByCmd.includes(i)) continue
        if (ctSing.length >= 4 && editDistance(inputTokens[i], ctSing) <= 1) {
          cmdHits += 0.6; usedByCmd.push(i); break
        }
      }
    }
  }
  if (cmdHits > 0) {
    totalScore += cmdHits * 1.8
    usedByCmd.forEach((i) => usedTokens.add(i))
  }

  for (const slot of tpl.slots) {
    const values = getSlotValues(tpl, slot.name)
    if (values.length === 0) continue

    let best: { value: string; tokensConsumed: number[]; points: number } | null = null

    for (const sv of values) {
      const canonical = stripAccents(sv.value.toLowerCase())
      const aliasesNorm = (sv.aliases ?? []).map((a) => normalize(a))
      const phrases = [canonical, ...aliasesNorm].filter(Boolean)

      // Phrase match: full phrase (possibly multi-word) appears in normalized input.
      for (const phrase of phrases) {
        if (phrase.length < 2) continue
        if (phrase.includes(' ')) {
          if (normalizedInput.includes(phrase)) {
            const consumed = findTokensForPhrase(phrase, inputTokens, usedTokens)
            const isCanonical = phrase === canonical
            const candidate = { value: sv.value, tokensConsumed: consumed, points: isCanonical ? 3.5 : 3.0 }
            if (!best || candidate.points > best.points) best = candidate
          }
        }
      }

      // Single-token exact/alias/fuzzy match.
      for (let i = 0; i < inputTokens.length; i++) {
        if (usedTokens.has(i)) continue
        const tok = inputTokens[i]
        let points = 0
        if (tok === canonical) points = 3
        else if (aliasesNorm.includes(tok)) points = 2.5
        else if (canonical.length >= 4 && tok.length >= 4 && (canonical.includes(tok) || tok.includes(canonical))) {
          points = 1.8
        } else if (canonical.length >= 3 && tok.length >= 3 && editDistance(canonical, tok) <= 1) {
          points = 1.5
        } else {
          for (const al of aliasesNorm) {
            if (al.length >= 3 && tok.length >= 3 && editDistance(al, tok) <= 1) {
              points = 1.3
              break
            }
          }
        }
        if (points > 0 && (!best || points > best.points)) {
          best = { value: sv.value, tokensConsumed: [i], points }
        }
      }
    }

    if (best) {
      slots[slot.name] = best.value
      best.tokensConsumed.forEach((i) => usedTokens.add(i))
      totalScore += best.points
      if (slot.required) filledRequired += 1
    }
  }

  if (requiredCount > 0 && filledRequired < requiredCount) return null
  if (totalScore === 0) return null

  if (requiredCount > 0 && filledRequired === requiredCount) {
    // Strong bonus when ALL required slots got filled — templates with full
    // specification should beat static fallback routes that only partially
    // covered the input.
    totalScore += 3.0
  }
  totalScore += Math.min(tpl.useCount * 0.04, 0.3)
  return { score: totalScore, slots }
}

function findTokensForPhrase(phrase: string, tokens: string[], used: Set<number>): number[] {
  const phraseTokens = phrase.split(' ').filter(Boolean)
  for (let start = 0; start <= tokens.length - phraseTokens.length; start++) {
    let ok = true
    for (let j = 0; j < phraseTokens.length; j++) {
      if (used.has(start + j) || tokens[start + j] !== phraseTokens[j]) {
        ok = false
        break
      }
    }
    if (ok) {
      return Array.from({ length: phraseTokens.length }, (_, k) => start + k)
    }
  }
  return []
}

function anyFuzzyMatch(target: string, tokens: string[]): boolean {
  if (target.length < 3) return false
  for (const t of tokens) {
    if (t.length < 3) continue
    if (editDistance(t, target) <= 1) return true
  }
  return false
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > 2) return 999
  const m = a.length, n = b.length
  const prev = new Array(n + 1).fill(0)
  const curr = new Array(n + 1).fill(0)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j]
  }
  return prev[n]
}

function buildUrl(pattern: string, slots: FilledSlots): string {
  return pattern.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, name: string) => {
    return slots[name] ?? `{${name}}`
  })
}
