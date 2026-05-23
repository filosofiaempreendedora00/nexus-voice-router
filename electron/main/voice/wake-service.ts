import { EventEmitter } from 'events'
import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { WakeState, WakeStatus } from '@shared/types'
import { transcribeAudio } from './whisper'
import { executeInput, executeChoice, classifyOnly } from '../router/executor'
import { loadSettings } from '../store/settings'

const LOG_DIR = join(homedir(), 'Library', 'Application Support', 'nexus-voice-router')
const LOG_FILE = join(LOG_DIR, 'wake.log')
try { mkdirSync(LOG_DIR, { recursive: true }) } catch { /* */ }
function wakeLog(line: string): void {
  try {
    appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`)
  } catch { /* */ }
}

// Wake word — only "Nexus" variants. Calling "Claude" directly was disabled
// because in work contexts people say "claude" naturally in conversation and
// it would trigger NEXUS by accident. To dictate to Claude, prefix with
// "Nexus claude ..."
const NEXUS_WAKE_VARIANTS = [
  'nexus', 'nexos', 'nexa', 'nexis', 'nexius', 'néxus', 'néxos',
  'next', 'lexus', 'lex'
]
const CLAUDE_WAKE_VARIANTS: string[] = []  // disabled — see comment above
const ALL_WAKE_VARIANTS = [...NEXUS_WAKE_VARIANTS, ...CLAUDE_WAKE_VARIANTS]

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

  getStatus(): WakeStatus {
    return { state: this.state, buffer: this.buffer }
  }

  reset(): void {
    this.clearTimer()
    this.buffer = ''
    this.transition('idle')
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

    const lower = stripAccents(text.toLowerCase())

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
        this.buffer = after
        this.transition('listening')
        const afterWords = after.replace(/[.,;:!?\s-]+$/g, '').split(/\s+/).filter(Boolean)
        if (afterWords.length > 0 && afterWords.length <= 2) {
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

  private findWakeWord(input: string): { start: number; end: number; isClaude: boolean } | null {
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
    this.clearTimer()
    console.log('[wake] submitting:', JSON.stringify(command))
    if (!command || command.length < 2) {
      this.afterCooldown()
      return
    }
    this.transition('thinking')
    try {
      const classified = classifyOnly(command).intent
      let result
      if (classified.kind === 'navigation_ambiguous' && classified.candidates[0]) {
        result = await executeChoice(command, classified.candidates[0])
      } else {
        result = await executeInput(command)
      }
      if (result.ok) {
        this.transition('executed', result.message)
        setTimeout(() => this.afterCooldown(), 1200)
      } else {
        this.transition('error', result.message)
        setTimeout(() => this.afterCooldown(), 1600)
      }
    } catch (err) {
      this.transition('error', err instanceof Error ? err.message : String(err))
      setTimeout(() => this.afterCooldown(), 1600)
    }
  }

  private afterCooldown(): void {
    this.buffer = ''
    this.cooldownUntil = Date.now() + 400
    this.transition('idle')
  }

  private transition(state: WakeState, message?: string): void {
    wakeLog(`[state] ${this.state} → ${state}  buffer=${JSON.stringify(this.buffer.slice(0, 80))}`)
    this.state = state
    this.emit('status', { state, message, buffer: this.buffer })
  }
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
