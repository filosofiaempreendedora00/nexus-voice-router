/**
 * Per-model Anthropic pricing, expressed in USD per 1,000,000 tokens.
 *
 * Sourced from anthropic.com/pricing. Update when a new model is added or
 * Anthropic changes rates. The default (last entry) is used when the
 * configured model is unknown — Sonnet 4.5 is a safe upper-mid estimate.
 *
 * Cache pricing is non-trivial:
 *   - `cacheWrite` is what you pay when content is added to the cache
 *     (Anthropic charges 1.25x of `input` for the 5-minute ephemeral cache).
 *   - `cacheRead` is what you pay when a future request hits that cache
 *     (about 0.10x of `input` — that's the big saving).
 */
export interface ModelPricing {
  /** USD per 1M tokens, normal input */
  input: number
  /** USD per 1M tokens, output */
  output: number
  /** USD per 1M tokens, when this request writes to the prompt cache */
  cacheWrite: number
  /** USD per 1M tokens, when this request hits the cache (read) */
  cacheRead: number
}

const PRICES: Record<string, ModelPricing> = {
  // Claude Sonnet 4.5
  'claude-sonnet-4-5-20250929': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  'claude-sonnet-4-5': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 },

  // Claude Opus 4
  'claude-opus-4-20250514': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-opus-4': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.50 },

  // Claude Haiku 4
  'claude-haiku-4-20250514': { input: 0.80, output: 4, cacheWrite: 1.00, cacheRead: 0.08 },
  'claude-haiku-4': { input: 0.80, output: 4, cacheWrite: 1.00, cacheRead: 0.08 },

  // Older fallbacks Roberto might switch to manually:
  'claude-3-5-sonnet-20241022': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  'claude-3-5-haiku-20241022': { input: 0.80, output: 4, cacheWrite: 1.00, cacheRead: 0.08 }
}

const DEFAULT: ModelPricing = PRICES['claude-sonnet-4-5-20250929']

export function priceFor(model: string): ModelPricing {
  // Try exact match first, then prefix match (e.g. "claude-sonnet-4-5-20250929"
  // matches the keyless form "claude-sonnet-4-5"). This lets Anthropic add
  // date-stamped variants without breaking pricing.
  if (PRICES[model]) return PRICES[model]
  for (const key of Object.keys(PRICES)) {
    if (model.startsWith(key)) return PRICES[key]
  }
  return DEFAULT
}

/**
 * Total USD for an API call given token counts. Cache-read tokens REPLACE
 * normal input tokens for that portion (they don't add). Anthropic's response
 * separates them in `usage`, so we can compute exactly.
 */
export function computeUsd(
  model: string,
  tokens: {
    inputTokens: number
    outputTokens: number
    cacheCreationInputTokens: number
    cacheReadInputTokens: number
  }
): number {
  const p = priceFor(model)
  const M = 1_000_000
  return (
    (tokens.inputTokens * p.input) / M +
    (tokens.outputTokens * p.output) / M +
    (tokens.cacheCreationInputTokens * p.cacheWrite) / M +
    (tokens.cacheReadInputTokens * p.cacheRead) / M
  )
}
