import { RouteTemplate } from '@shared/types'
import { ExternalLink, Pencil, Trash2, Database, Zap, AlertTriangle } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'

interface Props {
  template: RouteTemplate
  onEdit: (t: RouteTemplate) => void
  onDelete: (t: RouteTemplate) => void
  onRefresh: (t: RouteTemplate) => void
}

export function TemplateCard({ template, onEdit, onDelete, onRefresh }: Props): JSX.Element {
  const hasEndpoint = template.slots.some((s) => s.source.kind === 'endpoint')
  const totalCombinations = template.slots.reduce((acc, s) => {
    const count = s.source.kind === 'static' ? s.source.values.length : s.source.cachedValues.length
    return acc * Math.max(count, 1)
  }, 1)

  const hasError = template.slots.some(
    (s) => s.source.kind === 'endpoint' && s.source.lastError
  )

  return (
    <div className={cn('card card-hover p-4 flex flex-col gap-3 group')}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-bg-hover border border-line flex items-center justify-center text-lg flex-shrink-0">
          {template.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-ink truncate flex items-center gap-2">
            {template.command}
            {hasEndpoint && (
              <span title="Auto-discovery ativo">
                <Zap size={12} className="text-accent" />
              </span>
            )}
            {hasError && (
              <span title="Falha na última sincronização">
                <AlertTriangle size={12} className="text-warning" />
              </span>
            )}
          </h3>
          <p className="text-xs text-ink-dim font-mono truncate mt-0.5">
            {template.urlPattern.replace(/^https?:\/\//, '')}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {template.slots.map((slot) => {
          const isEndpoint = slot.source.kind === 'endpoint'
          const values = isEndpoint
            ? slot.source.kind === 'endpoint' ? slot.source.cachedValues : []
            : slot.source.kind === 'static' ? slot.source.values : []
          return (
            <div key={slot.name} className="flex items-center gap-2 text-[11px]">
              <code className="px-1.5 py-0.5 rounded bg-bg-hover text-accent font-mono">{`{${slot.name}}`}</code>
              <span className="text-ink-dim">
                {values.length} valor{values.length !== 1 ? 'es' : ''}
              </span>
              {isEndpoint && (
                <span className="flex items-center gap-1 text-ink-dim">
                  <Database size={10} />
                  {slot.source.kind === 'endpoint' && slot.source.lastFetchedAt
                    ? `sync ${formatRelativeTime(slot.source.lastFetchedAt)}`
                    : 'aguardando sync'}
                </span>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2 text-[11px] text-ink-dim">
          <span className="px-1.5 py-0.5 rounded bg-accent-subtle text-accent font-medium">
            {template.category}
          </span>
          <span>•</span>
          <span>{totalCombinations.toLocaleString('pt-BR')} combinações</span>
          <span>•</span>
          <span>{template.useCount} usos</span>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {hasEndpoint && (
            <IconButton onClick={() => onRefresh(template)} title="Sincronizar slots agora">
              <ExternalLink size={13} />
            </IconButton>
          )}
          <IconButton onClick={() => onEdit(template)} title="Editar"><Pencil size={13} /></IconButton>
          <IconButton onClick={() => onDelete(template)} title="Excluir" danger><Trash2 size={13} /></IconButton>
        </div>
      </div>
    </div>
  )
}

function IconButton({
  children,
  onClick,
  title,
  danger
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  danger?: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'w-7 h-7 rounded-md inline-flex items-center justify-center transition-all',
        danger
          ? 'text-ink-dim hover:text-danger hover:bg-danger/10'
          : 'text-ink-dim hover:text-ink hover:bg-bg-hover'
      )}
    >
      {children}
    </button>
  )
}
