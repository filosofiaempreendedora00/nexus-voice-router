import { Home, Compass, Clock, Settings as SettingsIcon, Mic, Sparkles, Bot, MessageCircle, BarChart3, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Page = 'home' | 'chat' | 'usage' | 'mobile' | 'agents' | 'routes' | 'history' | 'settings'

interface Props {
  current: Page
  onNavigate: (page: Page) => void
  hotkey: string
}

const ITEMS: { id: Page; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'mobile', label: 'Mobile', icon: Smartphone },
  { id: 'usage', label: 'Consumo', icon: BarChart3 },
  { id: 'agents', label: 'Agentes', icon: Bot },
  { id: 'routes', label: 'Rotas', icon: Compass },
  { id: 'history', label: 'Histórico', icon: Clock },
  { id: 'settings', label: 'Configurações', icon: SettingsIcon }
]

/**
 * Sidebar with responsive collapse:
 * - ≥ lg (1024px+): full sidebar with labels and hotkey card at bottom
 * - < lg: collapsed strip (64px) showing only icons + brand mark; labels
 *   surfaced via native tooltips (`title` attr)
 *
 * This trade lets the Chat and Usage main areas keep enough horizontal
 * space when the window is shrunk to fit beside another app (e.g. Claude
 * desktop docked side-by-side).
 */
export function Sidebar({ current, onNavigate, hotkey }: Props): JSX.Element {
  return (
    <aside className="lg:w-[220px] w-[64px] flex-shrink-0 h-full flex flex-col bg-bg-subtle border-r border-line transition-[width] duration-200">
      <div className="titlebar flex-shrink-0" />

      {/* Brand mark */}
      <div className="px-2 lg:px-4 pb-3 lg:pb-4 flex items-center gap-2.5 justify-center lg:justify-start no-drag">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center shadow-lg flex-shrink-0">
          <Sparkles size={16} className="text-white" />
        </div>
        <div className="hidden lg:flex flex-col leading-tight min-w-0">
          <span className="text-sm font-semibold text-ink">NEXUS</span>
          <span className="text-[10px] uppercase tracking-wider text-ink-dim">Voice Router</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-1.5 lg:px-2 flex flex-col gap-0.5">
        {ITEMS.map((item) => {
          const Icon = item.icon
          const active = current === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={item.label}
              aria-label={item.label}
              className={cn(
                'flex items-center gap-2.5 h-9 px-2.5 rounded-md text-sm transition-all',
                'justify-center lg:justify-start',
                active
                  ? 'bg-bg-elevated text-ink shadow-sm border border-line'
                  : 'text-ink-muted hover:text-ink hover:bg-bg-hover border border-transparent'
              )}
            >
              <Icon size={15} className={cn('flex-shrink-0', active ? 'text-accent' : '')} />
              <span className="font-medium hidden lg:inline">{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Hotkey card — full sidebar only. On collapsed mode we just show a small mic dot. */}
      <div className="hidden lg:block p-3 border-t border-line">
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

      {/* Compact hotkey indicator — narrow mode only. */}
      <div className="lg:hidden p-2 border-t border-line flex items-center justify-center">
        <div
          title={`Atalho: ${formatHotkey(hotkey).join(' ')}`}
          className="w-9 h-9 rounded-md bg-bg-elevated border border-line flex items-center justify-center text-ink-muted"
        >
          <Mic size={14} />
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
