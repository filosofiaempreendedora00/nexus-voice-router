import { useState, useEffect, FormEvent, useMemo } from 'react'
import { ArrowLeft, Save, Plus, X, Database, Sparkles, RefreshCw } from 'lucide-react'
import type { RouteTemplate, SlotDef, SlotValue } from '@shared/types'
import { api } from '@/lib/api'
import { Input } from '@/components/Input'
import { Button } from '@/components/Button'
import { useToast } from '@/components/Toast'
import { cn, formatRelativeTime } from '@/lib/utils'

interface Props {
  template: RouteTemplate | null
  onCancel: () => void
  onSaved: () => void
}

const SUGGESTED_ICONS = ['🧩', '🎯', '🔀', '📂', '🏢', '🗂️', '🌐', '⚡', '🧠', '🎨']
const SUGGESTED_CATEGORIES = ['Clientes', 'Apps', 'Ferramentas', 'Pessoal', 'Dashboards']

export function TemplateForm({ template, onCancel, onSaved }: Props): JSX.Element {
  const toast = useToast()
  const [command, setCommand] = useState(template?.command ?? '')
  const [urlPattern, setUrlPattern] = useState(
    template?.urlPattern ?? 'http://localhost:3000/{slot1}/{slot2}'
  )
  const [slots, setSlots] = useState<SlotDef[]>(template?.slots ?? [])
  const [category, setCategory] = useState(template?.category ?? 'Clientes')
  const [icon, setIcon] = useState(template?.icon ?? '🧩')
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const detectedNames = useMemo(() => {
    return Array.from(urlPattern.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)).map((m) => m[1])
  }, [urlPattern])

  useEffect(() => {
    setSlots((prev) => {
      const next: SlotDef[] = []
      const seen = new Set<string>()
      for (const name of detectedNames) {
        if (seen.has(name)) continue
        seen.add(name)
        const existing = prev.find((s) => s.name === name)
        if (existing) {
          next.push(existing)
        } else {
          next.push({
            name,
            required: true,
            source: { kind: 'static', values: [] }
          })
        }
      }
      return next
    })
  }, [detectedNames])

  function updateSlot(name: string, updater: (s: SlotDef) => SlotDef): void {
    setSlots((prev) => prev.map((s) => (s.name === name ? updater(s) : s)))
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!command.trim() || !urlPattern.trim()) {
      toast.show('error', 'Comando e padrão de URL são obrigatórios')
      return
    }
    if (slots.length === 0) {
      toast.show('error', 'Adicione ao menos um placeholder no padrão de URL (ex: {cliente})')
      return
    }
    setSaving(true)
    try {
      await api.saveTemplate({
        id: template?.id,
        command: command.trim(),
        urlPattern: urlPattern.trim(),
        slots,
        category,
        icon
      })
      toast.show('success', template ? 'Template atualizado' : 'Template criado')
      onSaved()
    } catch (err) {
      toast.show('error', String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleRefresh(): Promise<void> {
    if (!template) return
    setRefreshing(true)
    try {
      const results = await api.refreshTemplateSlots(template.id)
      const ok = results.filter((r) => r.ok).length
      const failed = results.filter((r) => !r.ok)
      if (failed.length > 0) {
        toast.show('error', `Falha em ${failed.length} slot(s): ${failed[0].error}`)
      } else {
        toast.show('success', `${ok} slot(s) sincronizados`)
      }
      const fresh = await api.getTemplate(template.id)
      if (fresh) setSlots(fresh.slots)
    } catch (err) {
      toast.show('error', String(err))
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      <header className="flex items-center justify-between gap-4 p-6 border-b border-line">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onCancel} className="text-ink-muted hover:text-ink transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-ink">
              {template ? 'Editar template' : 'Novo template'}
            </h1>
            <p className="text-xs text-ink-muted">
              Padrão de URL com placeholders que se preenchem por voz
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {template && (
            <Button type="button" variant="secondary" onClick={() => void handleRefresh()} disabled={refreshing}>
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Sincronizar
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            <Save size={14} /> {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scroll-area">
        <div className="max-w-3xl mx-auto p-8 flex flex-col gap-6">

          <Input
            label="Nome do template"
            placeholder="Ex: Cliente · Seção"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            hint="Como o template aparece na UI. Não precisa ser igual ao que você fala."
            autoFocus
          />

          <Input
            label="Padrão de URL"
            placeholder="http://localhost:3000/clientes/{cliente}/{secao}"
            value={urlPattern}
            onChange={(e) => setUrlPattern(e.target.value)}
            hint="Use {placeholders} para os valores que vão se preencher por voz."
            className="font-mono text-xs"
          />

          {slots.length > 0 && (
            <div className="flex flex-col gap-3">
              <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">
                Slots detectados
              </label>
              {slots.map((slot) => (
                <SlotEditor
                  key={slot.name}
                  slot={slot}
                  onChange={(updater) => updateSlot(slot.name, updater)}
                />
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Categoria</label>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={
                    'h-8 px-3 rounded-md text-xs font-medium transition-all ' +
                    (c === category
                      ? 'bg-accent-subtle text-accent border border-accent/40'
                      : 'bg-bg-elevated text-ink-muted border border-line hover:border-line-strong')
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Ícone</label>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_ICONS.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIcon(i)}
                  className={
                    'w-9 h-9 rounded-lg text-base transition-all ' +
                    (i === icon
                      ? 'bg-accent-subtle border border-accent/40 scale-110'
                      : 'bg-bg-elevated border border-line hover:border-line-strong')
                  }
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          <div className="card p-4 flex items-start gap-3 mt-4">
            <Sparkles size={16} className="text-accent flex-shrink-0 mt-0.5" />
            <div className="text-xs text-ink-muted leading-relaxed">
              <strong className="text-ink">Como funciona:</strong> NEXUS detecta quais palavras você falou
              que batem com os valores de cada slot. Combinando os slots preenchidos, monta a URL real.
              "abrir preço da organiker" → cliente=organiker, secao=investimento (via alias "preço") → URL final.
            </div>
          </div>

        </div>
      </div>
    </form>
  )
}

function SlotEditor({
  slot,
  onChange
}: {
  slot: SlotDef
  onChange: (updater: (s: SlotDef) => SlotDef) => void
}): JSX.Element {
  const isEndpoint = slot.source.kind === 'endpoint'

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <code className="px-2 py-0.5 rounded bg-bg-hover text-accent font-mono text-sm">
            {`{${slot.name}}`}
          </code>
          {isEndpoint && slot.source.kind === 'endpoint' && (
            <span className="text-[10px] text-ink-dim">
              {slot.source.lastFetchedAt
                ? `sincronizado ${formatRelativeTime(slot.source.lastFetchedAt)}`
                : 'nunca sincronizado'}
            </span>
          )}
        </div>
        <div className="flex bg-bg-elevated rounded-md p-0.5 border border-line">
          <button
            type="button"
            onClick={() =>
              onChange((s) => ({
                ...s,
                source: { kind: 'static', values: s.source.kind === 'static' ? s.source.values : [] }
              }))
            }
            className={cn(
              'h-7 px-2.5 text-[11px] font-medium rounded transition-all',
              !isEndpoint ? 'bg-bg-hover text-ink' : 'text-ink-muted hover:text-ink'
            )}
          >
            Lista
          </button>
          <button
            type="button"
            onClick={() =>
              onChange((s) => ({
                ...s,
                source: {
                  kind: 'endpoint',
                  url: s.source.kind === 'endpoint' ? s.source.url : '',
                  cachedValues: s.source.kind === 'endpoint' ? s.source.cachedValues : [],
                  lastFetchedAt: s.source.kind === 'endpoint' ? s.source.lastFetchedAt : null
                }
              }))
            }
            className={cn(
              'h-7 px-2.5 text-[11px] font-medium rounded transition-all flex items-center gap-1',
              isEndpoint ? 'bg-bg-hover text-ink' : 'text-ink-muted hover:text-ink'
            )}
          >
            <Database size={11} /> Endpoint
          </button>
        </div>
      </div>

      {slot.source.kind === 'endpoint' && (
        <div className="flex flex-col gap-2">
          <input
            type="url"
            placeholder="http://localhost:3000/__nexus/slots"
            value={slot.source.url}
            onChange={(e) => {
              const next = e.target.value
              onChange((s) =>
                s.source.kind === 'endpoint'
                  ? { ...s, source: { ...s.source, url: next } }
                  : s
              )
            }}
            className="h-9 px-3 rounded-md bg-bg-elevated border border-line text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <p className="text-[11px] text-ink-dim">
            Endpoint deve retornar JSON:
            <code className="ml-1 text-ink-muted">{`{ "slots": { "${slot.name}": [...] } }`}</code>
          </p>
          {slot.source.lastError && (
            <p className="text-[11px] text-warning">⚠ {slot.source.lastError}</p>
          )}
        </div>
      )}

      <StaticValuesEditor slot={slot} onChange={onChange} />
    </div>
  )
}

function StaticValuesEditor({
  slot,
  onChange
}: {
  slot: SlotDef
  onChange: (updater: (s: SlotDef) => SlotDef) => void
}): JSX.Element {
  const values =
    slot.source.kind === 'static' ? slot.source.values : slot.source.cachedValues
  const editable = slot.source.kind === 'static'
  const [draftValue, setDraftValue] = useState('')

  function addValue(): void {
    const v = draftValue.trim()
    if (!v) return
    onChange((s) => {
      if (s.source.kind !== 'static') return s
      if (s.source.values.some((x) => x.value === v)) return s
      return { ...s, source: { ...s.source, values: [...s.source.values, { value: v, aliases: [] }] } }
    })
    setDraftValue('')
  }

  function removeValue(value: string): void {
    onChange((s) =>
      s.source.kind === 'static'
        ? { ...s, source: { ...s.source, values: s.source.values.filter((x) => x.value !== value) } }
        : s
    )
  }

  function updateAliases(value: string, aliases: string[]): void {
    onChange((s) =>
      s.source.kind === 'static'
        ? {
            ...s,
            source: {
              ...s.source,
              values: s.source.values.map((x) => (x.value === value ? { ...x, aliases } : x))
            }
          }
        : s
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {values.length === 0 && !editable && (
        <p className="text-[11px] text-ink-dim italic">Sincronize com o endpoint para popular.</p>
      )}
      {values.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {values.map((sv) => (
            <SlotValueRow
              key={sv.value}
              value={sv}
              editable={editable}
              onRemove={() => removeValue(sv.value)}
              onAliasesChange={(a) => updateAliases(sv.value, a)}
            />
          ))}
        </div>
      )}
      {editable && (
        <div className="flex items-center gap-2">
          <input
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addValue()
              }
            }}
            placeholder={`Novo valor (ex: organiker)`}
            className="flex-1 h-8 px-2.5 rounded-md bg-bg-elevated border border-line text-xs focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <button
            type="button"
            onClick={addValue}
            disabled={!draftValue.trim()}
            className="h-8 px-2.5 rounded-md bg-bg-elevated border border-line text-ink-muted hover:text-ink hover:border-line-strong disabled:opacity-40 transition-all"
          >
            <Plus size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

function SlotValueRow({
  value,
  editable,
  onRemove,
  onAliasesChange
}: {
  value: SlotValue
  editable: boolean
  onRemove: () => void
  onAliasesChange: (next: string[]) => void
}): JSX.Element {
  const [aliasDraft, setAliasDraft] = useState('')
  const aliases = value.aliases ?? []

  function addAlias(): void {
    const a = aliasDraft.trim()
    if (!a || aliases.includes(a)) {
      setAliasDraft('')
      return
    }
    onAliasesChange([...aliases, a])
    setAliasDraft('')
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-bg-elevated border border-line">
      <span className="text-xs font-mono text-ink min-w-[80px] truncate">{value.value}</span>
      <div className="flex-1 flex flex-wrap gap-1 items-center">
        {aliases.map((a) => (
          <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-hover text-ink-muted flex items-center gap-1">
            {a}
            {editable && (
              <button
                type="button"
                onClick={() => onAliasesChange(aliases.filter((x) => x !== a))}
                className="text-ink-dim hover:text-danger"
              >
                <X size={9} />
              </button>
            )}
          </span>
        ))}
        {editable && (
          <input
            value={aliasDraft}
            onChange={(e) => setAliasDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addAlias()
              }
            }}
            onBlur={addAlias}
            placeholder="+ alias"
            className="text-[10px] bg-transparent outline-none placeholder:text-ink-dim w-[80px]"
          />
        )}
      </div>
      {editable && (
        <button
          type="button"
          onClick={onRemove}
          className="text-ink-dim hover:text-danger transition-colors"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}
