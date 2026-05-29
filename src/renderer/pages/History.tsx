import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, AlertCircle, HelpCircle } from 'lucide-react'
import type { HistoryEntry } from '@shared/types'
import { api } from '@/lib/api'
import { formatRelativeTime } from '@/lib/utils'

export function History(): JSX.Element {
  const [entries, setEntries] = useState<HistoryEntry[]>([])

  useEffect(() => {
    void api.listHistory(200).then(setEntries)
  }, [])

  return (
    <div className="flex flex-col h-full">
      <header className="p-4 sm:p-6 border-b border-line">
        <h1 className="text-lg font-semibold text-ink">Histórico</h1>
        <p className="text-xs text-ink-muted">Últimos comandos executados ({entries.length})</p>
      </header>
      <div className="flex-1 overflow-y-auto scroll-area">
        {entries.length === 0 ? (
          <div className="text-center py-20 text-ink-dim text-sm">Nenhum comando ainda.</div>
        ) : (
          <div className="divide-y divide-line">
            {entries.map((e) => (
              <Row key={e.id} entry={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ entry }: { entry: HistoryEntry }): JSX.Element {
  const Icon =
    entry.status === 'executed' ? CheckCircle2
    : entry.status === 'failed' ? XCircle
    : entry.status === 'ambiguous' ? AlertCircle
    : HelpCircle
  const color =
    entry.status === 'executed' ? 'text-success'
    : entry.status === 'failed' ? 'text-danger'
    : entry.status === 'ambiguous' ? 'text-warning'
    : 'text-ink-dim'

  return (
    <div className="px-4 sm:px-6 py-3 flex items-center gap-3 hover:bg-bg-hover">
      <Icon size={14} className={color + ' flex-shrink-0'} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink truncate">{entry.input}</p>
        {(entry.url || entry.prompt || entry.errorMessage) && (
          <p className="text-[11px] text-ink-dim truncate font-mono">
            {entry.url ?? entry.prompt ?? entry.errorMessage}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        {/* Intent chip is the first thing to drop when space is tight */}
        <span
          className="hidden md:inline text-[10px] uppercase tracking-wider text-ink-dim px-1.5 py-0.5 rounded bg-bg-elevated border border-line"
          title={`Intenção: ${entry.intent}`}
        >
          {entry.intent}
        </span>
        <span className="text-[11px] text-ink-dim whitespace-nowrap">{formatRelativeTime(entry.at)}</span>
      </div>
    </div>
  )
}
