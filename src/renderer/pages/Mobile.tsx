import { useEffect, useState } from 'react'
import { Smartphone, Wifi, Globe, CheckCircle2, AlertCircle, Loader2, Copy, ExternalLink, Power, Zap, Network, Download } from 'lucide-react'
import QRCode from 'qrcode'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/Toast'
import type { MobileStatus } from '@shared/types'

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
  const [qrSvg, setQrSvg] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  // Load + subscribe to status updates.
  useEffect(() => {
    void api.mobileStatus().then(setStatus)
    const off = api.onMobileStatus(setStatus)
    return off
  }, [])

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

          {/*
            Tailscale Funnel is now the ONLY supported backend for Mobile.
            cloudflared quick was disposable (URL changed every session),
            ngrok's free tier dropped static domains in 2025 — both became
            useless for a "save the home-screen shortcut and use it forever"
            workflow. The UI only shows the Tailscale path.
          */}
          <TailscaleCard
            tailscale={status.tunnel.tailscale}
            activeKind={status.tunnel.kind}
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
