import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CalendarRange, CalendarClock, Wallet, RefreshCw, TrendingDown } from 'lucide-react'
import { api } from '@/lib/api'
import { cn, formatUsd } from '@/lib/utils'
import type { AgentConfig, UsageBucket, UsageEntry, UsageSummary } from '@shared/types'

/**
 * Consumo (Usage) dashboard. All numbers come from ~/.nexus/usage.jsonl, a
 * permanent append-only log. Roberto wanted to never "perder de mão" — so
 * even if the app crashes between sessions, every API call is on disk and
 * the dashboard recomputes from scratch each visit.
 */
export function Usage(): JSX.Element {
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [entries, setEntries] = useState<UsageEntry[]>([])
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [loading, setLoading] = useState(true)

  async function load(): Promise<void> {
    setLoading(true)
    try {
      const [s, e, a] = await Promise.all([
        api.usageSummary(),
        api.usageList(),
        api.agentsList()
      ])
      setSummary(s)
      setEntries(e)
      setAgents(a)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  // Refresh whenever a new message lands (means usage was just appended).
  useEffect(() => {
    const off = api.onAgentReply(() => { void load() })
    return off
  }, [])

  const agentName = useMemo(() => {
    const m: Record<string, AgentConfig> = {}
    for (const a of agents) m[a.id] = a
    return m
  }, [agents])

  if (!summary) {
    return (
      <div className="p-8 text-ink-muted text-sm flex items-center gap-2">
        {loading ? 'Carregando…' : 'Sem dados ainda. Faça uma chamada pra um agente e o consumo aparece aqui.'}
      </div>
    )
  }

  const noData = summary.all.calls === 0

  return (
    <div className="flex flex-col h-full">
      <header className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-line flex items-start justify-between gap-3 flex-shrink-0">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-ink">Consumo</h1>
          <p className="text-xs text-ink-muted hidden sm:block">
            Custo de cada chamada pra Anthropic, em USD. Tudo salvo em <span className="font-mono">~/.nexus/usage.jsonl</span>.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="h-8 px-2 sm:px-2.5 rounded-md text-xs text-ink-muted hover:text-ink hover:bg-bg-hover flex items-center gap-1.5 transition-all flex-shrink-0"
          title="Atualizar"
          aria-label="Atualizar"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">Atualizar</span>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto scroll-area">
        <div className="max-w-5xl mx-auto p-4 sm:p-6 flex flex-col gap-6 sm:gap-8">

          {noData && (
            <div className="card p-8 text-center">
              <p className="text-sm text-ink-muted">
                Nenhuma chamada registrada ainda. Comece uma conversa em Chat e os números aparecem aqui em tempo real.
              </p>
            </div>
          )}

          {/* ============ Totals ============ */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <BucketCard
              label="Hoje"
              icon={<CalendarDays size={14} />}
              bucket={summary.today}
            />
            <BucketCard
              label="7 dias"
              icon={<CalendarRange size={14} />}
              bucket={summary.week}
            />
            <BucketCard
              label="30 dias"
              icon={<CalendarClock size={14} />}
              bucket={summary.month}
            />
            <BucketCard
              label="Total"
              icon={<Wallet size={14} />}
              bucket={summary.all}
              highlight
            />
          </section>

          {/* ============ Per-day chart (last 30) ============ */}
          {!noData && <PerDayChart perDay={summary.perDay} />}

          {/* ============ Per-agent breakdown ============ */}
          {!noData && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xs uppercase tracking-wider font-semibold text-ink-muted">
                Por agente (total)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {agents.map((a) => {
                  const b = summary.perAgent[a.id]
                  return (
                    <div key={a.id} className="card p-4 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg leading-none">{a.emoji}</span>
                        <span className="text-sm font-medium text-ink">{a.displayName}</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-mono font-semibold text-ink">
                          {formatUsd(b?.usd ?? 0)}
                        </span>
                      </div>
                      <p className="text-[11px] text-ink-dim">
                        {b?.calls ?? 0} chamadas · {(b?.inputTokens ?? 0).toLocaleString('pt-BR')} in · {(b?.outputTokens ?? 0).toLocaleString('pt-BR')} out
                      </p>
                      {(b?.cacheReadInputTokens ?? 0) > 0 && (
                        <p className="text-[10px] text-success flex items-center gap-1">
                          <TrendingDown size={10} />
                          {(b!.cacheReadInputTokens).toLocaleString('pt-BR')} tokens reaproveitados via cache
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* ============ Recent calls ============ */}
          {/*
            Layout switches on viewport width:
              - md+ : 5-column table (when / agent / input / output / cost)
              - <md: stacked cards — agent + cost on top, tokens + time below
            Same data, no horizontal scroll, no truncation.
          */}
          {!noData && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xs uppercase tracking-wider font-semibold text-ink-muted">
                Últimas chamadas
              </h2>
              <div className="card overflow-hidden">
                {/* Table header — only when there's room for the columns */}
                <div className="hidden md:grid grid-cols-[1fr_140px_100px_100px_110px] text-[11px] uppercase tracking-wider text-ink-dim px-3 py-2 border-b border-line bg-bg-subtle/40">
                  <span>Quando</span>
                  <span>Agente</span>
                  <span className="text-right">Input</span>
                  <span className="text-right">Output</span>
                  <span className="text-right">Custo</span>
                </div>
                <div className="max-h-[320px] overflow-y-auto scroll-area">
                  {[...entries].reverse().slice(0, 100).map((e, i) => {
                    const a = agentName[e.agentId]
                    return (
                      <div
                        key={i}
                        className="border-b border-line/50 last:border-b-0 hover:bg-bg-hover transition-colors text-xs"
                      >
                        {/* Compact stacked layout for narrow widths */}
                        <div className="flex md:hidden flex-col gap-1 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-ink flex items-center gap-1.5 truncate">
                              <span>{a?.emoji ?? '✨'}</span>
                              <span className="font-medium truncate">{a?.displayName ?? e.agentId}</span>
                            </span>
                            <span className="font-mono text-ink font-semibold">{formatUsd(e.usd)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-ink-dim">
                            <span>{formatDateTime(e.at)}</span>
                            <span className="font-mono">
                              {e.inputTokens.toLocaleString('pt-BR')} in · {e.outputTokens.toLocaleString('pt-BR')} out
                            </span>
                          </div>
                        </div>
                        {/* Table-row layout for wider widths */}
                        <div className="hidden md:grid grid-cols-[1fr_140px_100px_100px_110px] items-center px-3 py-2">
                          <span className="text-ink-muted">{formatDateTime(e.at)}</span>
                          <span className="text-ink flex items-center gap-1.5 truncate">
                            <span>{a?.emoji ?? '✨'}</span>
                            <span className="truncate">{a?.displayName ?? e.agentId}</span>
                          </span>
                          <span className="text-right font-mono text-ink-muted">
                            {e.inputTokens.toLocaleString('pt-BR')}
                          </span>
                          <span className="text-right font-mono text-ink-muted">
                            {e.outputTokens.toLocaleString('pt-BR')}
                          </span>
                          <span className="text-right font-mono text-ink font-semibold">
                            {formatUsd(e.usd)}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>
          )}

          <p className="text-[10px] text-ink-dim text-center pt-2">
            Os valores em USD são calculados pelo NEXUS a partir dos tokens retornados pela Anthropic.
            Pode haver diferença mínima vs. a fatura oficial do Console.
          </p>

        </div>
      </div>
    </div>
  )
}

function BucketCard({
  label,
  icon,
  bucket,
  highlight
}: {
  label: string
  icon: React.ReactNode
  bucket: UsageBucket
  highlight?: boolean
}): JSX.Element {
  return (
    <div
      className={cn(
        'card p-4 flex flex-col gap-2',
        highlight && 'border-accent/40 bg-accent-subtle/30'
      )}
    >
      <div className="flex items-center gap-1.5 text-ink-muted">
        {icon}
        <span className="text-[11px] uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <span className="text-2xl font-mono font-semibold text-ink">
        {formatUsd(bucket.usd)}
      </span>
      <p className="text-[11px] text-ink-dim">
        {bucket.calls} chamadas · {(bucket.inputTokens + bucket.cacheReadInputTokens).toLocaleString('pt-BR')} in / {bucket.outputTokens.toLocaleString('pt-BR')} out
      </p>
    </div>
  )
}

/**
 * Simple CSS bar chart — last 30 days. No chart library on purpose: the data
 * is small and a 30-bar SVG-free implementation is lighter and matches the
 * rest of the app's hand-tuned aesthetic.
 */
function PerDayChart({ perDay }: { perDay: Record<string, UsageBucket> }): JSX.Element {
  // Build a 30-day array ending today so empty days are still shown.
  const days: { key: string; bucket: UsageBucket | undefined; label: string }[] = []
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    days.push({
      key,
      bucket: perDay[key],
      label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
    })
  }

  const max = Math.max(...days.map((d) => d.bucket?.usd ?? 0), 0.0001)

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs uppercase tracking-wider font-semibold text-ink-muted">
        Últimos 30 dias
      </h2>
      <div className="card p-4">
        <div className="flex items-end gap-1 h-32">
          {days.map((d) => {
            const value = d.bucket?.usd ?? 0
            const heightPct = value === 0 ? 2 : Math.max((value / max) * 100, 4)
            return (
              <div
                key={d.key}
                title={`${d.label}: ${formatUsd(value)} (${d.bucket?.calls ?? 0} chamadas)`}
                className="flex-1 group relative flex flex-col justify-end"
                style={{ minWidth: 0 }}
              >
                <div
                  className={cn(
                    'w-full rounded-t transition-all',
                    value > 0 ? 'bg-accent group-hover:bg-accent-hover' : 'bg-line'
                  )}
                  style={{ height: `${heightPct}%` }}
                />
              </div>
            )
          })}
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-ink-dim">
          <span>{days[0]?.label}</span>
          <span>{days[Math.floor(days.length / 2)]?.label}</span>
          <span>{days[days.length - 1]?.label}</span>
        </div>
      </div>
    </section>
  )
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
