import { wakeService } from '../voice/wake-service'
import { onAudio, onVoiceEvent, onCancel, broadcast } from './server'
import { agentEvents } from '../agents/agent-events'
import { getAgent } from '../agents/agent-config'

/**
 * Wires the mobile WebSocket plumbing into the existing wake-service so the
 * exact same Whisper / classifier / agent pipeline serves both inputs.
 *
 * Bind once at app startup. Listeners are scoped to the lifetime of the
 * server (started/stopped via the Mobile page in the UI).
 */

let bound = false
let unbinds: Array<() => void> = []

export function bindMobileAudioBridge(): void {
  if (bound) return
  bound = true

  // 1. Audio chunks (binary WAV from phone) → wake-service.
  unbinds.push(onAudio((audioBase64) => {
    void wakeService.processChunk(audioBase64)
  }))

  // 2. Voice start/end events (VAD signals from phone) → wake-service.
  unbinds.push(onVoiceEvent((kind) => {
    if (kind === 'start') wakeService.onVoiceStart()
    else wakeService.onVoiceEnd()
  }))

  // 2b. Cancel button on the PWA → wake-service.cancel() which aborts any
  // in-flight Anthropic call and resets state to idle.
  unbinds.push(onCancel(() => {
    wakeService.cancel()
  }))

  // 3. Wake status from Mac → broadcast to phones so the phone HUD mirrors.
  const onStatus = (status: { state: string; message?: string; buffer?: string }): void => {
    broadcast({
      type: 'wakeStatus',
      state: status.state,
      message: status.message,
      buffer: status.buffer
    })
  }
  wakeService.on('status', onStatus)
  unbinds.push(() => wakeService.off('status', onStatus))

  // 4. Agent replies → broadcast so the phone can show the last assistant turn.
  const onAgentMessage = (evt: {
    agentId: string
    role: 'user' | 'assistant'
    content: string
    at: string
    usage?: unknown
  }): void => {
    const agent = getAgent(evt.agentId)
    broadcast({
      type: 'agentReply',
      agentId: evt.agentId,
      agentDisplayName: agent?.displayName ?? evt.agentId,
      role: evt.role,
      content: evt.content,
      at: evt.at,
      usage: evt.usage
    })
  }
  agentEvents.on('message', onAgentMessage)
  unbinds.push(() => agentEvents.off('message', onAgentMessage))
}

export function unbindMobileAudioBridge(): void {
  for (const u of unbinds) {
    try { u() } catch { /* */ }
  }
  unbinds = []
  bound = false
}
