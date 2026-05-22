import { Route } from '@shared/types'
import { ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/utils'

interface Props {
  route: Route
  onEdit: (route: Route) => void
  onDelete: (route: Route) => void
  onOpen: (route: Route) => void
}

export function RouteCard({ route, onEdit, onDelete, onOpen }: Props): JSX.Element {
  return (
    <div className={cn('card card-hover p-4 flex flex-col gap-3 group')}>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-bg-hover border border-line flex items-center justify-center text-lg flex-shrink-0">
          {route.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-ink truncate">{route.command}</h3>
          <p className="text-xs text-ink-dim truncate font-mono mt-0.5">{stripProtocol(route.url)}</p>
        </div>
      </div>

      {route.aliases.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {route.aliases.slice(0, 3).map((a) => (
            <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-bg-hover text-ink-muted">
              {a}
            </span>
          ))}
          {route.aliases.length > 3 && (
            <span className="text-[10px] px-1.5 py-0.5 text-ink-dim">+{route.aliases.length - 3}</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2 text-[11px] text-ink-dim">
          <span className="px-1.5 py-0.5 rounded bg-accent-subtle text-accent font-medium">
            {route.category}
          </span>
          <span>•</span>
          <span>{route.useCount} usos</span>
          <span>•</span>
          <span>{formatRelativeTime(route.lastUsedAt)}</span>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconButton onClick={() => onOpen(route)} title="Abrir agora"><ExternalLink size={13} /></IconButton>
          <IconButton onClick={() => onEdit(route)} title="Editar"><Pencil size={13} /></IconButton>
          <IconButton onClick={() => onDelete(route)} title="Excluir" danger><Trash2 size={13} /></IconButton>
        </div>
      </div>
    </div>
  )
}

function IconButton({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }): JSX.Element {
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

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, '')
}
