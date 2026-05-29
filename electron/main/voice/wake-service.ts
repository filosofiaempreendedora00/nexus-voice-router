import { EventEmitter } from 'events'
import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { WakeState, WakeStatus } from '@shared/types'
import { transcribeAudio } from './whisper'
import { executeInput, executeChoice, classifyOnly } from '../router/executor'
import { loadSettings } from '../store/settings'
import { normalize as normalizeInput } from '../router/normalizer'

const LOG_DIR = join(homedir(), 'Library', 'Application Support', 'nexus-voice-router')
const LOG_FILE = join(LOG_DIR, 'wake.log')
try { mkdirSync(LOG_DIR, { recursive: true }) } catch { /* */ }
function wakeLog(line: string): void {
  try {
    appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`)
  } catch { /* */ }
}

// Wake word — only "Nexus" variants. Calling "Claude" alone is disabled
// because in work contexts people say "claude" naturally in conversation.
// To dictate to Claude, prefix with "Nexus claude ..." OR use a 2-word
// tool-scoped phrase (below) that's safe-by-being-uncommon.
const NEXUS_WAKE_VARIANTS = [
  'nexus', 'nexos', 'nexa', 'nexis', 'nexius', 'néxus', 'néxos',
  'next', 'lexus', 'lex'
]
const CLAUDE_WAKE_VARIANTS: string[] = []  // disabled — see comment above
const ALL_WAKE_VARIANTS = [...NEXUS_WAKE_VARIANTS, ...CLAUDE_WAKE_VARIANTS]

// Multi-word wake phrases that bypass "Nexus" and ALSO specify which Claude
// desktop chat to switch to before pasting. Each tool maps to one named chat
// in the Claude sidebar.
interface MultiWordWake {
  phrase: string
  chatName: string
}
const EPICTETO_TOOL_WORDS = [
  'epicteto', 'epictetus', 'epicteta', 'epiteto', 'epicteno',
  'epiquiteto', 'epiqueto', 'epitato', 'epitécto', 'epitecto',
  'epicteo', 'epicteu', 'epitetus',
  // Variants observed in Whisper logs — Whisper struggles with "Epicteto":
  'fique teto', 'fica teto', 'pique teto', 'pica teto',
  'fiqueteu', 'fiqueteo', 'fiqueti', 'fica teu', 'fique teu',
  'que teto', 'que teu', 'queteto', 'quetétu', 'quetétor',
  'victeto', 'vikteto', 'vicketo', 'vekteto', 'victéto', 'vitecto',
  'reto', 'epcteto', 'epteto', 'epcheto', 'epicheto',
  // The leading "eh-" is sometimes dropped or merged into preceding silence:
  'picteto', 'piqueto', 'pichteto', 'pixteto',
  // Heavily truncated forms Whisper produces — only safe BECAUSE they're
  // matched as multi-word phrases (e.g. "pt cloud", "repitei claude"):
  'pt', 'pet', 'pi',
  'repitei', 'repité', 'repete', 'repetei', 'repitai', 'repitéu',
  'repitei tu', 'repete tu', 'repetei tu', 'repité tu',
  'epitétu', 'epi tetu', 'pite tu', 'pete tu', 'pithéu',
  'pich teto', 'epi-teto', 'epitéu'
]
const OCTOPUS_TOOL_WORDS = [
  'octopus', 'octopos', 'octopuso', 'octopu', 'optopus',
  'octapus', 'octapos', 'octuposo'
]
const CLAUDE_VARIANT_WORDS = ['claude', 'cloud', 'claudio', 'claudia']

function buildMultiWordWakes(): MultiWordWake[] {
  const out: MultiWordWake[] = []
  for (const tool of EPICTETO_TOOL_WORDS) {
    for (const cv of CLAUDE_VARIANT_WORDS) {
      out.push({ phrase: `${tool} ${cv}`, chatName: 'OFICIAL - EPICTETO' })
      out.push({ phrase: `${cv} ${tool}`, chatName: 'OFICIAL - EPICTETO' })
    }
  }
  for (const tool of OCTOPUS_TOOL_WORDS) {
    for (const cv of CLAUDE_VARIANT_WORDS) {
      out.push({ phrase: `${tool} ${cv}`, chatName: 'OFICIAL - OCTOPUS' })
      out.push({ phrase: `${cv} ${tool}`, chatName: 'OFICIAL - OCTOPUS' })
    }
  }
  return out
}
const MULTI_WORD_CLAUDE_WAKES: MultiWordWake[] = buildMultiWordWakes()

// Default chat when "Nexus claude" is used (no specific tool target).
const DEFAULT_NEXUS_CHAT = 'NEXUS Voice Router'

// Commit words = ONLY ones unlikely to appear naturally in mid-sentence speech.
// Excluded: vai, manda, pronto, beleza, fechou, pode ir, vai la (all too common
// in Portuguese filler/normal speech). Only "ok"/variants + literal "enviar".
const COMMIT_WORDS = [
  'ok', 'okay', 'oke', 'okê',
  'enviar', 'envie'
]

// Cancel = strict words that NEVER appear naturally in mid-sentence.
// Excluded: deixa (too common — "deixa eu ver" etc).
const CANCEL_WORDS = ['cancela', 'cancelar', 'esquece o comando']

// Claude prompts: wait "ok" or this long of silence before submitting.
const CLAUDE_SILENCE_MS = 8000
// Buffer essentially empty (just said "Nexus") — wait this long for first words.
const EMPTY_BUFFER_TIMEOUT_MS = 20000

const CLAUDE_PREFIX_REGEX = /^(claude|cloud|cl[aá]udi[oa])\b/i

class WakeService extends EventEmitter {
  private state: WakeState = 'idle'
  private buffer = ''
  private timeoutTimer: NodeJS.Timeout | null = null
  private cooldownUntil = 0
  private voiceActive = false
  private targetChat: string | undefined = undefined
  /**
   * AbortController for the currently in-flight API call (set during the
   * `thinking` state). When the user cancels, we abort this so the Anthropic
   * request gets dropped server-side and we don't get billed for output
   * tokens we'll never see.
   */
  private currentAbortController: AbortController | null = null

  getStatus(): WakeStatus {
    return { state: this.state, buffer: this.buffer }
  }

  reset(): void {
    this.clearTimer()
    this.buffer = ''
    this.transition('idle')
  }

  /**
   * User-initiated cancel — works in two phases:
   *
   * 1. During `listening`: discard the captured buffer, no API call ever
   *    happens. Free.
   * 2. During `thinking`: abort the in-flight Anthropic request via
   *    AbortController. Anthropic stops generating mid-stream; we pay for
   *    whatever tokens were already produced (usually a small fraction)
   *    instead of the full response. Practical saving.
   *
   * Called from the mobile PWA's cancel button, from IPC for the Mac main
   * window, or from voice via the existing CANCEL_WORDS path.
   */
  cancel(): void {
    if (this.state === 'idle' || this.state === 'executed' || this.state === 'error') {
      wakeLog(`[cancel] noop in state=${this.state}`)
      return
    }
    wakeLog(`[cancel] state=${this.state} buffer=${JSON.stringify(this.buffer.slice(0, 80))}`)
    this.clearTimer()
    this.buffer = ''
    this.targetChat = undefined
    if (this.currentAbortController) {
      try { this.currentAbortController.abort() } catch { /* */ }
      this.currentAbortController = null
    }
    // Brief cooldown so a long "Cancelar" tap doesn't immediately re-fire wake.
    this.cooldownUntil = Date.now() + 1500
    this.transition('idle', 'cancelado')
  }

  onVoiceStart(): void {
    this.voiceActive = true
    if (this.state === 'idle' && Date.now() >= this.cooldownUntil) {
      this.transition('hearing')
      return
    }
    if (this.state === 'listening') {
      wakeLog('[voice] start → pause timer')
      this.clearTimer()
    }
  }

  onVoiceEnd(): void {
    this.voiceActive = false
    if (this.state === 'listening') {
      wakeLog('[voice] end → resume timer')
      this.armTimer()
    }
  }

  async processChunk(audioBase64: string): Promise<void> {
    const t0 = Date.now()
    if (Date.now() < this.cooldownUntil) {
      wakeLog(`[chunk] DROPPED (cooldown) state=${this.state}`)
      return
    }
    if (this.state === 'thinking' || this.state === 'executed') {
      wakeLog(`[chunk] DROPPED (state=${this.state})`)
      return
    }

    let text = ''
    try {
      text = stripWhisperArtifacts((await transcribeAudio(audioBase64)).trim())
    } catch (err) {
      wakeLog(`[chunk] transcribe FAILED: ${err}`)
      console.warn('[wake] transcribe failed:', err)
      return
    }
    const dt = Date.now() - t0
    wakeLog(`[chunk] state=${this.state} dt=${dt}ms text=${JSON.stringify(text)}`)

    if (!text) {
      if (this.state === 'hearing') this.transition('idle')
      return
    }

    // Full normalization: lowercase, strip accents, strip punctuation (so
    // commas between "Octopus, Claude" don't break multi-word wake matching).
    const lower = normalizeInput(text)

    if (this.state === 'idle' || this.state === 'hearing') {
      const found = this.findWakeWord(lower)
      if (found != null) {
        let after = lower.slice(found.end).trim().replace(/^[.,;:!?\s-]+/, '')
        // If the user called Claude directly (e.g., "Cláudio, blah"), force
        // Claude prompt mode so the rest of the buffer is treated as a prompt
        // requiring "ok" to commit.
        if (found.isClaude && !CLAUDE_PREFIX_REGEX.test(after)) {
          after = ('claude ' + after).trim()
        }
        // Remember which Claude chat to switch to (set by multi-word wake).
        this.targetChat = found.chatName
        this.buffer = after
        this.transition('listening')

        // Commit-on-wake heuristic: if the entire utterance arrived in one
        // chunk and ends with a commit word ("ok"), submit immediately.
        // - For ≤2-word remainders: always commit (e.g. "Octopus claude ok").
        // - For longer remainders: commit only if the chunk is plausibly a
        //   single human utterance (≤ 14 words). This avoids waiting 8s of
        //   silence when Roberto says the whole prompt at once, but stays
        //   defensive against Whisper hallucinating "Ok?" at the tail of
        //   very long mumbled chunks (where word count would be high).
        const afterWords = after.replace(/[.,;:!?\s-]+$/g, '').split(/\s+/).filter(Boolean)
        if (afterWords.length > 0 && afterWords.length <= 14) {
          const stripped = this.stripCommitWord(after)
          if (stripped != null) {
            this.buffer = stripped
            void this.submit()
            return
          }
        }
        if (!this.voiceActive) {
          this.armTimer()
        }
      } else {
        if (this.state === 'hearing') this.transition('idle')
      }
      return
    }

    if (this.state === 'listening') {
      // Cancel only when the chunk ENDS with a cancel word — avoids false
      // triggers from "deixa eu pensar" mid-sentence.
      const lowerClean = lower.replace(/[.,;:!?\s-]+$/g, '').replace(/^[.,;:!?\s-]+/, '')
      const cancelHit = CANCEL_WORDS.some((w) => {
        const wordEsc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        return new RegExp(`(^|[^a-zà-ú0-9])${wordEsc}$`, 'i').test(lowerClean)
      })
      if (cancelHit) {
        this.clearTimer()
        this.buffer = ''
        this.cooldownUntil = Date.now() + 1500
        this.transition('idle')
        return
      }

      // Commit only when THIS CHUNK is a deliberate short "ok"-style utterance:
      // chunk has ≤ 2 words AND ends with a commit word. This avoids Whisper
      // hallucinating "Ok?" at the end of long sentences.
      const chunkWordCount = lowerClean.split(/\s+/).filter(Boolean).length
      if (chunkWordCount > 0 && chunkWordCount <= 2) {
        const chunkIsCommit = COMMIT_WORDS.some((w) => {
          const wordEsc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          return new RegExp(`(^|[^a-zà-ú0-9])${wordEsc}$`, 'i').test(lowerClean)
        })
        if (chunkIsCommit) {
          // Strip the commit word from this chunk and submit accumulated buffer.
          const cleaned = this.stripCommitWord(lowerClean) ?? ''
          const remainder = cleaned.trim()
          if (remainder) {
            this.buffer = (this.buffer + ' ' + remainder).trim()
          }
          void this.submit()
          return
        }
      }

      // Otherwise: append the whole chunk to buffer, no commit interpretation.
      this.buffer = (this.buffer + ' ' + lower).trim()
      this.emit('status', this.getStatus())
      // Only start the silence countdown if the user has actually paused
      // speaking. If voice is still active (mid-sentence force-flush), keep
      // the timer cleared — voiceEnd will rearm it once they really pause.
      if (this.voiceActive) {
        wakeLog('[chunk] voice still active → no timer arm')
        this.clearTimer()
      } else {
        this.armTimer()
      }
    }
  }

  private findWakeWord(input: string): {
    start: number; end: number; isClaude: boolean; chatName?: string
  } | null {
    // 1) Multi-word phrases first (more specific, less false-positive risk).
    for (const mw of MULTI_WORD_CLAUDE_WAKES) {
      const idx = input.indexOf(mw.phrase)
      if (idx === -1) continue
      const before = idx === 0 ? ' ' : input[idx - 1]
      const after = input[idx + mw.phrase.length] ?? ' '
      if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) {
        return { start: idx, end: idx + mw.phrase.length, isClaude: true, chatName: mw.chatName }
      }
    }
    // 1b) Fuzzy fallback for agent names — Whisper transcribes "Epicteto" as
    // arbitrary things ("fiqueteu", "que teto", "victeto", "pt", etc.) so we
    // search for a token adjacent to a claude-variant word and score it by
    // edit distance against the canonical agent names. This catches new
    // mishearings without needing to add a literal variant first.
    const fuzzyHit = findFuzzyAgentWake(input)
    if (fuzzyHit) return fuzzyHit

    // 2) Single-word wake variants.
    for (const w of ALL_WAKE_VARIANTS) {
      const idx = input.indexOf(w)
      if (idx === -1) continue
      const before = idx === 0 ? ' ' : input[idx - 1]
      const after = input[idx + w.length] ?? ' '
      if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) {
        return {
          start: idx,
          end: idx + w.length,
          isClaude: CLAUDE_WAKE_VARIANTS.includes(w)
        }
      }
    }
    return null
  }

  /**
   * If the input ENDS with a commit word, return the input with the commit
   * word removed. Otherwise return null (no commit signal detected).
   */
  private stripCommitWord(input: string): string | null {
    const cleaned = input.replace(/[.,;:!?\s-]+$/g, '')
    if (!cleaned) return null
    for (const word of COMMIT_WORDS) {
      const wordEsc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`(^|[^a-zà-ú0-9])${wordEsc}$`, 'i')
      if (re.test(cleaned)) {
        return cleaned.replace(re, '').replace(/[.,;:!?\s-]+$/g, '').trim()
      }
    }
    return null
  }

  private isClaudeMode(): boolean {
    const trimmed = this.buffer.replace(/^[.,;:!?\s-]+/, '').trim()
    return CLAUDE_PREFIX_REGEX.test(trimmed)
  }

  private armTimer(): void {
    this.clearTimer()
    const meaningfulChars = this.buffer.replace(/[^a-zà-ú0-9]/gi, '').length

    if (meaningfulChars < 3) {
      // Just said "Nexus" and pausing — wait long; cancel rather than submit empty.
      this.timeoutTimer = setTimeout(() => {
        this.buffer = ''
        this.cooldownUntil = Date.now() + 500
        this.transition('idle')
      }, EMPTY_BUFFER_TIMEOUT_MS)
      return
    }

    if (this.isClaudeMode()) {
      // Claude: "ok" submits immediately, OR 8s of silence also submits.
      this.timeoutTimer = setTimeout(() => void this.submit(), CLAUDE_SILENCE_MS)
    } else {
      // Navigation/operational: short silence auto-submits.
      const settings = loadSettings()
      this.timeoutTimer = setTimeout(() => void this.submit(), settings.silenceSubmitMs)
    }
  }

  private clearTimer(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer)
      this.timeoutTimer = null
    }
  }

  private async submit(): Promise<void> {
    const command = this.buffer.trim().replace(/^[.,;:!?\s-]+/, '').trim()
    const targetChat = this.targetChat
    this.clearTimer()
    console.log('[wake] submitting:', JSON.stringify(command), 'targetChat:', targetChat)
    if (!command || command.length < 2) {
      this.afterCooldown()
      return
    }
    this.transition('thinking')

    // Fresh AbortController for THIS submission. cancel() will fire its
    // abort() to drop the in-flight Anthropic call. Tracked on the instance
    // so external callers (cancel()) can find it.
    const ac = new AbortController()
    this.currentAbortController = ac

    try {
      const classified = classifyOnly(command).intent
      // Inject targetChat into prompt_claude intent so the executor switches chats first.
      if (classified.kind === 'prompt_claude' && targetChat) {
        classified.targetChat = targetChat
      }
      // For plain "Nexus claude" with no specific tool, default to the NEXUS chat.
      if (classified.kind === 'prompt_claude' && !classified.targetChat) {
        classified.targetChat = DEFAULT_NEXUS_CHAT
      }
      let result
      if (classified.kind === 'navigation_ambiguous' && classified.candidates[0]) {
        result = await executeChoice(command, classified.candidates[0], ac.signal)
      } else {
        result = await executeInput(command, classified, ac.signal)
      }
      // The signal may have been aborted by cancel() while we were awaiting —
      // in that case state/UI was already reset and we shouldn't transition.
      if (ac.signal.aborted) return
      if (result.ok) {
        this.transition('executed', result.message)
        setTimeout(() => this.afterCooldown(), 1200)
      } else {
        this.transition('error', result.message)
        setTimeout(() => this.afterCooldown(), 1600)
      }
    } catch (err) {
      // AbortError is the expected error when cancel() fires — don't surface
      // it as a failure, the cancel path already transitioned to idle.
      const errMsg = err instanceof Error ? err.message : String(err)
      if (ac.signal.aborted || /abort/i.test(errMsg)) return
      this.transition('error', errMsg)
      setTimeout(() => this.afterCooldown(), 1600)
    } finally {
      // Don't hold a reference to a controller whose call already completed.
      if (this.currentAbortController === ac) this.currentAbortController = null
    }
  }

  private afterCooldown(): void {
    this.buffer = ''
    this.targetChat = undefined
    this.cooldownUntil = Date.now() + 400
    this.transition('idle')
  }

  private transition(state: WakeState, message?: string): void {
    wakeLog(`[state] ${this.state} → ${state}  buffer=${JSON.stringify(this.buffer.slice(0, 80))}`)
    this.state = state
    this.emit('status', { state, message, buffer: this.buffer })
  }
}

/**
 * Map canonical agent identifiers to their wake-service chat triggers.
 * Used by the fuzzy fallback when Whisper produces a transcription that
 * doesn't match any literal variant in EPICTETO_TOOL_WORDS / OCTOPUS_TOOL_WORDS.
 *
 * The fuzzy threshold is intentionally generous for short names that Whisper
 * tends to butcher (Epicteto → "fiqueteu", "que teto", "victeto"…). Octopus
 * is more stable but we still allow some slack for accents and stress.
 */
const AGENT_FUZZY_TARGETS: Array<{ name: string; chatName: string; threshold: number }> = [
  { name: 'epicteto', chatName: 'OFICIAL - EPICTETO', threshold: 4 },
  { name: 'octopus',  chatName: 'OFICIAL - OCTOPUS',  threshold: 3 }
]

const CLAUDE_TOKENS = new Set(['claude', 'cloud', 'claudio', 'claudia', 'claudo', 'cláudio'])

/**
 * Try to find an agent wake by:
 *   - locating any claude-variant token in the chunk
 *   - looking at the 1 or 2 tokens adjacent (before AND after)
 *   - computing Levenshtein distance vs each canonical agent name
 *   - accepting the closest match if it's within the agent's threshold
 *
 * Returns the same shape as the exact-match path so the caller can treat
 * both the same way.
 */
function findFuzzyAgentWake(
  input: string
): { start: number; end: number; isClaude: boolean; chatName: string } | null {
  const tokens = input.split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return null

  // Find every claude-ish token position.
  for (let i = 0; i < tokens.length; i++) {
    if (!CLAUDE_TOKENS.has(tokens[i])) continue

    // Candidates: 1-gram and 2-gram on either side of the claude token.
    const candidates: string[] = []
    if (i - 1 >= 0) candidates.push(tokens[i - 1])
    if (i - 2 >= 0) candidates.push(`${tokens[i - 2]} ${tokens[i - 1]}`)
    if (i + 1 < tokens.length) candidates.push(tokens[i + 1])
    if (i + 2 < tokens.length) candidates.push(`${tokens[i + 1]} ${tokens[i + 2]}`)

    let bestScore = Infinity
    let bestTarget: typeof AGENT_FUZZY_TARGETS[number] | null = null
    for (const cand of candidates) {
      if (cand.length < 2) continue  // single char wouldn't be a real agent name mishearing
      for (const target of AGENT_FUZZY_TARGETS) {
        const d = levenshtein(cand, target.name)
        if (d <= target.threshold && d < bestScore) {
          bestScore = d
          bestTarget = target
        }
      }
    }
    if (bestTarget) {
      // Approximate match bounds (best-effort — wake-service uses these to
      // strip the wake prefix from the buffer; an imprecise end is fine).
      const claudeStart = input.indexOf(tokens[i])
      return {
        start: 0,
        end: claudeStart + tokens[i].length,
        isClaude: true,
        chatName: bestTarget.chatName
      }
    }
  }
  return null
}

/** Standard iterative Levenshtein distance. Small, no deps. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const prev = new Array(b.length + 1)
  const curr = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]
  }
  return prev[b.length]
}

function isWordPresent(input: string, word: string): boolean {
  const wordEsc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(^|[^a-zà-ú0-9])${wordEsc}([^a-zà-ú0-9]|$)`, 'i')
  return re.test(input)
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Remove Whisper's auto-annotations like [MÚSICA DE FUNDO], [cantando],
 * [risos], (música) etc. These are inserted when the model can't recognize
 * the sound — pollute the dictated text otherwise.
 */
function stripWhisperArtifacts(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, '')                                             // [anything]
    .replace(/\(\s*(música|musica|risos|aplausos|inaud[ií]vel|cantando|tossindo|som|barulho|ruído|ru[ií]do|silêncio|silencio|background)[^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export const wakeService = new WakeService()
