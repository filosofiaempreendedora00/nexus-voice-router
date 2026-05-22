import { useEffect, useState } from 'react'
import { Save, Mic, Globe, Cpu, Volume2, Radio } from 'lucide-react'
import type { Settings as SettingsType } from '@shared/types'
import { api } from '@/lib/api'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { useToast } from '@/components/Toast'

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
      <header className="p-6 border-b border-line">
        <h1 className="text-lg font-semibold text-ink">Configurações</h1>
        <p className="text-xs text-ink-muted">Atalho, voz e comportamento</p>
      </header>
      <div className="flex-1 overflow-y-auto scroll-area">
        <div className="max-w-2xl mx-auto p-8 flex flex-col gap-8">

          <Group icon={<Mic size={14} />} title="Atalho de fala">
            <Input
              label="Combinação"
              value={settings.hotkey}
              onChange={(e) => setSettings({ ...settings, hotkey: e.target.value })}
              onBlur={(e) => void update('hotkey', e.target.value)}
              hint='Formato Electron. Ex: "CommandOrControl+Shift+Space"'
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
