import { Home, Compass, Clock, Settings as SettingsIcon, Mic, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Page = 'home' | 'routes' | 'history' | 'settings'

interface Props {
  current: Page
  onNavigate: (page: Page) => void
  hotkey: string
}

const ITEMS: { id: Page; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'routes', label: 'Rotas', icon: Compass },
  { id: 'history', label: 'Histórico', icon: Clock },
  { id: 'settings', label: 'Configurações', icon: SettingsIcon }
]

export function Sidebar({ current, onNavigate, hotkey }: Props): JSX.Element {
  return (
    <aside className="w-[220px] h-full flex flex-col bg-bg-subtle border-r border-line">
      <div className="titlebar flex-shrink-0" />

      <div className="px-4 pb-4 flex items-center gap-2.5 no-drag">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center shadow-lg">
          <Sparkles size={16} className="text-white" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-ink">NEXUS</span>
          <span className="text-[10px] uppercase tracking-wider text-ink-dim">Voice Router</span>
        </div>
      </div>

      <nav className="flex-1 px-2 flex flex-col gap-0.5">
        {ITEMS.map((item) => {
          const Icon = item.icon
          const active = current === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                'flex items-center gap-2.5 h-9 px-2.5 rounded-md text-sm transition-all',
                active
                  ? 'bg-bg-elevated text-ink shadow-sm border border-line'
                  : 'text-ink-muted hover:text-ink hover:bg-bg-hover border border-transparent'
              )}
            >
              <Icon size={15} className={active ? 'text-accent' : ''} />
              <span className="font-medium">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="p-3 border-t border-line">
        <div className="card p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-ink-muted">
            <Mic size={13} />
            <span className="text-[11px] uppercase tracking-wider font-medium">Atalho</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {formatHotkey(hotkey).map((k) => (
              <span key={k} className="kbd">{k}</span>
            ))}
          </div>
          <p className="text-[10px] text-ink-dim leading-snug">
            Segure em qualquer app para falar
          </p>
        </div>
      </div>
    </aside>
  )
}

function formatHotkey(accelerator: string): string[] {
  return accelerator
    .replace('CommandOrControl', '⌘')
    .replace('Command', '⌘')
    .replace('Control', 'Ctrl')
    .replace('Shift', '⇧')
    .replace('Alt', '⌥')
    .replace('Option', '⌥')
    .split('+')
}
