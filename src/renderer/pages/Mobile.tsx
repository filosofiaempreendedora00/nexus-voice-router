import { useEffect, useState } from 'react'
import { Smartphone, Wifi, Globe, CheckCircle2, AlertCircle, Loader2, Copy, ExternalLink, Power, Anchor, Zap, Network, Download } from 'lucide-react'
import QRCode from 'qrcode'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/Toast'
import type { MobileStatus, Settings } from '@shared/types'

/**
 * Mobile companion page.
 *
 * Flow:
 *   1. User toggles the switch ON → main process starts HTTP server + spawns
 *      cloudflared. The server URL becomes available on LAN immediately; the
 *      tunnel URL appears ~3-8s later.
 *   2. Once the tunnel URL is up, the QR code is rendered. User points iPhone
 *      camera at it, opens the link in Safari, grants mic permission once.
 *   3. The phone shows the same wake-state HUD the Mac shows in the corner.
 *      Whatever phone hears flows through the same wake-service → Whisper →
 *      classifier → agent pipeline. No duplicate logic.
 */
export function Mobile(): JSX.Element {
  const [status, setStatus] = useState<MobileStatus | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [qrSvg, setQrSvg] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [authtokenDraft, setAuthtokenDraft] = useState('')
  const [domainDraft, setDomainDraft] = useState('')
  const toast = useToast()

  // Load + subscribe to status updates.
  useEffect(() => {
    void api.mobileStatus().then(setStatus)
    void api.getSettings().then((s) => {
      setSettings(s)
      setAuthtokenDraft(s.ngrokAuthtoken ?? '')
      setDomainDraft(s.ngrokStaticDomain ?? '')
    })
    const off = api.onMobileStatus(setStatus)
    return off
  }, [])

  async function saveNgrokConfig(): Promise<void> {
    const next = await api.saveSettings({
      ngrokAuthtoken: authtokenDraft.trim(),
      ngrokStaticDomain: domainDraft.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    })
    setSettings(next)
    toast.show('success', 'Config ngrok salva — desliga e religa o acesso pra aplicar')
    void api.mobileStatus().then(setStatus)
  }

  // Regenerate QR whenever the URL changes.
  useEffect(() => {
    const url = preferredUrl(status)
    if (!url) { setQrSvg(''); return }
    QRCode.toString(url, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      color: { dark: '#F5F5F7', light: '#0A0A0B' },
      width: 240
    }).then(setQrSvg).catch(() => setQrSvg(''))
  }, [status])

  async function toggle(): Promise<void> {
    if (!status || busy) return
    setBusy(true)
    try {
      const next = status.enabled
        ? await api.mobileDisable()
        : await api.mobileEnable()
      setStatus(next)
    } catch (err) {
      toast.show('error', String(err))
    } finally {
      setBusy(false)
    }
  }

  function copyUrl(url: string): void {
    void navigator.clipboard.writeText(url)
    toast.show('success', 'URL copiada')
  }

  if (!status) {
    return <div className="p-6 text-ink-muted text-sm">Carregando…</div>
  }

  const url = preferredUrl(status)

  return (
    <div className="flex flex-col h-full">
      <header className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-line flex-shrink-0">
        <h1 className="text-lg font-semibold text-ink flex items-center gap-2">
          <Smartphone size={18} className="text-accent" />
          Mobile
        </h1>
        <p className="text-xs text-ink-muted">
          Use seu celular como microfone remoto. O Mac continua sendo o cérebro.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto scroll-area">
        <div className="max-w-3xl mx-auto p-4 sm:p-6 flex flex-col gap-6">

          {/* Power toggle card */}
          <section className="card p-4 sm:p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                  status.enabled
                    ? 'bg-success/15 border border-success/40 text-success'
                    : 'bg-bg-hover border border-line text-ink-dim'
                )}
              >
                <Power size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {status.enabled ? 'Acesso pelo celular ativo' : 'Acesso pelo celular desligado'}
                </p>
                <p className="text-xs text-ink-muted truncate">
                  {status.enabled
                    ? status.connectedClients > 0
                      ? `${status.connectedClients} celular${status.connectedClients !== 1 ? 'es' : ''} conectado${status.connectedClients !== 1 ? 's' : ''}`
                      : 'Aguardando celular conectar'
                    : 'Liga pra gerar o link e o QR Code'}
                </p>
              </div>
            </div>
            <button
              onClick={() => void toggle()}
              disabled={busy}
              className={cn(
                'h-10 px-4 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 flex-shrink-0',
                status.enabled
                  ? 'bg-bg-elevated text-ink border border-line hover:bg-bg-hover'
                  : 'bg-accent text-white hover:bg-accent-hover',
                busy && 'opacity-60 cursor-wait'
              )}
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {status.enabled ? 'Desligar' : 'Ligar'}
            </button>
          </section>

          {/* Backend preference — force Tailscale or auto-pick */}
          <TunnelPreferenceCard
            current={settings?.mobileTunnelPreference ?? 'auto'}
            onChange={async (pref) => {
              const next = await api.saveSettings({ mobileTunnelPreference: pref })
              setSettings(next)
              toast.show('success', 'Preferência salva — desliga e religa pra aplicar')
            }}
            activeKind={status.tunnel.kind}
          />

          {/* Tailscale Funnel — the preferred stable-URL path. */}
          <TailscaleCard
            tailscale={status.tunnel.tailscale}
            activeKind={status.tunnel.kind}
          />

          {/* ngrok config — drives URL stability across restarts */}
          <NgrokConfig
            currentToken={settings?.ngrokAuthtoken ?? ''}
            currentDomain={settings?.ngrokStaticDomain ?? ''}
            tokenDraft={authtokenDraft}
            setTokenDraft={setAuthtokenDraft}
            domainDraft={domainDraft}
            setDomainDraft={setDomainDraft}
            onSave={() => void saveNgrokConfig()}
            activeKind={status.tunnel.kind}
            ngrokConfigured={status.tunnel.ngrokConfigured}
          />

          {/* Backend missing warning */}
          {!status.tunnel.installed && (
            <div className="card p-4 border-warning/40 bg-warning/5 flex gap-3">
              <AlertCircle size={18} className="text-warning flex-shrink-0 mt-0.5" />
              <div className="flex flex-col gap-2 min-w-0">
                <p className="text-sm font-medium text-ink">
                  {status.tunnel.kind === 'ngrok' ? 'ngrok não encontrado' : 'cloudflared não encontrado'}
                </p>
                <p className="text-xs text-ink-muted">
                  O binário deveria estar em <span className="font-mono">~/.nexus/bin/</span>.
                  Reinstale o NEXUS — ele baixa automaticamente.
                </p>
              </div>
            </div>
          )}

          {/* Active status — URL + QR */}
          {status.enabled && (
            <>
              <section className="card p-4 sm:p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h2 className="text-xs uppercase tracking-wider font-semibold text-ink-muted flex items-center gap-1.5">
                    <Globe size={12} />
                    Endereço do celular
                  </h2>
                  <div className="flex items-center gap-1.5">
                    {status.tunnel.kind !== 'none' && (
                      <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded-md border border-line bg-bg-elevated text-ink-muted flex items-center gap-1">
                        {status.tunnel.kind === 'tailscale'
                          ? <><Network size={10}/> tailscale</>
                          : status.tunnel.kind === 'ngrok'
                            ? <><Anchor size={10}/> ngrok</>
                            : <><Zap size={10}/> quick</>}
                      </span>
                    )}
                    <TunnelBadge state={status.tunnel.state} />
                  </div>
                </div>

                {status.tunnel.state === 'starting' && !status.tunnel.url && (
                  <div className="flex items-center gap-2 text-sm text-ink-muted py-4">
                    <Loader2 size={14} className="animate-spin" />
                    Negociando túnel HTTPS… (~5s)
                  </div>
                )}

                {status.tunnel.error && (
                  <div className="text-sm text-danger flex items-start gap-2">
                    <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                    <span>{status.tunnel.error}</span>
                  </div>
                )}

                {url && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-bg-subtle border border-line">
                      <span className="text-xs font-mono text-ink truncate flex-1 select-text">{url}</span>
                      <button
                        onClick={() => copyUrl(url)}
                        title="Copiar"
                        className="w-7 h-7 rounded-md text-ink-dim hover:text-ink hover:bg-bg-hover flex items-center justify-center flex-shrink-0"
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        onClick={() => window.open(url, '_blank')}
                        title="Abrir aqui (teste)"
                        className="w-7 h-7 rounded-md text-ink-dim hover:text-ink hover:bg-bg-hover flex items-center justify-center flex-shrink-0"
                      >
                        <ExternalLink size={13} />
                      </button>
                    </div>

                    {qrSvg && (
                      <div className="flex flex-col items-center gap-3">
                        <div
                          className="bg-bg p-3 rounded-xl border border-line"
                          dangerouslySetInnerHTML={{ __html: qrSvg }}
                        />
                        <p className="text-[11px] text-ink-dim text-center">
                          Aponta a câmera do iPhone pra esse QR Code. <br className="hidden sm:block" />
                          Toca no link que aparecer e libera o microfone.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {status.lanUrl && status.tunnel.state !== 'running' && (
                  <div className="flex flex-col gap-1 pt-3 border-t border-line">
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-dim flex items-center gap-1">
                      <Wifi size={11} />
                      Fallback Wi-Fi local
                    </p>
                    <div className="flex items-center gap-2 text-xs font-mono text-ink-muted">
                      <span className="flex-1 select-text truncate">{status.lanUrl}</span>
                      <button onClick={() => copyUrl(status.lanUrl!)} className="text-ink-dim hover:text-ink p-1" title="Copiar">
                        <Copy size={11} />
                      </button>
                    </div>
                    <p className="text-[10px] text-ink-dim">
                      iOS Safari não libera microfone via IP local — esse URL funciona em Android ou pra testar no Mac.
                    </p>
                  </div>
                )}
              </section>

              {/* Connection feedback */}
              <section className="card p-4 flex items-center gap-3">
                <CheckCircle2
                  size={16}
                  className={status.connectedClients > 0 ? 'text-success' : 'text-ink-dim'}
                />
                <div className="flex-1">
                  <p className="text-sm text-ink">
                    {status.connectedClients > 0
                      ? `${status.connectedClients} dispositivo${status.connectedClients !== 1 ? 's' : ''} conectado${status.connectedClients !== 1 ? 's' : ''}`
                      : 'Nenhum dispositivo conectado ainda'}
                  </p>
                  <p className="text-[11px] text-ink-dim">
                    Quando o celular conectar, a contagem sobe e tudo que ele ouvir vira input do NEXUS.
                  </p>
                </div>
              </section>
            </>
          )}

          {/* How it works */}
          <section className="card p-4 sm:p-5 flex flex-col gap-3">
            <h2 className="text-xs uppercase tracking-wider font-semibold text-ink-muted">
              Como funciona
            </h2>
            <ol className="flex flex-col gap-2 text-xs text-ink-muted">
              <Step n={1}>Liga o acesso aqui no Mac. NEXUS abre um servidor local e (via Cloudflare) um link HTTPS público.</Step>
              <Step n={2}>Aponta a câmera do celular pro QR Code. Toca no link.</Step>
              <Step n={3}>No celular, toca <strong className="text-ink">"Ativar mic"</strong> e libera o microfone uma vez.</Step>
              <Step n={4}>Fala normalmente. O áudio sai do celular, chega no Mac e roda na mesma pipeline (Whisper, agentes, etc.). Você vê a bolinha mudar de estado tanto no Mac quanto no celular.</Step>
              <Step n={5}>(Opcional) No iPhone, "Compartilhar → Adicionar à Tela de Início" pra virar um ícone na home.</Step>
            </ol>
          </section>

          <p className="text-[10px] text-ink-dim text-center">
            O Mac precisa estar ligado e com o NEXUS aberto. O Cloudflare faz só o transporte — o áudio é processado todo localmente no seu Mac.
          </p>
        </div>
      </div>
    </div>
  )
}

function preferredUrl(s: MobileStatus | null): string | null {
  if (!s || !s.enabled) return null
  if (s.tunnel.url) return s.tunnel.url
  return s.lanUrl
}

/**
 * Backend preference card — locks Roberto in on a specific tunnel choice so
 * timing races between "Mac just woke up" and "Tailscale daemon ready" stop
 * silently falling back to cloudflared. When "Forçar Tailscale" is picked,
 * the tunnel manager retries the Tailscale probe up to 6 times before
 * giving up.
 */
function TunnelPreferenceCard({
  current,
  onChange,
  activeKind
}: {
  current: 'auto' | 'tailscale' | 'cloudflared' | 'ngrok'
  onChange: (pref: 'auto' | 'tailscale' | 'cloudflared' | 'ngrok') => void
  activeKind: MobileStatus['tunnel']['kind']
}): JSX.Element {
  const options: { value: typeof current; label: string; hint: string }[] = [
    {
      value: 'auto',
      label: 'Auto',
      hint: 'Tenta Tailscale, depois ngrok, depois cloudflared. Retry curto.'
    },
    {
      value: 'tailscale',
      label: 'Forçar Tailscale',
      hint: 'URL fixa pra sempre. Retry agressivo (6 tentativas em 6s).'
    },
    {
      value: 'cloudflared',
      label: 'Cloudflared (URL descartável)',
      hint: 'URL muda toda sessão. Funciona sem setup nenhum.'
    }
  ]

  return (
    <section className="card p-4 sm:p-5 flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-ink">Preferência de backend</h2>
        <p className="text-xs text-ink-muted">
          Qual túnel o NEXUS deve usar quando você liga o Mobile.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {options.map((opt) => {
          const isSelected = current === opt.value
          const isLive = activeKind === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => !isSelected && onChange(opt.value)}
              className={cn(
                'text-left p-3 rounded-lg border transition-all',
                isSelected
                  ? 'border-accent/50 bg-accent-subtle/40'
                  : 'border-line bg-bg-elevated hover:bg-bg-hover hover:border-line-strong'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn('text-sm font-medium', isSelected ? 'text-ink' : 'text-ink-muted')}>
                  {opt.label}
                </span>
                <div className="flex items-center gap-1.5">
                  {isLive && (
                    <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-success/15 text-success">
                      Em uso
                    </span>
                  )}
                  {isSelected && !isLive && (
                    <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-accent-subtle text-accent">
                      Selecionado
                    </span>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-ink-dim mt-0.5">{opt.hint}</p>
            </button>
          )
        })}
      </div>
      <p className="text-[10px] text-ink-dim leading-relaxed">
        Mudança aplica na próxima vez que você ligar o Mobile (Desligar → Ligar).
      </p>
    </section>
  )
}

/**
 * Tailscale Funnel walkthrough. Detects what stage the user is at
 * (binary missing → not logged in → ready → running) and shows ONLY the
 * relevant next-step. The goal is "minimum cognitive load to ship" — Roberto
 * doesn't see options he can't act on.
 */
function TailscaleCard({
  tailscale,
  activeKind
}: {
  tailscale: MobileStatus['tunnel']['tailscale']
  activeKind: MobileStatus['tunnel']['kind']
}): JSX.Element {
  const isRunning = activeKind === 'tailscale'
  const isReady = tailscale === 'ready'

  return (
    <section className="card p-4 sm:p-5 flex flex-col gap-4 border-success/40 bg-success/5">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
            isRunning
              ? 'bg-success/15 border border-success/40 text-success'
              : isReady
                ? 'bg-accent/15 border border-accent/40 text-accent'
                : 'bg-bg-hover border border-line text-ink-dim'
          )}
        >
          <Network size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2 flex-wrap">
            URL fixa via Tailscale Funnel
            <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-success/15 text-success">
              Recomendado
            </span>
            {isRunning && (
              <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-success text-white">
                Em uso
              </span>
            )}
            {isReady && !isRunning && (
              <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-accent-subtle text-accent">
                Pronto
              </span>
            )}
          </h2>
          <p className="text-xs text-ink-muted">
            Gratuito pra uso pessoal. URL estável tipo <span className="font-mono">https://mac-roberto.tail-xxx.ts.net</span>.
            Sobrevive a qualquer reinício do Mac, do app, ou troca de rede.
          </p>
        </div>
      </div>

      {tailscale === 'not-installed' && (
        <TailscaleStep n={1} title="Instale o Tailscale no Mac">
          <p>
            Tailscale é uma rede privada simples — funciona como o iCloud da Apple, mas pra rede.
            Free pra uso pessoal.
          </p>
          <a
            href="https://tailscale.com/download/mac"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 mt-1 h-9 px-3 rounded-md bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-all w-fit"
          >
            <Download size={12} />
            Baixar Tailscale.app
            <ExternalLink size={11} />
          </a>
          <p className="text-[11px] text-ink-dim mt-1">
            Depois de baixar: arraste pra pasta Aplicativos, abra, e entre com sua conta (pode usar Google, Apple ou email).
          </p>
        </TailscaleStep>
      )}

      {tailscale === 'needs-login' && (
        <TailscaleStep n={2} title="Faça login no Tailscale">
          <p>
            O Tailscale está instalado mas você não entrou ainda. Procure o ícone do Tailscale na <strong>barra de menu</strong> (canto superior direito da tela, perto do relógio) e clique em <strong>"Log in…"</strong>.
          </p>
          <p className="text-[11px] text-ink-dim">
            Pode entrar com Google, Apple, Microsoft, GitHub ou email — qualquer um funciona.
            É grátis e não pede cartão.
          </p>
        </TailscaleStep>
      )}

      {tailscale === 'ready' && !isRunning && (
        <TailscaleStep n={3} title="Habilite Funnel na sua conta (1x)">
          <p>
            Tailscale está logado. Falta só liberar o "Funnel" — o feature que expõe seu Mac na internet com HTTPS.
          </p>
          <p className="font-medium text-ink">Em 2 abas:</p>
          <ol className="flex flex-col gap-1 pl-1 text-[11px] text-ink-muted">
            <li>
              <a
                href="https://login.tailscale.com/admin/dns"
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline inline-flex items-center gap-1"
              >
                login.tailscale.com/admin/dns
                <ExternalLink size={10} />
              </a>
              {' '}→ rola até <strong>"HTTPS Certificates"</strong> → <strong>Enable</strong>
            </li>
            <li>
              <a
                href="https://login.tailscale.com/admin/settings/features"
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline inline-flex items-center gap-1"
              >
                login.tailscale.com/admin/settings/features
                <ExternalLink size={10} />
              </a>
              {' '}→ procura por <strong>"Funnel"</strong> → ativa
            </li>
          </ol>
          <p className="text-[11px] text-ink-dim mt-1">
            Depois clica em <strong>"Desligar"</strong> e <strong>"Ligar"</strong> no card de cima — o NEXUS vai pegar o túnel Tailscale automaticamente.
          </p>
        </TailscaleStep>
      )}

      {isRunning && (
        <div className="flex items-start gap-2 text-xs text-success">
          <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
          <p className="text-ink-muted">
            Tudo conectado. Seu URL é fixo — adiciona à tela de início do iPhone e usa pra sempre.
          </p>
        </div>
      )}
    </section>
  )
}

function TailscaleStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex gap-3 text-xs text-ink-muted">
      <div className="w-6 h-6 rounded-md bg-accent text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
        {n}
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-ink">{title}</p>
        {children}
      </div>
    </div>
  )
}

function TunnelBadge({ state }: { state: MobileStatus['tunnel']['state'] }): JSX.Element {
  const cfg =
    state === 'running' ? { label: 'túnel ativo', cls: 'text-success border-success/40 bg-success/10' }
    : state === 'starting' ? { label: 'iniciando…', cls: 'text-warning border-warning/40 bg-warning/10' }
    : state === 'error' ? { label: 'falhou', cls: 'text-danger border-danger/40 bg-danger/10' }
    : { label: 'parado', cls: 'text-ink-dim border-line bg-bg-elevated' }
  return (
    <span className={cn('text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded-md border', cfg.cls)}>
      {cfg.label}
    </span>
  )
}

/**
 * Setup section for ngrok-backed stable URLs. When both authtoken AND static
 * domain are filled and saved, the tunnel manager swaps from cloudflared
 * quick-tunnel (disposable URLs) to ngrok (one URL forever — survives reboots,
 * survives NEXUS restarts, the iPhone home-screen shortcut keeps working).
 */
function NgrokConfig({
  currentToken,
  currentDomain,
  tokenDraft,
  setTokenDraft,
  domainDraft,
  setDomainDraft,
  onSave,
  activeKind,
  ngrokConfigured
}: {
  currentToken: string
  currentDomain: string
  tokenDraft: string
  setTokenDraft: (v: string) => void
  domainDraft: string
  setDomainDraft: (v: string) => void
  onSave: () => void
  activeKind: MobileStatus['tunnel']['kind']
  ngrokConfigured: boolean
}): JSX.Element {
  const isDirty = tokenDraft !== currentToken || domainDraft !== currentDomain
  const isCurrentlyUsing = activeKind === 'ngrok'

  return (
    <section className="card p-4 sm:p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
              ngrokConfigured ? 'bg-accent/15 text-accent border border-accent/40' : 'bg-bg-hover text-ink-dim border border-line'
            )}
          >
            <Anchor size={16} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
              URL fixa via ngrok
              {ngrokConfigured && (
                <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-accent-subtle text-accent">
                  Configurado
                </span>
              )}
            </h2>
            <p className="text-xs text-ink-muted">
              {isCurrentlyUsing
                ? '✓ Ativo. Seu URL é estável a cada reinício.'
                : ngrokConfigured
                  ? 'Configurado, mas o túnel atual ainda é o quick (cloudflared). Reinicie o acesso pra trocar.'
                  : 'Sem isso, cada sessão gera um URL novo e descartável. O atalho do iPhone quebra.'}
            </p>
          </div>
        </div>
      </div>

      {!ngrokConfigured && (
        <div className="text-xs text-ink-muted flex flex-col gap-2 bg-bg-subtle/40 rounded-md p-3 border border-line">
          <p className="font-medium text-ink">Setup ngrok em 3 passos (~5 min, 1x só):</p>
          <ol className="flex flex-col gap-1.5 pl-1">
            <li className="flex gap-2">
              <span className="text-ink-dim">1.</span>
              <span>
                Crie uma conta grátis em{' '}
                <a
                  href="https://dashboard.ngrok.com/signup"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline inline-flex items-center gap-0.5"
                >
                  dashboard.ngrok.com/signup
                  <ExternalLink size={10} />
                </a>{' '}
                (email é o suficiente)
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-ink-dim">2.</span>
              <span>
                Copie seu authtoken em{' '}
                <a
                  href="https://dashboard.ngrok.com/get-started/your-authtoken"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline inline-flex items-center gap-0.5"
                >
                  Your Authtoken
                  <ExternalLink size={10} />
                </a>{' '}
                e cole abaixo
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-ink-dim">3.</span>
              <span>
                Reivindique seu domínio grátis em{' '}
                <a
                  href="https://dashboard.ngrok.com/domains"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline inline-flex items-center gap-0.5"
                >
                  Domains
                  <ExternalLink size={10} />
                </a>{' '}
                (botão "+ New Domain"), pode pegar algo tipo <span className="font-mono">nexus-roberto.ngrok-free.app</span>
              </span>
            </li>
          </ol>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wider font-semibold text-ink-muted">
            Authtoken
          </label>
          <input
            type="password"
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
            placeholder="2abc..."
            autoComplete="off"
            spellCheck={false}
            className="h-10 px-3 rounded-lg bg-bg-elevated border border-line text-sm text-ink placeholder:text-ink-dim font-mono focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wider font-semibold text-ink-muted">
            Domínio estático
          </label>
          <input
            value={domainDraft}
            onChange={(e) => setDomainDraft(e.target.value)}
            placeholder="nexus-roberto.ngrok-free.app"
            autoComplete="off"
            spellCheck={false}
            className="h-10 px-3 rounded-lg bg-bg-elevated border border-line text-sm text-ink placeholder:text-ink-dim font-mono focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <p className="text-[11px] text-ink-dim">
            Sem o "https://" — só o subdomínio. Ex: <span className="font-mono">nexus-roberto.ngrok-free.app</span>
          </p>
        </div>

        <div className="flex items-center gap-2 self-end">
          {isDirty && (
            <span className="text-[11px] text-warning">não salvo</span>
          )}
          <button
            onClick={onSave}
            disabled={!isDirty}
            className={cn(
              'h-9 px-4 rounded-lg text-sm font-medium transition-all',
              isDirty
                ? 'bg-accent text-white hover:bg-accent-hover'
                : 'bg-bg-elevated text-ink-dim border border-line cursor-not-allowed'
            )}
          >
            Salvar config
          </button>
        </div>
      </div>
    </section>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }): JSX.Element {
  return (
    <li className="flex gap-2 items-start">
      <span className="w-5 h-5 rounded-md bg-bg-elevated border border-line text-[10px] font-semibold text-ink flex items-center justify-center flex-shrink-0">
        {n}
      </span>
      <span className="leading-relaxed text-ink-muted">{children}</span>
    </li>
  )
}
