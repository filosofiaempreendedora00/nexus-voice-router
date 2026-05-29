import { useEffect, useMemo, useState } from 'react'
import { Sparkles, ExternalLink, Mic, Bot, Globe, Layers } from 'lucide-react'
import type { Route, RouteTemplate, BaseUrlEntry } from '@shared/types'
import { api } from '@/lib/api'
import { useToast } from '@/components/Toast'
import { cn, formatRelativeTime } from '@/lib/utils'

interface AgentApp {
  kind: 'web'
  origin: string
  label: string
  icon: string
  routes: Route[]
  templates: RouteTemplate[]
  totalUses: number
  lastUsedAt: string | null
  isActive: boolean
}

interface AgentClaude {
  kind: 'claude'
}

type Agent = AgentApp | AgentClaude

export function Agents(): JSX.Element {
  const [routes, setRoutes] = useState<Route[]>([])
  const [templates, setTemplates] = useState<RouteTemplate[]>([])
  const [baseUrls, setBaseUrls] = useState<BaseUrlEntry[]>([])
  const toast = useToast()

  async function refresh(): Promise<void> {
    const [r, t, s] = await Promise.all([
      api.listRoutes(),
      api.listTemplates(),
      api.getSettings()
    ])
    setRoutes(r)
    setTemplates(t)
    setBaseUrls(s.baseUrls)
  }
  useEffect(() => { void refresh() }, [])

  const apps: AgentApp[] = useMemo(() => {
    const map = new Map<string, AgentApp>()
    const activeBase = baseUrls[0]
    const activeOrigin = activeBase ? safeOrigin(activeBase.url) : null

    function ensure(origin: string): AgentApp {
      if (!map.has(origin)) {
        const baseEntry = baseUrls.find((b) => safeOrigin(b.url) === origin)
        const label = baseEntry?.label ?? deriveLabel(origin)
        const icon = guessIcon(label, origin)
        map.set(origin, {
          kind: 'web',
          origin,
          label,
          icon,
          routes: [],
          templates: [],
          totalUses: 0,
          lastUsedAt: null,
          isActive: origin === activeOrigin
        })
      }
      return map.get(origin)!
    }

    for (const r of routes) {
      const origin = safeOrigin(r.url)
      if (!origin) continue
      // If this URL would be rewritten (origin is in baseUrls), bucket it
      // under the ACTIVE origin instead so it shows on the active agent.
      const isRewritable = baseUrls.some((b) => safeOrigin(b.url) === origin)
      const bucket = isRewritable && activeOrigin ? activeOrigin : origin
      const a = ensure(bucket)
      a.routes.push(r)
      a.totalUses += r.useCount
      a.lastUsedAt = laterIso(a.lastUsedAt, r.lastUsedAt)
    }
    for (const t of templates) {
      const origin = safeOrigin(t.urlPattern)
      if (!origin) continue
      const isRewritable = baseUrls.some((b) => safeOrigin(b.url) === origin)
      const bucket = isRewritable && activeOrigin ? activeOrigin : origin
      const a = ensure(bucket)
      a.templates.push(t)
      a.totalUses += t.useCount
      a.lastUsedAt = laterIso(a.lastUsedAt, t.lastUsedAt)
    }

    // Also include any base-url entries that have no routes yet (so they still show).
    for (const b of baseUrls) {
      const origin = safeOrigin(b.url)
      if (origin && origin === activeOrigin && !map.has(origin)) {
        ensure(origin)
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.isActive && !b.isActive) return -1
      if (!a.isActive && b.isActive) return 1
      return b.totalUses - a.totalUses
    })
  }, [routes, templates, baseUrls])

  async function openAgent(origin: string): Promise<void> {
    const result = await api.execute('abrir ' + originHostName(origin))
    if (!result.ok) {
      try {
        await window.nexus.execute(origin) // try open the origin directly
      } catch { /* ignore */ }
    }
    void refresh()
  }

  return (
    <div className="flex flex-col h-full">
      <header className="p-4 sm:p-6 border-b border-line">
        <h1 className="text-lg font-semibold text-ink">Agentes</h1>
        <p className="text-xs text-ink-muted">
          Os sistemas com os quais o NEXUS sabe interagir por voz
        </p>
      </header>

      <div className="flex-1 overflow-y-auto scroll-area">
        <div className="max-w-4xl mx-auto p-4 sm:p-8 flex flex-col gap-6 sm:gap-8">

          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-ink-muted">
              <Globe size={14} />
              <h2 className="text-xs uppercase tracking-wider font-semibold">
                Apps web ({apps.length})
              </h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {apps.map((app) => (
                <AppCard key={app.origin} app={app} onOpen={() => void openAgent(app.origin)} />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-ink-muted">
              <Bot size={14} />
              <h2 className="text-xs uppercase tracking-wider font-semibold">IA assistente</h2>
            </div>
            <ClaudeCard />
          </section>

          <section className="flex flex-col gap-2 text-[11px] text-ink-dim leading-relaxed">
            <div className="flex items-center gap-2 text-ink-muted">
              <Layers size={12} />
              <span>Como adicionar agentes</span>
            </div>
            <p>
              Pra incluir um novo sistema, cadastre uma <strong>rota</strong> apontando pra
              URL dele (página <strong>Rotas</strong> → Nova rota). Ele aparecerá automaticamente
              aqui agrupado pelo domínio. Pra alternar ambientes do mesmo app
              (local/staging/prod), use <strong>Configurações → URLs base</strong>.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

function AppCard({ app, onOpen }: { app: AgentApp; onOpen: () => void }): JSX.Element {
  return (
    <div className={cn('card card-hover p-4 flex flex-col gap-3', app.isActive && 'border-accent/40')}>
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-lg bg-bg-hover border border-line flex items-center justify-center text-xl flex-shrink-0">
          {app.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-ink truncate">{app.label}</h3>
            {app.isActive && (
              <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-accent text-white">
                Ativo
              </span>
            )}
          </div>
          <p className="text-xs text-ink-dim font-mono truncate">{originHostName(app.origin)}</p>
        </div>
        <button
          onClick={onOpen}
          className="w-8 h-8 rounded-md text-ink-dim hover:text-ink hover:bg-bg-hover flex items-center justify-center transition-all"
          title="Abrir no navegador"
        >
          <ExternalLink size={14} />
        </button>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-ink-dim">
        <span>{app.routes.length} rota{app.routes.length !== 1 ? 's' : ''}</span>
        {app.templates.length > 0 && (
          <>
            <span>·</span>
            <span>{app.templates.length} template{app.templates.length !== 1 ? 's' : ''}</span>
          </>
        )}
        <span>·</span>
        <span>{app.totalUses} usos</span>
        {app.lastUsedAt && (
          <>
            <span>·</span>
            <span>{formatRelativeTime(app.lastUsedAt)}</span>
          </>
        )}
      </div>

      {(app.routes.length > 0 || app.templates.length > 0) && (
        <div className="flex flex-wrap gap-1 pt-1">
          {app.routes.slice(0, 4).map((r) => (
            <span key={r.id} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-hover text-ink-muted">
              {r.icon} {r.command}
            </span>
          ))}
          {app.templates.slice(0, 4).map((t) => (
            <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded bg-accent-subtle text-accent">
              {t.icon} {t.command}
            </span>
          ))}
          {app.routes.length + app.templates.length > 4 && (
            <span className="text-[10px] px-1.5 py-0.5 text-ink-dim">
              +{app.routes.length + app.templates.length - 4}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function ClaudeCard(): JSX.Element {
  return (
    <div className="card p-4 flex flex-col gap-3 border-accent/30">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center text-xl flex-shrink-0 shadow-lg">
          <Sparkles size={20} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-ink">Claude</h3>
          <p className="text-xs text-ink-dim">Destino de prompts ditados por voz</p>
        </div>
      </div>
      <div className="text-xs text-ink-muted leading-relaxed flex items-start gap-2">
        <Mic size={14} className="text-accent flex-shrink-0 mt-0.5" />
        <div>
          <p>
            Diga <strong className="text-ink">"Nexus, claude [seu prompt] ok"</strong> em qualquer lugar do Mac.
            O NEXUS captura sua fala, foca o app do Claude e cola o prompt automaticamente.
          </p>
          <p className="mt-1 text-[10px] text-ink-dim">
            O "ok" no final é o gatilho de envio. Sem ele, o NEXUS aguarda 8s de silêncio total.
          </p>
        </div>
      </div>
    </div>
  )
}

function safeOrigin(url: string): string | null {
  try { return new URL(url).origin } catch { return null }
}

function originHostName(origin: string): string {
  try { return new URL(origin).host } catch { return origin }
}

function deriveLabel(origin: string): string {
  const host = originHostName(origin)
  // localhost:3000 → "Local"
  if (host.startsWith('localhost') || host.startsWith('127.')) return 'Local'
  // turbo-octopus.onrender.com → "Turbo Octopus"
  const parts = host.split('.')[0].split('-')
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

function guessIcon(label: string, origin: string): string {
  const l = label.toLowerCase()
  const h = origin.toLowerCase()
  if (l.includes('octopus') || h.includes('octopus')) return '🐙'
  if (l.includes('epicteto') || l.includes('epictet') || h.includes('epictet')) return '📚'
  if (l.includes('sales') || l.includes('jornada')) return '🛤️'
  if (l.includes('local')) return '💻'
  return '🌐'
}

function laterIso(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}
