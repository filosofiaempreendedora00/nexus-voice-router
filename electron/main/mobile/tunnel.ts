import { spawn, ChildProcess, execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { loadSettings } from '../store/settings'

const execFileAsync = promisify(execFile)

/**
 * Tunnel manager — exposes the local HTTP server as HTTPS so iOS Safari is
 * willing to use the microphone (it refuses getUserMedia over http://lan-ip).
 *
 * Three backends, picked automatically by what's available:
 *
 * 1. **Tailscale Funnel** (preferred) — free for personal use, stable URL like
 *    `https://laptop-de-roberto.tail-xxx.ts.net` that NEVER changes. Requires
 *    Tailscale installed + signed in + Funnel feature enabled in the admin
 *    console.
 *
 * 2. **ngrok with static domain** — used when `ngrokAuthtoken` AND
 *    `ngrokStaticDomain` are both filled in Settings. Stable URL. Free tier
 *    of ngrok changed in 2025 — most new accounts no longer get a free
 *    static domain, so this path mostly serves paid users.
 *
 * 3. **cloudflared quick tunnel** (last resort) — no config needed. Produces
 *    a DISPOSABLE URL `https://random-name.trycloudflare.com` that changes
 *    every session. Fine for "try once", breaks home-screen icon on iPhone.
 */

const TAILSCALE_PATHS = [
  '/usr/local/bin/tailscale',
  '/opt/homebrew/bin/tailscale',
  '/Applications/Tailscale.app/Contents/MacOS/Tailscale'
]

const CLOUDFLARED_PATHS = [
  join(homedir(), '.nexus', 'bin', 'cloudflared'),
  '/opt/homebrew/bin/cloudflared',
  '/usr/local/bin/cloudflared'
]

const NGROK_PATHS = [
  join(homedir(), '.nexus', 'bin', 'ngrok'),
  '/opt/homebrew/bin/ngrok',
  '/usr/local/bin/ngrok'
]

type Listener = (status: TunnelStatus) => void

export type TunnelKind = 'tailscale' | 'ngrok' | 'cloudflared' | 'none'
export type TailscaleState = 'not-installed' | 'needs-login' | 'ready' | 'unknown'

export interface TunnelStatus {
  state: 'stopped' | 'starting' | 'running' | 'error'
  kind: TunnelKind
  url?: string
  error?: string
  installed: boolean
  ngrokConfigured: boolean
  tailscale: TailscaleState
}

let proc: ChildProcess | null = null
let currentKind: TunnelKind = 'none'
let currentUrl: string | undefined
let currentState: TunnelStatus['state'] = 'stopped'
let currentError: string | undefined
const listeners = new Set<Listener>()

export function onTunnelStatus(fn: Listener): () => void {
  listeners.add(fn)
  void getStatusAsync().then(fn)
  return () => listeners.delete(fn)
}

function notify(): void {
  void getStatusAsync().then((s) => {
    for (const fn of listeners) {
      try { fn(s) } catch { /* */ }
    }
  })
}

// ============== Backend discovery ==============

async function findBinary(candidates: string[], name: string): Promise<string | null> {
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  try {
    const { stdout } = await execFileAsync('which', [name])
    const path = stdout.trim()
    if (path && existsSync(path)) return path
  } catch { /* */ }
  return null
}

export async function findTailscale(): Promise<string | null> {
  return findBinary(TAILSCALE_PATHS, 'tailscale')
}
export async function findCloudflared(): Promise<string | null> {
  return findBinary(CLOUDFLARED_PATHS, 'cloudflared')
}
export async function findNgrok(): Promise<string | null> {
  return findBinary(NGROK_PATHS, 'ngrok')
}

async function tailscaleProbe(bin: string): Promise<TailscaleState> {
  try {
    const { stdout } = await execFileAsync(bin, ['status', '--json'], { timeout: 4000 })
    const data = JSON.parse(stdout)
    const backend = data?.BackendState
    if (backend === 'Running') return 'ready'
    if (backend === 'NeedsLogin' || backend === 'Stopped') return 'needs-login'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

function isNgrokConfigured(): { authtoken: string; domain: string } | null {
  const s = loadSettings()
  const t = (s.ngrokAuthtoken || '').trim()
  const d = (s.ngrokStaticDomain || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!t || !d) return null
  return { authtoken: t, domain: d }
}

/**
 * Decide which backend to use, respecting the user's `mobileTunnelPreference`
 * setting:
 *
 *   - 'tailscale': retry the Tailscale probe up to 6 times (1s apart) before
 *     giving up. Most "Tailscale not ready" failures are timing races right
 *     after the Mac wakes from sleep — retry absorbs them. NEVER silently
 *     falls back; if Tailscale truly can't come up, returns 'cloudflared'
 *     so the user at least has something working, but ideally the user
 *     should fix Tailscale.
 *
 *   - 'ngrok': use ngrok if configured + binary present; else fall through.
 *
 *   - 'cloudflared': always use the disposable cloudflared quick tunnel.
 *
 *   - 'auto' (default): prefer tailscale (with 3-attempt retry), then ngrok,
 *     then cloudflared. The retry on tailscale is what fixes the recurring
 *     "Roberto opens NEXUS right after Mac wake-up and gets cloudflared"
 *     problem.
 */
async function chooseBackend(): Promise<'tailscale' | 'ngrok' | 'cloudflared'> {
  const pref = (loadSettings().mobileTunnelPreference || 'auto') as
    'auto' | 'tailscale' | 'ngrok' | 'cloudflared'

  console.log('[tunnel] choosing backend, preference:', pref)

  const probeTailscaleWithRetry = async (attempts: number): Promise<boolean> => {
    const bin = await findTailscale()
    if (!bin) {
      console.log('[tunnel] tailscale binary not found')
      return false
    }
    for (let i = 0; i < attempts; i++) {
      const state = await tailscaleProbe(bin)
      console.log(`[tunnel] tailscale probe ${i + 1}/${attempts}: ${state}`)
      if (state === 'ready') return true
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000))
    }
    return false
  }

  if (pref === 'cloudflared') return 'cloudflared'
  if (pref === 'ngrok' && isNgrokConfigured() && (await findNgrok())) return 'ngrok'
  if (pref === 'tailscale') {
    const ok = await probeTailscaleWithRetry(6)
    if (ok) return 'tailscale'
    // NEW behavior: do NOT silently fall back. Return 'tailscale' anyway and
    // let the startTailscale() error path surface a clear message in the UI.
    // Roberto explicitly asked for this — a disposable cloudflared URL when
    // he'd configured a stable Tailscale one is worse than an error he can fix.
    console.warn('[tunnel] preference=tailscale; probe failed 6x — keeping tailscale and surfacing error')
    return 'tailscale'
  }
  // 'auto' (legacy / first-launch on fresh install before settings migrate)
  if (await probeTailscaleWithRetry(3)) return 'tailscale'
  if (isNgrokConfigured() && (await findNgrok())) return 'ngrok'
  return 'cloudflared'
}

// ============== Status ==============

export async function getStatusAsync(): Promise<TunnelStatus> {
  const tsBin = await findTailscale()
  const tailscale: TailscaleState = tsBin ? await tailscaleProbe(tsBin) : 'not-installed'

  let installed = false
  let plannedKind: TunnelKind = currentKind
  if (plannedKind === 'none' && currentState === 'stopped') {
    plannedKind = await chooseBackend()
  }
  if (plannedKind === 'tailscale') {
    installed = tailscale !== 'not-installed'
  } else if (plannedKind === 'ngrok') {
    installed = (await findNgrok()) != null
  } else {
    installed = (await findCloudflared()) != null
  }
  return {
    state: currentState,
    kind: plannedKind,
    url: currentUrl,
    error: currentError,
    installed,
    ngrokConfigured: isNgrokConfigured() != null,
    tailscale
  }
}

// ============== Start/stop ==============

export async function startTunnel(port: number): Promise<TunnelStatus> {
  if (proc) return getStatusAsync()

  const choice = await chooseBackend()
  if (choice === 'tailscale') {
    return startTailscale(port)
  }
  if (choice === 'ngrok') {
    const cfg = isNgrokConfigured()!
    return startNgrok(port, cfg.authtoken, cfg.domain)
  }
  return startCloudflared(port)
}

export function stopTunnel(): void {
  currentState = 'stopped'
  currentError = undefined
  currentUrl = undefined
  if (proc) {
    try { proc.kill('SIGTERM') } catch { /* */ }
    proc = null
  }
  // Also try to tear down any background Tailscale funnel just in case.
  void teardownTailscaleFunnel().catch(() => { /* */ })
  currentKind = 'none'
  notify()
}

async function teardownTailscaleFunnel(): Promise<void> {
  const bin = await findTailscale()
  if (!bin) return
  try {
    await execFileAsync(bin, ['funnel', 'reset'], { timeout: 5000 })
  } catch { /* harmless if no funnel was running */ }
}

// ============== Tailscale backend ==============

async function startTailscale(port: number): Promise<TunnelStatus> {
  const bin = await findTailscale()
  if (!bin) {
    currentKind = 'tailscale'
    currentState = 'error'
    currentError = 'Tailscale não instalado. Instale em tailscale.com/download/mac'
    notify()
    return getStatusAsync()
  }

  const probe = await tailscaleProbe(bin)
  if (probe === 'needs-login') {
    currentKind = 'tailscale'
    currentState = 'error'
    currentError = 'Tailscale instalado mas você não está logado. Abra o app Tailscale na barra de menu e entre com sua conta.'
    notify()
    return getStatusAsync()
  }

  currentKind = 'tailscale'
  currentState = 'starting'
  currentUrl = undefined
  currentError = undefined
  notify()

  // Reset any residual serve config from a previous run. If the last NEXUS
  // session was killed without a clean shutdown, Tailscale still has the
  // 443 listener registered — `tailscale funnel <port>` then fails with
  // "listener already exists for port 443". `funnel reset` clears it cheaply.
  try {
    await execFileAsync(bin, ['funnel', 'reset'], { timeout: 4000 })
  } catch {
    // Reset failing is fine — it just means there was nothing to reset.
  }

  // Foreground `tailscale funnel <port>` blocks and prints the URL. We keep
  // the process alive for as long as the tunnel is up; killing it tears the
  // funnel down. Output format (from Tailscale source):
  //
  //   Available on the internet:
  //
  //   https://<host>.<tailnet>.ts.net/
  //
  //   |-- proxy http://127.0.0.1:<port>
  proc = spawn(bin, ['funnel', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe']
  })

  const urlRegex = /https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.ts\.net/i
  const consume = (chunk: Buffer): void => {
    const text = chunk.toString('utf-8')
    if (!currentUrl) {
      const m = text.match(urlRegex)
      if (m) {
        currentUrl = m[0]
        currentState = 'running'
        console.log('[tunnel/tailscale] up:', currentUrl)
        notify()
      }
    }
    // Surface "Funnel not allowed" / ACL errors verbatim — Roberto needs to
    // enable Funnel in the admin console.
    const lower = text.toLowerCase()
    if (
      lower.includes('funnel') &&
      (lower.includes('not allowed') || lower.includes('not enabled') || lower.includes('disabled'))
    ) {
      currentError =
        'Funnel não habilitado na sua conta Tailscale. Abra https://login.tailscale.com/admin/settings/features e ative "Funnel".'
      currentState = 'error'
      notify()
    } else if (lower.includes('https') && lower.includes('not enabled') && lower.includes('cert')) {
      currentError =
        'HTTPS Certificates não habilitado. Vá em https://login.tailscale.com/admin/dns e ative "HTTPS Certificates".'
      currentState = 'error'
      notify()
    }
  }
  proc.stdout?.on('data', consume)
  proc.stderr?.on('data', consume)

  proc.on('exit', (code, signal) => {
    console.log('[tunnel/tailscale] exited', code, signal)
    proc = null
    if (currentState !== 'stopped') {
      currentState = 'error'
      if (!currentError) currentError = `tailscale funnel encerrou (${code ?? signal})`
    }
    currentUrl = undefined
    notify()
  })

  proc.on('error', (err) => {
    console.error('[tunnel/tailscale] error:', err)
    currentState = 'error'
    currentError = err.message
    notify()
  })

  // Wait up to 12s for the URL to appear.
  const start = Date.now()
  while (Date.now() - start < 12_000 && !currentUrl && currentState === 'starting') {
    await new Promise((r) => setTimeout(r, 200))
  }
  return getStatusAsync()
}

// ============== ngrok backend ==============

async function startNgrok(port: number, authtoken: string, domain: string): Promise<TunnelStatus> {
  const bin = await findNgrok()
  if (!bin) {
    currentKind = 'ngrok'
    currentState = 'error'
    currentError = 'ngrok não encontrado em ~/.nexus/bin. Reinstale o NEXUS.'
    notify()
    return getStatusAsync()
  }

  currentKind = 'ngrok'
  currentState = 'starting'
  currentUrl = undefined
  currentError = undefined
  notify()

  proc = spawn(
    bin,
    ['http', '--domain', domain, '--log', 'stdout', '--log-format', 'logfmt', String(port)],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NGROK_AUTHTOKEN: authtoken }
    }
  )

  const consume = (chunk: Buffer): void => {
    const text = chunk.toString('utf-8')
    if (!currentUrl) {
      const expected = `https://${domain}`
      if (text.includes('started tunnel') || text.includes(`url=${expected}`)) {
        currentUrl = expected
        currentState = 'running'
        notify()
      }
    }
    if (text.includes('lvl=error') || text.includes('ERR_NGROK')) {
      const msg = text.match(/msg="([^"]+)"/)?.[1] ?? text.trim().slice(0, 200)
      currentError = msg.replace(authtoken, '***')
      currentState = 'error'
      notify()
    }
  }
  proc.stdout?.on('data', consume)
  proc.stderr?.on('data', consume)

  proc.on('exit', (code, signal) => {
    proc = null
    if (currentState !== 'stopped') {
      currentState = 'error'
      if (!currentError) currentError = `ngrok encerrou (${code ?? signal})`
    }
    currentUrl = undefined
    notify()
  })

  proc.on('error', (err) => {
    currentState = 'error'
    currentError = err.message.replace(authtoken, '***')
    notify()
  })

  const start = Date.now()
  while (Date.now() - start < 10_000 && !currentUrl && currentState === 'starting') {
    await new Promise((r) => setTimeout(r, 200))
  }
  return getStatusAsync()
}

// ============== Cloudflared (quick) backend ==============

async function startCloudflared(port: number): Promise<TunnelStatus> {
  const bin = await findCloudflared()
  if (!bin) {
    currentKind = 'cloudflared'
    currentState = 'error'
    currentError = 'cloudflared não encontrado. Reinstale o NEXUS.'
    notify()
    return getStatusAsync()
  }

  currentKind = 'cloudflared'
  currentState = 'starting'
  currentUrl = undefined
  currentError = undefined
  notify()

  proc = spawn(bin, ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate'], {
    stdio: ['ignore', 'pipe', 'pipe']
  })

  const urlRegex = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i
  const consume = (chunk: Buffer): void => {
    const text = chunk.toString('utf-8')
    if (!currentUrl) {
      const m = text.match(urlRegex)
      if (m) {
        currentUrl = m[0]
        currentState = 'running'
        notify()
      }
    }
  }
  proc.stdout?.on('data', consume)
  proc.stderr?.on('data', consume)

  proc.on('exit', (code, signal) => {
    proc = null
    if (currentState !== 'stopped') {
      currentState = 'error'
      currentError = `cloudflared encerrou (${code ?? signal})`
    }
    currentUrl = undefined
    notify()
  })

  proc.on('error', (err) => {
    currentState = 'error'
    currentError = err.message
    notify()
  })

  const start = Date.now()
  while (Date.now() - start < 12_000 && !currentUrl && currentState === 'starting') {
    await new Promise((r) => setTimeout(r, 200))
  }
  return getStatusAsync()
}
