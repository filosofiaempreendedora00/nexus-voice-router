const STOPWORDS_PT = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas',
  'de', 'do', 'da', 'dos', 'das',
  'em', 'no', 'na', 'nos', 'nas',
  'para', 'pra', 'pro', 'por',
  'e', 'ou', 'mas',
  'que', 'qual', 'quais',
  'me', 'te', 'se',
  'meu', 'minha', 'meus', 'minhas',
  'seu', 'sua', 'seus', 'suas',
  'esse', 'essa', 'esses', 'essas', 'isso',
  'este', 'esta', 'estes', 'estas', 'isto',
  'aquele', 'aquela',
  'ai', 'lá', 'la',
  'então', 'entao',
  'agora', 'depois', 'antes',
  'por favor', 'favor'
])

const NAVIGATION_VERBS = new Set([
  'abrir', 'abre', 'abra', 'abram',
  'ir', 'vai', 'vamos', 'va',
  'mostrar', 'mostra', 'mostre',
  'navegar', 'navega', 'navegue',
  'acessar', 'acessa', 'acesse',
  'levar', 'leva', 'leve',
  'pega', 'pegar', 'pegue',
  'visitar', 'visita', 'visite',
  'carregar', 'carrega', 'carregue'
])

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function normalize(input: string): string {
  // Merge spelled-out letter sequences first (e.g. "C-R-O" -> "cro", "C R O" -> "cro").
  const lettersMerged = mergeSpelledLetters(input)
  return stripAccents(lettersMerged.toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function mergeSpelledLetters(input: string): string {
  // "C-R-O" / "C.R.O" / "C R O" -> "CRO" (3+ consecutive single letters joined)
  let out = input.replace(/(?<![A-Za-zÀ-ú])([A-Za-zÀ-ú])[\s\.\-]([A-Za-zÀ-ú])[\s\.\-]([A-Za-zÀ-ú])(?![A-Za-zÀ-ú])/g, '$1$2$3')
  // Also handle 2-letter sequences (less common but harmless): "C R" -> "CR"
  out = out.replace(/(?<![A-Za-zÀ-ú])([A-Za-zÀ-ú])[\.\-]([A-Za-zÀ-ú])(?![A-Za-zÀ-ú])/g, '$1$2')
  return out
}

export function tokenize(input: string): string[] {
  return normalize(input).split(' ').filter(Boolean)
}

export function isNavigationVerb(token: string): boolean {
  return NAVIGATION_VERBS.has(stripAccents(token.toLowerCase()))
}

export function isStopword(token: string): boolean {
  return STOPWORDS_PT.has(stripAccents(token.toLowerCase()))
}

export function meaningfulTokens(input: string): string[] {
  return tokenize(input).filter((t) => !isStopword(t) && !isNavigationVerb(t))
}
