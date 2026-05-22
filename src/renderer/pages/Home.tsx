import { useEffect, useState } from 'react'
import { Mic, ArrowRight, Sparkles, TrendingUp } from 'lucide-react'
import type { Route, HistoryEntry } from '@shared/types'
import { api } from '@/lib/api'
import { cn, formatRelativeTime } from '@/lib/utils'

interface Props {
  onNavigateToRoutes: () => void
}

export function Home({ onNavigateToRoutes }: Props): JSX.Element {
  const [routes, setRoutes] = useState<Route[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])

  useEffect(() => {
    void Promise.all([api.listRoutes(), api.listHistory(7)]).then(([r, h]) => {
      setRoutes(r)
      setHistory(h)
    })
  }, [])

  const recent = [...routes]
    .filter((r) => r.lastUsedAt)
    .sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? ''))
    .slice(0, 6)

  const top = [...routes]
    .sort((a, b) => b.useCount - a.useCount)
    .slice(0, 6)

  const hour = new Date().getHours()
  const greeting = hour < 6 ? 'Boa madrugada' : hour < 12 ? 'Bom dia' : hour < 19 ? 'Boa tarde' : 'Boa noite'

  return (
    <div className="flex flex-col gap-8 p-8 max-w-5xl">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink">{greeting}, Roberto.</h1>
        <p className="text-sm text-ink-muted">
          {routes.length} rotas cadastradas · {history.length} comandos recentes
        </p>
      </header>

      <section className="card p-6 flex items-center gap-5">
        <div className="w-12 h-12 rounded-xl bg-accent-subtle border border-accent/30 flex items-center justify-center">
          <Mic size={20} className="text-accent" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-ink">Pressione o atalho para falar</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            O overlay aparece no centro da tela. Funciona em qualquer aplicativo.
          </p>
        </div>
        <div className="flex gap-1">
          <span className="kbd">⌘</span>
          <span className="kbd">⇧</span>
          <span className="kbd">Space</span>
        </div>
      </section>

      {recent.length > 0 && (
        <Section
          icon={<Sparkles size={14} className="text-accent" />}
          title="Usados recentemente"
        >
          <Grid routes={recent} />
        </Section>
      )}

      {top.length > 0 && (
        <Section icon={<TrendingUp size={14} className="text-accent" />} title="Mais usados">
          <Grid routes={top} />
        </Section>
      )}

      {routes.length === 0 && (
        <button
          onClick={onNavigateToRoutes}
          className={cn(
            'card card-hover p-8 flex items-center justify-between text-left',
            'border-dashed border-accent/40 hover:border-accent'
          )}
        >
          <div>
            <h3 className="text-sm font-semibold text-ink">Cadastre sua primeira rota</h3>
            <p className="text-xs text-ink-muted mt-1">
              Comandos como "abrir investimento da Organiker" precisam de URLs cadastradas.
            </p>
          </div>
          <ArrowRight size={18} className="text-accent" />
        </button>
      )}
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-ink-muted">
        {icon}
        <h2 className="text-xs uppercase tracking-wider font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function Grid({ routes }: { routes: Route[] }): JSX.Element {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {routes.map((r) => (
        <button
          key={r.id}
          onClick={() => api.execute(r.command)}
          className="card card-hover p-4 flex items-center gap-3 text-left"
        >
          <div className="w-9 h-9 rounded-lg bg-bg-hover border border-line flex items-center justify-center text-base">
            {r.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink truncate">{r.command}</p>
            <p className="text-[11px] text-ink-dim truncate">{r.category}</p>
          </div>
        </button>
      ))}
    </div>
  )
}
