import { useEffect, useMemo, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import type { Route, RouteTemplate } from '@shared/types'
import { api } from '@/lib/api'
import { Button } from '@/components/Button'
import { RouteCard } from '@/components/RouteCard'
import { TemplateCard } from '@/components/TemplateCard'
import { RouteForm } from './RouteForm'
import { TemplateForm } from './TemplateForm'
import { useToast } from '@/components/Toast'
import { cn } from '@/lib/utils'

type Tab = 'routes' | 'templates'

export function Routes(): JSX.Element {
  const [tab, setTab] = useState<Tab>('routes')
  const [routes, setRoutes] = useState<Route[]>([])
  const [templates, setTemplates] = useState<RouteTemplate[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('Todas')

  const [editingRoute, setEditingRoute] = useState<Route | null>(null)
  const [creatingRoute, setCreatingRoute] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<RouteTemplate | null>(null)
  const [creatingTemplate, setCreatingTemplate] = useState(false)

  const toast = useToast()

  async function refresh(): Promise<void> {
    const [r, t] = await Promise.all([api.listRoutes(), api.listTemplates()])
    setRoutes(r)
    setTemplates(t)
  }
  useEffect(() => { void refresh() }, [])

  const categories = useMemo(() => {
    const set = new Set<string>()
    routes.forEach((r) => set.add(r.category))
    templates.forEach((t) => set.add(t.category))
    return ['Todas', ...Array.from(set).sort()]
  }, [routes, templates])

  const filteredRoutes = useMemo(() => {
    const q = query.trim().toLowerCase()
    return routes.filter((r) => {
      if (category !== 'Todas' && r.category !== category) return false
      if (!q) return true
      return (
        r.command.toLowerCase().includes(q) ||
        r.aliases.some((a) => a.toLowerCase().includes(q)) ||
        r.url.toLowerCase().includes(q)
      )
    })
  }, [routes, query, category])

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return templates.filter((t) => {
      if (category !== 'Todas' && t.category !== category) return false
      if (!q) return true
      return t.command.toLowerCase().includes(q) || t.urlPattern.toLowerCase().includes(q)
    })
  }, [templates, query, category])

  async function deleteRoute(route: Route): Promise<void> {
    if (!confirm(`Excluir "${route.command}"?`)) return
    await api.deleteRoute(route.id)
    toast.show('success', 'Rota excluída')
    await refresh()
  }

  async function openRoute(route: Route): Promise<void> {
    const result = await api.execute(route.command)
    toast.show(result.ok ? 'success' : 'error', result.message)
    await refresh()
  }

  async function deleteTemplate(tpl: RouteTemplate): Promise<void> {
    if (!confirm(`Excluir template "${tpl.command}"?`)) return
    await api.deleteTemplate(tpl.id)
    toast.show('success', 'Template excluído')
    await refresh()
  }

  async function refreshTemplate(tpl: RouteTemplate): Promise<void> {
    const results = await api.refreshTemplateSlots(tpl.id)
    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
      toast.show('error', `Falha em ${failed.length} slot(s)`)
    } else {
      const total = results.reduce((acc, r) => acc + (r.count ?? 0), 0)
      toast.show('success', `${total} valores sincronizados`)
    }
    await refresh()
  }

  if (creatingRoute || editingRoute) {
    return (
      <RouteForm
        route={editingRoute}
        onCancel={() => { setCreatingRoute(false); setEditingRoute(null) }}
        onSaved={() => { setCreatingRoute(false); setEditingRoute(null); void refresh() }}
      />
    )
  }

  if (creatingTemplate || editingTemplate) {
    return (
      <TemplateForm
        template={editingTemplate}
        onCancel={() => { setCreatingTemplate(false); setEditingTemplate(null) }}
        onSaved={() => { setCreatingTemplate(false); setEditingTemplate(null); void refresh() }}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between gap-4 p-6 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-ink">Rotas</h1>
          <p className="text-xs text-ink-muted">
            {routes.length} rotas · {templates.length} template{templates.length !== 1 ? 's' : ''} ·{' '}
            {totalCombinations(templates).toLocaleString('pt-BR')} combinações cobertas
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={() => (tab === 'routes' ? setCreatingRoute(true) : setCreatingTemplate(true))}
        >
          <Plus size={14} /> {tab === 'routes' ? 'Nova rota' : 'Novo template'}
        </Button>
      </header>

      <div className="px-6">
        <div className="inline-flex bg-bg-subtle rounded-lg p-1 border border-line">
          <TabButton active={tab === 'routes'} onClick={() => setTab('routes')}>
            Rotas <span className="text-[10px] opacity-60 ml-1">({routes.length})</span>
          </TabButton>
          <TabButton active={tab === 'templates'} onClick={() => setTab('templates')}>
            Templates <span className="text-[10px] opacity-60 ml-1">({templates.length})</span>
          </TabButton>
        </div>
      </div>

      <div className="flex items-center gap-3 px-6 py-4 border-b border-line">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'routes' ? 'Buscar por comando, alias ou URL…' : 'Buscar template…'}
            className="w-full h-9 pl-9 pr-3 rounded-lg bg-bg-elevated border border-line text-sm placeholder:text-ink-dim focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40"
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={
                'h-8 px-3 rounded-md text-xs font-medium transition-all ' +
                (c === category
                  ? 'bg-accent-subtle text-accent border border-accent/40'
                  : 'text-ink-muted hover:text-ink hover:bg-bg-hover border border-transparent')
              }
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scroll-area p-6">
        {tab === 'routes' ? (
          filteredRoutes.length === 0 ? (
            <Empty message={routes.length === 0 ? 'Nenhuma rota ainda. Crie a primeira.' : 'Nada bate com a busca.'} />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {filteredRoutes.map((r) => (
                <RouteCard
                  key={r.id}
                  route={r}
                  onEdit={setEditingRoute}
                  onDelete={(r) => void deleteRoute(r)}
                  onOpen={(r) => void openRoute(r)}
                />
              ))}
            </div>
          )
        ) : filteredTemplates.length === 0 ? (
          <Empty
            message={
              templates.length === 0
                ? 'Nenhum template ainda. Crie o primeiro para cobrir milhares de URLs.'
                : 'Nada bate com a busca.'
            }
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filteredTemplates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onEdit={setEditingTemplate}
                onDelete={(t) => void deleteTemplate(t)}
                onRefresh={(t) => void refreshTemplate(t)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-8 px-3 rounded-md text-xs font-medium transition-all',
        active ? 'bg-bg-elevated text-ink shadow-sm border border-line' : 'text-ink-muted hover:text-ink'
      )}
    >
      {children}
    </button>
  )
}

function Empty({ message }: { message: string }): JSX.Element {
  return <div className="text-center py-20 text-ink-dim text-sm">{message}</div>
}

function totalCombinations(templates: RouteTemplate[]): number {
  let acc = 0
  for (const tpl of templates) {
    const product = tpl.slots.reduce((p, s) => {
      const count = s.source.kind === 'static' ? s.source.values.length : s.source.cachedValues.length
      return p * Math.max(count, 1)
    }, 1)
    acc += product
  }
  return acc
}
