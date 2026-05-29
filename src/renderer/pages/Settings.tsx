import { useEffect, useState } from 'react'
import { Save, Mic, Globe, Cpu, Volume2, Radio, Link2, Plus, ArrowUp, ArrowDown, Pencil, Trash2, Check, X, Terminal as TerminalIcon, KeyRound } from 'lucide-react'
import type { Settings as SettingsType, BaseUrlEntry } from '@shared/types'
import { api } from '@/lib/api'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { useToast } from '@/components/Toast'
import { cn } from '@/lib/utils'

export function Settings(): JSX.Element {
  const [settings, setSettings] = useState<SettingsType | null>(null)
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  useEffect(() => { void api.getSettings().then(setSettings) }, [])

  if (!settings) return <div className="p-8 text-ink-muted text-sm">Carregando…</div>

  async function update<K extends keyof SettingsType>(key: K, value: SettingsType[K]): Promise<void> {
    if (!settings) return
    setSaving(true)
    try {
      const next = await api.saveSettings({ [key]: value })
      setSettings(next)
      toast.show('success', 'Configuração salva')
    } catch (err) {
      toast.show('error', String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <header className="p-4 sm:p-6 border-b border-line">
        <h1 className="text-lg font-semibold text-ink">Configurações</h1>
        <p className="text-xs text-ink-muted">Atalho, voz e comportamento</p>
      </header>
      <div className="flex-1 overflow-y-auto scroll-area">
        <div className="max-w-2xl mx-auto p-4 sm:p-8 flex flex-col gap-6 sm:gap-8">

          <Group icon={<Mic size={14} />} title="Atalho de fala">
            <Input
              label="Combinação"
              value={settings.hotkey}
              onChange={(e) => setSettings({ ...settings, hotkey: e.target.value })}
              onBlur={(e) => void update('hotkey', e.target.value)}
              hint='Formato Electron. Ex: "CommandOrControl+Shift+Space"'
            />
          </Group>

          <Group icon={<KeyRound size={14} />} title="API Anthropic (agentes)">
            <Input
              label="Chave da API"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={settings.anthropicApiKey}
              onChange={(e) => setSettings({ ...settings, anthropicApiKey: e.target.value })}
              onBlur={(e) => void update('anthropicApiKey', e.target.value.trim())}
              placeholder="sk-ant-..."
              hint="Cole sua chave Anthropic. Fica salva localmente em settings.json (somente no seu Mac). Nunca é enviada pra telemetria."
            />
            <Input
              label="Modelo"
              value={settings.anthropicModel}
              onChange={(e) => setSettings({ ...settings, anthropicModel: e.target.value })}
              onBlur={(e) => void update('anthropicModel', e.target.value.trim())}
              placeholder="claude-sonnet-4-5-20250929"
              hint="Modelo Anthropic usado pelos agentes. Mantenha o default a menos que saiba o que faz."
            />
          </Group>

          <Group icon={<Link2 size={14} />} title="URLs base (ambientes)">
            <BaseUrlsEditor
              entries={settings.baseUrls}
              onChange={(next) => void update('baseUrls', next)}
            />
          </Group>

          <Group icon={<TerminalIcon size={14} />} title="Ditado pro Claude Code">
            <button
              onClick={() => void update('claudeAutoEnter', !settings.claudeAutoEnter)}
              className="flex items-center justify-between p-4 rounded-lg bg-bg-elevated border border-line hover:border-line-strong transition-all"
            >
              <div className="text-left">
                <p className="text-sm font-medium text-ink">Auto-enviar após ditar</p>
                <p className="text-xs text-ink-muted mt-0.5">
                  Quando você diz "Claude, refatora X" o NEXUS cola o prompt
                  e aperta Enter automaticamente. Desligue se quiser revisar antes.
                </p>
              </div>
              <div
                className={
                  'w-10 h-6 rounded-full transition-all relative flex-shrink-0 ml-3 ' +
                  (settings.claudeAutoEnter ? 'bg-accent' : 'bg-bg-hover border border-line')
                }
              >
                <div
                  className={
                    'w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ' +
                    (settings.claudeAutoEnter ? 'left-[18px]' : 'left-0.5')
                  }
                />
              </div>
            </button>
            <Input
              label="App preferido (vazio = auto-detecta)"
              value={settings.claudeCodeApp}
              onChange={(e) => setSettings({ ...settings, claudeCodeApp: e.target.value })}
              onBlur={(e) => void update('claudeCodeApp', e.target.value)}
              placeholder="Ex: Cursor, Code, iTerm2, Terminal"
              hint="Nome exato do app onde você roda o Claude Code. Default: tenta Cursor → VS Code → iTerm → Terminal."
            />
          </Group>

          <Group icon={<Radio size={14} />} title="Modo hands-free (wake word)">
            <button
              onClick={() => void update('wakeMode', !settings.wakeMode)}
              className="flex items-center justify-between p-4 rounded-lg bg-bg-elevated border border-line hover:border-line-strong transition-all"
            >
              <div className="text-left">
                <p className="text-sm font-medium text-ink">Sempre ouvindo a palavra "Nexus"</p>
                <p className="text-xs text-ink-muted mt-0.5">
                  Indicador no canto da tela. Microfone fica ativo em background.
                  Comando submete automaticamente após 1.3s de silêncio.
                </p>
              </div>
              <div
                className={
                  'w-10 h-6 rounded-full transition-all relative flex-shrink-0 ml-3 ' +
                  (settings.wakeMode ? 'bg-accent' : 'bg-bg-hover border border-line')
                }
              >
                <div
                  className={
                    'w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ' +
                    (settings.wakeMode ? 'left-[18px]' : 'left-0.5')
                  }
                />
              </div>
            </button>
            <p className="text-[11px] text-ink-dim mt-1">
              Mudanças surtem efeito ao reiniciar o NEXUS.
            </p>
          </Group>

          <Group icon={<Globe size={14} />} title="Ambiente">
            <div className="flex gap-1.5">
              {(['LOCAL', 'STAGING', 'PROD'] as const).map((env) => (
                <button
                  key={env}
                  onClick={() => void update('environment', env)}
                  className={
                    'flex-1 h-10 rounded-lg text-sm font-medium transition-all border ' +
                    (settings.environment === env
                      ? 'bg-accent-subtle text-accent border-accent/40'
                      : 'bg-bg-elevated text-ink-muted border-line hover:border-line-strong')
                  }
                >
                  {env}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-dim mt-2">
              Reservado para variáveis {`{baseUrl}`} em rotas (próxima versão).
            </p>
          </Group>

          <Group icon={<Volume2 size={14} />} title="Engine de voz">
            <div className="flex flex-col gap-2">
              <div className="flex gap-1.5">
                {(['tiny', 'base', 'small'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => void update('whisperModel', m)}
                    className={
                      'flex-1 h-10 rounded-lg text-sm font-medium transition-all border ' +
                      (settings.whisperModel === m
                        ? 'bg-accent-subtle text-accent border-accent/40'
                        : 'bg-bg-elevated text-ink-muted border-line hover:border-line-strong')
                    }
                  >
                    {m}
                  </button>
                ))}
              </div>
              <p className="text-xs text-ink-dim">
                <strong>base</strong> é o melhor equilíbrio (140MB, ~300ms em M-series).
                Whisper precisa ser instalado separadamente — veja README.
              </p>
            </div>
          </Group>

          <Group icon={<Cpu size={14} />} title="Fallback IA">
            <button
              onClick={() => void update('aiFallbackEnabled', !settings.aiFallbackEnabled)}
              className="flex items-center justify-between p-4 rounded-lg bg-bg-elevated border border-line hover:border-line-strong transition-all"
            >
              <div className="text-left">
                <p className="text-sm font-medium text-ink">Usar Claude Haiku quando não houver match</p>
                <p className="text-xs text-ink-muted mt-0.5">
                  Custa ~$0.0001 por chamada. Sucessos viram aliases automaticamente.
                </p>
              </div>
              <div
                className={
                  'w-10 h-6 rounded-full transition-all relative ' +
                  (settings.aiFallbackEnabled ? 'bg-accent' : 'bg-bg-hover border border-line')
                }
              >
                <div
                  className={
                    'w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all ' +
                    (settings.aiFallbackEnabled ? 'left-[18px]' : 'left-0.5')
                  }
                />
              </div>
            </button>
          </Group>

          {saving && <p className="text-xs text-ink-dim text-center">Salvando…</p>}

        </div>
      </div>
    </div>
  )
}

function Group({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }): JSX.Element {
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

function BaseUrlsEditor({
  entries,
  onChange
}: {
  entries: BaseUrlEntry[]
  onChange: (next: BaseUrlEntry[]) => void
}): JSX.Element {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftUrl, setDraftUrl] = useState('')
  const [draftLabel, setDraftLabel] = useState('')
  const [adding, setAdding] = useState(false)

  function startEdit(entry: BaseUrlEntry): void {
    setEditingId(entry.id)
    setDraftUrl(entry.url)
    setDraftLabel(entry.label)
    setAdding(false)
  }

  function startAdd(): void {
    setAdding(true)
    setEditingId(null)
    setDraftUrl('')
    setDraftLabel('')
  }

  function cancel(): void {
    setEditingId(null)
    setAdding(false)
    setDraftUrl('')
    setDraftLabel('')
  }

  function commitEdit(id: string): void {
    const cleanUrl = draftUrl.trim().replace(/\/+$/, '')
    if (!cleanUrl) return
    const next = entries.map((e) =>
      e.id === id ? { ...e, url: cleanUrl, label: draftLabel.trim() || cleanUrl } : e
    )
    onChange(next)
    cancel()
  }

  function commitAdd(): void {
    const cleanUrl = draftUrl.trim().replace(/\/+$/, '')
    if (!cleanUrl) return
    const id = `url-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const next = [...entries, { id, url: cleanUrl, label: draftLabel.trim() || cleanUrl }]
    onChange(next)
    cancel()
  }

  function remove(id: string): void {
    if (entries.length <= 1) return
    onChange(entries.filter((e) => e.id !== id))
  }

  function move(id: string, direction: -1 | 1): void {
    const idx = entries.findIndex((e) => e.id === id)
    if (idx < 0) return
    const target = idx + direction
    if (target < 0 || target >= entries.length) return
    const next = [...entries]
    const [item] = next.splice(idx, 1)
    next.splice(target, 0, item)
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        {entries.map((entry, i) => {
          const isActive = i === 0
          const isEditing = editingId === entry.id
          return (
            <div
              key={entry.id}
              className={cn(
                'card p-3 flex items-center gap-3',
                isActive && 'border-accent/50 bg-accent-subtle/40'
              )}
            >
              {!isEditing && (
                <>
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => move(entry.id, -1)}
                      disabled={i === 0}
                      className="text-ink-dim hover:text-ink disabled:opacity-20 transition-colors"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      onClick={() => move(entry.id, 1)}
                      disabled={i === entries.length - 1}
                      className="text-ink-dim hover:text-ink disabled:opacity-20 transition-colors"
                    >
                      <ArrowDown size={12} />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink truncate">{entry.label}</span>
                      {isActive && (
                        <span className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-accent text-white">
                          Ativa
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-ink-dim font-mono truncate">{entry.url}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(entry)}
                      className="w-7 h-7 rounded-md text-ink-dim hover:text-ink hover:bg-bg-hover flex items-center justify-center transition-all"
                      title="Editar"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => remove(entry.id)}
                      disabled={entries.length <= 1}
                      className="w-7 h-7 rounded-md text-ink-dim hover:text-danger hover:bg-danger/10 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-dim flex items-center justify-center transition-all"
                      title="Excluir"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </>
              )}
              {isEditing && (
                <div className="flex-1 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input
                      value={draftLabel}
                      onChange={(e) => setDraftLabel(e.target.value)}
                      placeholder="Apelido (ex: Local)"
                      className="w-1/3 h-8 px-2.5 rounded-md bg-bg-elevated border border-line text-xs focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                    <input
                      value={draftUrl}
                      onChange={(e) => setDraftUrl(e.target.value)}
                      placeholder="http://localhost:3000"
                      className="flex-1 h-8 px-2.5 rounded-md bg-bg-elevated border border-line text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent/40"
                      autoFocus
                    />
                  </div>
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={cancel}
                      className="h-7 px-2.5 rounded-md text-xs text-ink-muted hover:text-ink hover:bg-bg-hover flex items-center gap-1"
                    >
                      <X size={12} /> Cancelar
                    </button>
                    <button
                      onClick={() => commitEdit(entry.id)}
                      className="h-7 px-2.5 rounded-md text-xs bg-accent text-white hover:bg-accent-hover flex items-center gap-1"
                    >
                      <Check size={12} /> Salvar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {adding && (
          <div className="card p-3 border-accent/40">
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  value={draftLabel}
                  onChange={(e) => setDraftLabel(e.target.value)}
                  placeholder="Apelido (ex: Staging)"
                  className="w-1/3 h-8 px-2.5 rounded-md bg-bg-elevated border border-line text-xs focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <input
                  value={draftUrl}
                  onChange={(e) => setDraftUrl(e.target.value)}
                  placeholder="https://staging.example.com"
                  className="flex-1 h-8 px-2.5 rounded-md bg-bg-elevated border border-line text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent/40"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-1">
                <button
                  onClick={cancel}
                  className="h-7 px-2.5 rounded-md text-xs text-ink-muted hover:text-ink hover:bg-bg-hover flex items-center gap-1"
                >
                  <X size={12} /> Cancelar
                </button>
                <button
                  onClick={commitAdd}
                  className="h-7 px-2.5 rounded-md text-xs bg-accent text-white hover:bg-accent-hover flex items-center gap-1"
                >
                  <Check size={12} /> Adicionar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {!adding && !editingId && (
        <button
          onClick={startAdd}
          className="self-start text-xs text-ink-muted hover:text-ink h-7 px-2.5 rounded-md border border-line border-dashed hover:border-line-strong flex items-center gap-1 transition-all"
        >
          <Plus size={12} /> Adicionar URL
        </button>
      )}

      <p className="text-[11px] text-ink-dim mt-1">
        A primeira URL é a <strong className="text-ink-muted">ativa</strong> — todas as rotas e templates abrem nela. Use ↑↓ para reordenar.
      </p>
    </div>
  )
}
