import { useEffect, useMemo, useRef, useState } from 'react'
import { Send, Trash2, MessageCircle, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '@/lib/api'
import { cn, formatRelativeTime, formatUsd } from '@/lib/utils'
import { useToast } from '@/components/Toast'
import type { AgentConfig, AgentMessage } from '@shared/types'

/**
 * Chat page — one panel per NEXUS-managed agent. Each agent owns a JSONL
 * conversation in ~/.nexus/agents/<id>.jsonl. Messages can arrive from two
 * sources:
 *   1. The user typing here (text input at bottom)
 *   2. Voice — "Octopus claude [prompt] ok" routes through the wake-service
 *      to the agent's API conversation, then broadcasts via onAgentReply.
 * Both paths share the same storage and the same event bus, so the UI
 * stays consistent regardless of input mode.
 */
export function Chat(): JSX.Element {
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [unreadByAgent, setUnreadByAgent] = useState<Record<string, number>>({})
  // `tick` triggers a re-render every 30s so relative timestamps ("agora",
  // "5min") visibly age without needing an explicit refresh from the user.
  const [, setTick] = useState(0)
  const toast = useToast()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  // Load agent list once.
  useEffect(() => {
    void api.agentsList().then((list) => {
      setAgents(list)
      if (list.length > 0) setActiveId((cur) => cur || list[0].id)
    })
  }, [])

  // Load messages whenever active agent changes. Also clear unread counter
  // for that agent — opening its tab means the user has "seen" it.
  useEffect(() => {
    if (!activeId) return
    void api.agentsListMessages(activeId).then(setMessages)
    setUnreadByAgent((prev) => {
      if (!prev[activeId]) return prev
      const next = { ...prev }
      delete next[activeId]
      return next
    })
  }, [activeId])

  // Subscribe to live updates from voice or other windows.
  //
  // Voice flow always emits a USER turn first (the prompt) and then the
  // ASSISTANT turn (the reply). So when a `user` message lands for an agent
  // that isn't currently visible, we know it came from voice — auto-switch
  // to that tab so Roberto sees the whole exchange happen in real time.
  //
  // To avoid races between optimistic-append and the disk reload that the
  // activeId useEffect triggers, we ALWAYS refetch from disk when a message
  // for the active agent arrives. Each message persists *before* it emits,
  // so the disk is always the source of truth.
  useEffect(() => {
    const off = api.onAgentReply((payload) => {
      const evt = payload as { agentId: string; role: 'user' | 'assistant'; content: string; at: string }

      // Voice-initiated turn for a different agent → switch tab. The
      // activeId useEffect then handles loading messages from disk.
      if (evt.agentId !== activeId && evt.role === 'user') {
        setActiveId(evt.agentId)
        return
      }

      if (evt.agentId === activeId) {
        // Reload from disk — covers both user echo and the eventual assistant
        // reply without any race with the auto-switch path above.
        void api.agentsListMessages(activeId).then(setMessages)
        return
      }

      // Assistant for a non-active agent (rare given voice flow, but possible
      // if Roberto changes tabs mid-call). Surface as unread badge.
      setUnreadByAgent((prev) => ({ ...prev, [evt.agentId]: (prev[evt.agentId] ?? 0) + 1 }))
    })
    return off
  }, [activeId])

  // Autoscroll to bottom on new messages.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // setTimeout: wait for DOM paint after the message renders.
    setTimeout(() => { el.scrollTop = el.scrollHeight }, 0)
  }, [messages])

  const active = useMemo(() => agents.find((a) => a.id === activeId), [agents, activeId])

  async function handleSend(): Promise<void> {
    const text = input.trim()
    if (!text || !activeId || sending) return
    setSending(true)
    setInput('')
    try {
      const result = await api.agentsSend(activeId, text)
      if (!result.ok) {
        toast.show('error', result.error || 'Falha ao enviar')
      }
    } catch (err) {
      toast.show('error', String(err))
    } finally {
      setSending(false)
    }
  }

  async function handleClear(): Promise<void> {
    if (!activeId) return
    if (!confirm('Arquivar a conversa deste agente? O histórico fica salvo numa cópia com timestamp.')) {
      return
    }
    await api.agentsClear(activeId)
    setMessages([])
    toast.show('success', 'Conversa arquivada')
  }

  if (agents.length === 0) {
    return <div className="p-8 text-ink-muted text-sm">Carregando agentes…</div>
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-line flex-shrink-0">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-ink">Agentes</h1>
            <p className="text-xs text-ink-muted hidden sm:block">
              Cada agente é uma conversa Claude gerenciada pelo NEXUS, salva no seu Mac.
            </p>
          </div>
          {active && messages.length > 0 && (
            <button
              onClick={() => void handleClear()}
              className="h-7 px-2 sm:px-2.5 rounded-md text-xs text-ink-muted hover:text-danger hover:bg-danger/10 flex items-center gap-1.5 transition-all flex-shrink-0"
              title="Arquivar conversa"
              aria-label="Arquivar conversa"
            >
              <Trash2 size={12} />
              <span className="hidden sm:inline">Arquivar</span>
            </button>
          )}
        </div>

        {/* Agent picker tabs */}
        <div className="flex gap-1.5 overflow-x-auto scroll-area pb-1">
          {agents.map((a) => {
            const isActive = a.id === activeId
            const unread = unreadByAgent[a.id] ?? 0
            return (
              <button
                key={a.id}
                onClick={() => setActiveId(a.id)}
                className={cn(
                  'relative flex items-center gap-2 h-9 px-3 rounded-lg text-sm whitespace-nowrap transition-all border',
                  isActive
                    ? 'bg-bg-elevated text-ink border-accent/40 shadow-sm'
                    : 'bg-transparent text-ink-muted border-line hover:border-line-strong hover:text-ink'
                )}
              >
                <span className="text-base leading-none">{a.emoji}</span>
                <span className="font-medium">{a.displayName}</span>
                {unread > 0 && !isActive && (
                  <span className="ml-1 min-w-[18px] h-[18px] px-1.5 rounded-full bg-accent text-white text-[10px] font-semibold flex items-center justify-center">
                    {unread}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </header>

      {active && (
        <div className="px-4 sm:px-6 py-2 border-b border-line bg-bg-subtle/40 flex-shrink-0">
          <p className="text-[11px] text-ink-dim truncate">
            <span className="text-ink-muted font-medium">{active.displayName}</span>
            <span className="hidden md:inline">{' · '}{active.description}</span>
            {' · '}
            <span className="font-mono">"{active.id} claude … ok"</span>
          </p>
        </div>
      )}

      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-area">
        <div className="max-w-3xl mx-auto p-4 sm:p-6 flex flex-col gap-4">
          {messages.length === 0 && (
            <div className="text-center py-12 sm:py-16 text-ink-dim flex flex-col items-center gap-3 px-2">
              <div className="w-14 h-14 rounded-2xl bg-bg-elevated border border-line flex items-center justify-center text-2xl">
                {active?.emoji ?? '✨'}
              </div>
              <p className="text-sm">Sem mensagens ainda.</p>
              <p className="text-xs leading-relaxed">
                Diga <span className="font-mono text-ink-muted whitespace-nowrap">"{active?.id} claude …"</span> ou digite abaixo.
              </p>
            </div>
          )}
          {messages.map((m, i) => <MessageBubble key={i} msg={m} agent={active} />)}
          {sending && (
            <div className="flex items-center gap-2 text-ink-dim text-sm pl-2">
              <Sparkles size={12} className="animate-pulse" />
              {active?.displayName} pensando…
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-line bg-bg-subtle/40 p-3 sm:p-4 flex-shrink-0">
        <div className="max-w-3xl mx-auto flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSend()
              }
            }}
            placeholder={active ? `Mensagem pra ${active.displayName} (Enter envia, Shift+Enter quebra linha)` : ''}
            rows={2}
            className="flex-1 px-3 py-2.5 rounded-lg bg-bg-elevated border border-line text-sm text-ink placeholder:text-ink-dim focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40 resize-none"
          />
          <button
            onClick={() => void handleSend()}
            disabled={!input.trim() || sending}
            className="h-10 w-10 flex-shrink-0 rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all"
            title="Enviar (Enter)"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ msg, agent }: { msg: AgentMessage; agent: AgentConfig | undefined }): JSX.Element {
  const isUser = msg.role === 'user'
  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0',
          isUser ? 'bg-accent/20 border border-accent/40' : 'bg-bg-elevated border border-line'
        )}
      >
        {isUser ? <MessageCircle size={14} className="text-accent" /> : <span>{agent?.emoji ?? '✨'}</span>}
      </div>
      <div className={cn('flex flex-col gap-1 max-w-[88%] sm:max-w-[78%]', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed',
            isUser
              ? 'bg-accent text-white rounded-tr-md whitespace-pre-wrap'
              : 'bg-bg-elevated border border-line text-ink rounded-tl-md'
          )}
        >
          {isUser ? msg.content : <MarkdownContent text={msg.content} />}
        </div>
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] text-ink-dim">{formatRelativeTime(msg.at)}</span>
          {msg.usage && <CostPill usage={msg.usage} />}
        </div>
      </div>
    </div>
  )
}

/**
 * Small price tag rendered next to the timestamp on assistant bubbles.
 * Hovering shows the token breakdown — the dashboard tab shows everything in
 * aggregate. Cached reads are highlighted because they're the big saving.
 */
function CostPill({ usage }: { usage: NonNullable<AgentMessage['usage']> }): JSX.Element {
  const tooltip = [
    `Modelo: ${usage.model}`,
    `Input: ${usage.inputTokens} tokens`,
    `Output: ${usage.outputTokens} tokens`,
    usage.cacheCreationInputTokens > 0 && `Cache escrito: ${usage.cacheCreationInputTokens} tokens`,
    usage.cacheReadInputTokens > 0 && `Cache lido (barato): ${usage.cacheReadInputTokens} tokens`,
    `Custo: $${usage.usd.toFixed(6)}`
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <span
      title={tooltip}
      className="text-[10px] font-mono text-ink-dim px-1.5 py-0.5 rounded bg-bg-elevated border border-line cursor-default select-none"
    >
      {formatUsd(usage.usd)}
    </span>
  )
}


/**
 * Renders Claude's reply with full markdown: bold, italic, lists, code blocks,
 * tables, links, etc. Mimics the look of the Claude desktop app so the chat
 * feels native instead of "raw text with asterisks." Tailwind classes are
 * scoped to the assistant bubble; the dark code-block treatment matches the
 * surrounding bg-elevated palette.
 */
function MarkdownContent({ text }: { text: string }): JSX.Element {
  return (
    <div className="prose prose-invert prose-sm max-w-none
      prose-p:my-2 prose-p:leading-relaxed
      prose-strong:text-ink prose-strong:font-semibold
      prose-em:text-ink
      prose-ul:my-2 prose-ul:list-disc prose-ul:pl-5
      prose-ol:my-2 prose-ol:list-decimal prose-ol:pl-5
      prose-li:my-0.5 prose-li:marker:text-ink-dim
      prose-h1:text-base prose-h1:font-semibold prose-h1:mt-3 prose-h1:mb-1
      prose-h2:text-sm prose-h2:font-semibold prose-h2:mt-3 prose-h2:mb-1
      prose-h3:text-sm prose-h3:font-semibold prose-h3:mt-2 prose-h3:mb-1
      prose-a:text-accent prose-a:no-underline hover:prose-a:underline
      prose-blockquote:border-l-2 prose-blockquote:border-line prose-blockquote:pl-3 prose-blockquote:text-ink-muted prose-blockquote:italic
      prose-hr:border-line prose-hr:my-3
      prose-table:my-2 prose-th:text-left prose-th:font-semibold prose-th:px-2 prose-th:py-1 prose-th:border prose-th:border-line
      prose-td:px-2 prose-td:py-1 prose-td:border prose-td:border-line
      [&_:first-child]:mt-0 [&_:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Inline + block code share styling but block has its own wrapper.
          code({ className, children, ...props }) {
            const isBlock = /language-/.test(className ?? '')
            if (isBlock) {
              return (
                <code className={cn('block', className)} {...props}>
                  {children}
                </code>
              )
            }
            return (
              <code
                className="px-1.5 py-0.5 rounded-md bg-bg-subtle border border-line text-[12px] font-mono text-ink"
                {...props}
              >
                {children}
              </code>
            )
          },
          pre({ children }) {
            return (
              <pre className="my-2 p-3 rounded-lg bg-bg-subtle border border-line overflow-x-auto text-[12px] font-mono leading-relaxed">
                {children}
              </pre>
            )
          }
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
