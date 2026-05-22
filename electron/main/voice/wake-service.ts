import { EventEmitter } from 'events'
import type { WakeState, WakeStatus } from '@shared/types'
import { transcribeAudio } from './whisper'
import { executeInput, executeChoice, classifyOnly } from '../router/executor'
import { loadSettings } from '../store/settings'

const WAKE_VARIANTS = [
  'nexus', 'nexos', 'nexa', 'nexis', 'nexius', 'néxus', 'néxos',
  'next', 'lexus', 'lex'
]

const CANCEL_WORDS = ['cancela', 'cancelar', 'esquece', 'esqueça']

class WakeService extends EventEmitter {
  private state: WakeState = 'idle'
  private buffer = ''
  private lastUserUpdateAt = 0
  private silenceTimer: NodeJS.Timeout | null = null
  private cooldownUntil = 0

  getStatus(): WakeStatus {
    return { state: this.state, buffer: this.buffer }
  }

  reset(): void {
    this.clearSilenceTimer()
    this.buffer = ''
    this.transition('idle')
  }

  onVoiceStart(): void {
    if (this.state === 'idle' && Date.now() >= this.cooldownUntil) {
      this.transition('hearing')
    }
  }

  onVoiceEnd(): void {
    // If still in 'hearing' after voice ends, the chunk handler will resolve:
    // either upgrade to 'listening' (wake found) or return to 'idle'.
  }

  async processChunk(audioBase64: string): Promise<void> {
    if (Date.now() < this.cooldownUntil) return
    if (this.state === 'thinking' || this.state === 'executed') return

    let text = ''
    try {
      text = (await transcribeAudio(audioBase64)).trim()
    } catch (err) {
      console.warn('[wake] transcribe failed:', err)
      return
    }
    if (!text) return

    const lower = stripAccents(text.toLowerCase())
    if (this.state === 'idle' || this.state === 'hearing') {
      const found = this.findWakeWord(lower)
      if (found != null) {
        const after = lower.slice(found.end).trim()
        this.buffer = after
        this.lastUserUpdateAt = Date.now()
        this.transition('listening')
        this.armSilenceTimer()
      } else {
        // Speech ended without a wake word: fall back to idle.
        if (this.state === 'hearing') this.transition('idle')
      }
      return
    }

    if (this.state === 'listening') {
      if (CANCEL_WORDS.some((w) => lower.includes(w))) {
        this.clearSilenceTimer()
        this.buffer = ''
        this.cooldownUntil = Date.now() + 1500
        this.transition('idle')
        return
      }
      this.buffer = (this.buffer + ' ' + lower).trim()
      this.lastUserUpdateAt = Date.now()
      this.armSilenceTimer()
      this.emit('status', this.getStatus())
    }
  }

  private findWakeWord(input: string): { start: number; end: number } | null {
    for (const w of WAKE_VARIANTS) {
      const idx = input.indexOf(w)
      if (idx === -1) continue
      const before = idx === 0 ? ' ' : input[idx - 1]
      const after = input[idx + w.length] ?? ' '
      if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) {
        return { start: idx, end: idx + w.length }
      }
    }
    return null
  }

  private armSilenceTimer(): void {
    this.clearSilenceTimer()
    const settings = loadSettings()
    // If the buffer has too little real content yet, wait longer for the user to
    // actually speak the command. Prevents premature submit of just "." or ",".
    const meaningfulChars = this.buffer.replace(/[^a-zà-ú0-9]/gi, '').length
    const waitMs = meaningfulChars >= 3 ? settings.silenceSubmitMs : 3800
    this.silenceTimer = setTimeout(() => this.submit(), waitMs)
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }
  }

  private async submit(): Promise<void> {
    const command = this.buffer.trim().replace(/^[.,;:!?\s-]+/, '').trim()
    this.clearSilenceTimer()
    console.log('[wake] submitting:', JSON.stringify(command))
    if (!command || command.length < 2) {
      this.afterCooldown()
      return
    }
    this.transition('thinking')
    try {
      // Classify first so we can handle the "ambiguous" case in wake mode by
      // auto-picking the best candidate (no picker UI is available in hands-free).
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
    this.state = state
    this.emit('status', { state, message, buffer: this.buffer })
  }
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export const wakeService = new WakeService()
