import { EventEmitter } from 'events'
import type { MessageUsage } from '@shared/types'

/**
 * Tiny bus the executor publishes to whenever an agent gains a new message
 * (user or assistant). The renderer's Chat page subscribes to refresh in
 * real time without polling.
 *
 * `usage` is only present on assistant messages and carries the cost data
 * so the bubble can show the per-message price the moment the reply lands —
 * no extra IPC roundtrip.
 */
export interface AgentMessageEvent {
  agentId: string
  role: 'user' | 'assistant'
  content: string
  at: string
  usage?: MessageUsage
}

class AgentEventBus extends EventEmitter {
  emitMessage(evt: AgentMessageEvent): void {
    this.emit('message', evt)
  }
}

export const agentEvents = new AgentEventBus()
