import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, CornerDownLeft, X, Sparkles, ArrowRight, AlertCircle } from 'lucide-react'
import type { Intent, NavCandidate, ExecuteResult, Route, RouteTemplate } from '@shared/types'
import { api } from '@/lib/api'
import { useAudioRecorder } from './useAudioRecorder'
import { cn } from '@/lib/utils'

interface DisplayCandidate {
  candidate: NavCandidate
  command: string
  icon: string
  url: string
  subtitle: string
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'recording' }
  | { kind: 'transcribing' }
  | { kind: 'classifying'; text: string }
  | { kind: 'executing'; text: string; intent: Intent }
  | { kind: 'result'; text: string; result: ExecuteResult }
  | { kind: 'ambiguous'; text: string; items: DisplayCandidate[] }
  | { kind: 'error'; message: string }

export function Overlay(): JSX.Element {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const recorder = useAudioRecorder()

  useEffect(() => {
    return api.onOverlayShow(() => {
      setPhase({ kind: 'idle' })
      setText('')
      setTimeout(() => inputRef.current?.focus(), 50)
    })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function close(): void {
    if (recorder.state.recording) recorder.cancel()
    api.hideOverlay()
    setTimeout(() => setPhase({ kind: 'idle' }), 100)
  }

  async function submit(input: string): Promise<void> {
    const trimmed = input.trim()
    if (!trimmed) return

    setPhase({ kind: 'classifying', text: trimmed })
    const classified = await api.classify(trimmed)

    if (classified.intent.kind === 'navigation_ambiguous') {
      const items = await resolveCandidates(classified.intent.candidates)
      setPhase({ kind: 'ambiguous', text: trimmed, items })
      return
    }

    setPhase({ kind: 'executing', text: trimmed, intent: classified.intent })
    const result = await api.execute(trimmed)
    setPhase({ kind: 'result', text: trimmed, result })
    setTimeout(close, result.ok ? 900 : 2400)
  }

  async function pickAmbiguous(candidate: NavCandidate): Promise<void> {
    if (phase.kind !== 'ambiguous') return
    const result = await api.executeChoice(phase.text, candidate)
    setPhase({ kind: 'result', text: phase.text, result })
    setTimeout(close, 900)
  }

  async function startRecording(): Promise<void> {
    try {
      await recorder.start()
      setPhase({ kind: 'recording' })
    } catch (err) {
      setPhase({ kind: 'error', message: 'Permita acesso ao microfone em Configurações do Sistema.' })
    }
  }

  async function stopRecording(): Promise<void> {
    setPhase({ kind: 'transcribing' })
    const base64 = await recorder.stop()
    try {
      const transcript = await api.transcribe(base64)
      if (!transcript) {
        setPhase({ kind: 'error', message: 'Não entendi. Tente novamente.' })
        return
      }
      setText(transcript)
      await submit(transcript)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setPhase({ kind: 'error', message: msg })
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      void submit(text)
    }
  }

  return (
    <div className="h-screen w-screen flex items-start justify-center pt-2 select-none">
      <div
        className={cn(
          'glass rounded-2xl border border-line shadow-2xl',
          'w-full max-w-[600px] overflow-hidden animate-slide-up',
          'flex flex-col'
        )}
      >
        <div className="titlebar flex items-center justify-between px-4 border-b border-line">
          <div className="flex items-center gap-2 no-drag">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center">
              <Sparkles size={11} className="text-white" />
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">NEXUS</span>
          </div>
          <button onClick={close} className="no-drag text-ink-dim hover:text-ink transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">

          {(phase.kind === 'idle' || phase.kind === 'error') && (
            <>
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Diga ou digite um comando…"
                  className="flex-1 h-11 px-3 rounded-lg bg-bg-elevated border border-line text-base text-ink placeholder:text-ink-dim focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40"
                />
                <button
                  onClick={() => void startRecording()}
                  className="h-11 w-11 rounded-lg bg-bg-elevated border border-line text-ink-muted hover:text-accent hover:border-accent/40 transition-all flex items-center justify-center"
                  title="Segurar para falar"
                >
                  <Mic size={16} />
                </button>
                <button
                  onClick={() => void submit(text)}
                  disabled={!text.trim()}
                  className="h-11 px-4 rounded-lg bg-accent text-white font-medium text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-accent-hover transition-all flex items-center gap-1.5"
                >
                  <CornerDownLeft size={14} />
                </button>
              </div>
              {phase.kind === 'error' ? (
                <div className="flex items-center gap-2 text-xs text-warning">
                  <AlertCircle size={13} /> {phase.message}
                </div>
              ) : (
                <Hints />
              )}
            </>
          )}

          {phase.kind === 'recording' && (
            <RecordingView
              level={recorder.state.level}
              onStop={() => void stopRecording()}
              onCancel={() => { recorder.cancel(); setPhase({ kind: 'idle' }) }}
            />
          )}

          {phase.kind === 'transcribing' && <StatusLine label="Transcrevendo…" />}
          {phase.kind === 'classifying' && <StatusLine label="Pensando…" subtle={phase.text} />}
          {phase.kind === 'executing' && <ExecutingView phase={phase} />}
          {phase.kind === 'result' && <ResultView phase={phase} />}
          {phase.kind === 'ambiguous' && (
            <AmbiguousView phase={phase} onPick={(c) => void pickAmbiguous(c)} />
          )}

        </div>
      </div>
    </div>
  )
}

async function resolveCandidates(candidates: NavCandidate[]): Promise<DisplayCandidate[]> {
  const items = await Promise.all(
    candidates.map(async (c) => {
      if (c.kind === 'route') {
        const r = await api.getRoute(c.routeId)
        if (!r) return null
        return display(c, r.command, r.icon, c.url, '')
      } else {
        const t = await api.getTemplate(c.templateId)
        if (!t) return null
        const subtitle = Object.entries(c.slots).map(([k, v]) => `${k}=${v}`).join(' · ')
        return display(c, t.command, t.icon, c.url, subtitle)
      }
    })
  )
  return items.filter((x): x is DisplayCandidate => x !== null)
}

function display(
  candidate: NavCandidate,
  command: string,
  icon: string,
  url: string,
  subtitle: string
): DisplayCandidate {
  return { candidate, command, icon, url, subtitle }
}

function Hints(): JSX.Element {
  return (
    <div className="flex items-center gap-3 text-[11px] text-ink-dim">
      <span className="flex items-center gap-1"><span className="kbd">⏎</span> enviar</span>
      <span className="flex items-center gap-1"><span className="kbd">Esc</span> fechar</span>
      <span className="ml-auto">Prefixe com <strong className="text-ink-muted">"Claude,"</strong> para enviar prompts</span>
    </div>
  )
}

function StatusLine({ label, subtle }: { label: string; subtle?: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-1 px-1">
      <div className="flex items-center gap-2 text-ink-muted text-sm">
        <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
        {label}
      </div>
      {subtle && <div className="text-xs text-ink-dim">"{subtle}"</div>}
    </div>
  )
}

function RecordingView({
  level,
  onStop,
  onCancel
}: {
  level: number
  onStop: () => void
  onCancel: () => void
}): JSX.Element {
  const bars = Array.from({ length: 18 }, (_, i) => {
    const reach = Math.max(0.1, level * 1.8 - Math.abs(i - 9) * 0.05)
    return Math.min(1, reach)
  })
  return (
    <div className="flex items-center gap-3 px-1 py-3">
      <button onClick={onCancel} className="text-ink-dim hover:text-danger transition-colors" title="Cancelar (Esc)">
        <MicOff size={18} />
      </button>
      <div className="flex-1 flex items-center justify-center gap-[3px] h-10">
        {bars.map((h, i) => (
          <div
            key={i}
            className="w-[3px] rounded-full bg-accent transition-all duration-75"
            style={{ height: `${Math.max(6, h * 36)}px`, opacity: 0.4 + h * 0.6 }}
          />
        ))}
      </div>
      <button
        onClick={onStop}
        className="h-10 px-4 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-all flex items-center gap-1.5"
      >
        Parar
      </button>
    </div>
  )
}

function ExecutingView({ phase }: { phase: Extract<Phase, { kind: 'executing' }> }): JSX.Element {
  const intent = phase.intent
  return (
    <div className="flex flex-col gap-2 px-1">
      <p className="text-base text-ink">"{phase.text}"</p>
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <span className="px-2 py-0.5 rounded bg-accent-subtle text-accent font-medium">
          {labelForIntent(intent)}
        </span>
        {intent.kind === 'navigation' && (
          <span className="text-ink-dim font-mono truncate">{intent.url}</span>
        )}
        {intent.kind === 'template_navigation' && (
          <>
            <span className="text-ink-dim font-mono truncate">{intent.url}</span>
            <span className="text-[10px] text-ink-dim">
              {Object.entries(intent.slots).map(([k, v]) => `${k}=${v}`).join(' · ')}
            </span>
          </>
        )}
        {intent.kind === 'prompt_claude' && (
          <span className="text-ink-dim truncate">→ Claude Code</span>
        )}
      </div>
    </div>
  )
}

function ResultView({ phase }: { phase: Extract<Phase, { kind: 'result' }> }): JSX.Element {
  return (
    <div className={cn('flex items-center gap-3 px-1 py-2', phase.result.ok ? 'text-success' : 'text-warning')}>
      <div className={cn('w-7 h-7 rounded-full flex items-center justify-center', phase.result.ok ? 'bg-success/15' : 'bg-warning/15')}>
        {phase.result.ok ? <ArrowRight size={14} /> : <AlertCircle size={14} />}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-ink">{phase.result.message}</p>
        <p className="text-[11px] text-ink-dim">"{phase.text}"</p>
      </div>
    </div>
  )
}

function AmbiguousView({
  phase,
  onPick
}: {
  phase: Extract<Phase, { kind: 'ambiguous' }>
  onPick: (c: NavCandidate) => void
}): JSX.Element {
  useKeyboardPicker(phase.items, onPick)
  return (
    <div className="flex flex-col gap-2 px-1">
      <p className="text-xs text-ink-muted">Mais de uma rota possível. Escolha:</p>
      <div className="flex flex-col gap-1.5">
        {phase.items.map((item, i) => (
          <button
            key={item.candidate.kind === 'route' ? item.candidate.routeId : item.candidate.templateId + Object.values(item.candidate.slots).join('-')}
            onClick={() => onPick(item.candidate)}
            className="flex items-center gap-3 p-2.5 rounded-lg bg-bg-elevated border border-line hover:border-accent/40 hover:bg-bg-hover transition-all text-left"
          >
            <span className="kbd">{i + 1}</span>
            <span className="text-base">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-ink truncate">
                {item.command}
                {item.candidate.kind === 'template' && (
                  <span className="text-[10px] text-ink-dim ml-2">{item.subtitle}</span>
                )}
              </p>
              <p className="text-[11px] text-ink-dim truncate font-mono">{item.url.replace(/^https?:\/\//, '')}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function useKeyboardPicker(items: DisplayCandidate[], onPick: (c: NavCandidate) => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const n = parseInt(e.key, 10)
      if (!isNaN(n) && n >= 1 && n <= items.length) {
        onPick(items[n - 1].candidate)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [items, onPick])
}

function labelForIntent(intent: Intent): string {
  switch (intent.kind) {
    case 'navigation': return 'Navegação'
    case 'template_navigation': return 'Template'
    case 'navigation_ambiguous': return 'Ambíguo'
    case 'prompt_claude': return 'Prompt Claude'
    case 'operational': return 'Operacional'
    case 'unknown': return 'Não reconhecido'
  }
}
