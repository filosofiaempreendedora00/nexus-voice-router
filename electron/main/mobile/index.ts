import { EventEmitter } from 'events'
import {
  startServer,
  stopServer,
  isRunning,
  onConnectionChange,
  clientCount
} from './server'
import {
  startTunnel,
  stopTunnel,
  onTunnelStatus,
  getStatusAsync as getTunnelStatusAsync,
  TunnelStatus
} from './tunnel'
import { bindMobileAudioBridge, unbindMobileAudioBridge } from './audio-bridge'
import { findLanIp } from './ip'
import { loadSettings, saveSettings } from '../store/settings'

/**
 * Single entrypoint for the Mobile feature. The UI (Mac renderer) just calls
 * `enable()` / `disable()` and subscribes to status updates — everything
 * else is hidden behind here.
 *
 * `enable()`:
 *   1. Starts the HTTP/WS server (LAN URL becomes usable immediately)
 *   2. Wires the WS → wake-service bridge
 *   3. Spawns cloudflared so iOS can connect (HTTPS required for mic)
 *
 * `disable()` reverses all three.
 *
 * The status object includes BOTH the LAN URL (for Android Chrome or jail-
 * broken iOS or testing on the Mac itself) and the public tunnel URL.
 */
export interface MobileStatus {
  enabled: boolean
  port: number
  lanUrl: string | null
  tunnel: TunnelStatus
  connectedClients: number
}

const PORT_FALLBACK = 47823

class MobileService extends EventEmitter {
  private enabled = false
  private lastTunnel: TunnelStatus = {
    state: 'stopped',
    kind: 'none',
    installed: false,
    ngrokConfigured: false,
    tailscale: 'unknown'
  }
  private connected = 0

  constructor() {
    super()
    onTunnelStatus((s) => {
      this.lastTunnel = s
      this.emitStatus()
    })
    onConnectionChange((n) => {
      this.connected = n
      this.emitStatus()
    })
  }

  async enable(opts?: { persist?: boolean }): Promise<MobileStatus> {
    if (this.enabled) return this.status()
    startServer()
    bindMobileAudioBridge()
    this.enabled = true
    // Remember this choice so the next NEXUS launch auto-re-enables Mobile.
    // The iPhone home-screen shortcut keeps working through app restarts.
    if (opts?.persist !== false) saveSettings({ mobileEnabled: true })
    this.emitStatus()
    // Fire-and-forget the tunnel — UI will receive an update via onTunnelStatus.
    void startTunnel(PORT_FALLBACK).catch((err) => {
      console.error('[mobile] tunnel failed:', err)
    })
    return this.status()
  }

  disable(opts?: { persist?: boolean }): MobileStatus {
    if (!this.enabled) return this.status()
    stopTunnel()
    unbindMobileAudioBridge()
    stopServer()
    this.enabled = false
    if (opts?.persist !== false) saveSettings({ mobileEnabled: false })
    this.emitStatus()
    return this.status()
  }

  /**
   * Called once on app boot. Honors the saved `mobileEnabled` flag and
   * auto-re-enables Mobile if it was on in the previous session. Roberto
   * gets the stable URL working again without having to find and click
   * the "Ligar" button after every NEXUS restart.
   */
  async maybeAutoStart(): Promise<void> {
    const s = loadSettings()
    if (s.mobileEnabled) {
      console.log('[mobile] auto-restarting (was enabled last session)')
      await this.enable({ persist: false })
    }
  }

  status(): MobileStatus {
    const lan = findLanIp()
    const lanUrl = isRunning() && lan !== '127.0.0.1' ? `http://${lan}:${PORT_FALLBACK}` : null
    return {
      enabled: this.enabled,
      port: PORT_FALLBACK,
      lanUrl,
      tunnel: this.lastTunnel,
      connectedClients: this.connected
    }
  }

  /**
   * Async status that refreshes the installed flag for cloudflared. The
   * Mobile page calls this on mount so it can show "cloudflared não
   * instalado — rode: brew install cloudflared" before the user tries.
   */
  async statusAsync(): Promise<MobileStatus> {
    const base = this.status()
    const tunnel = await getTunnelStatusAsync()
    // Merge: prefer the live `state`/`url`/`error` we've seen on the running
    // process, but always take `installed` and `ngrokConfigured` from the
    // fresh async lookup (those reflect filesystem and settings, not state).
    return {
      ...base,
      tunnel: {
        state: base.tunnel.state !== 'stopped' ? base.tunnel.state : tunnel.state,
        kind: base.tunnel.kind !== 'none' ? base.tunnel.kind : tunnel.kind,
        url: base.tunnel.url ?? tunnel.url,
        error: base.tunnel.error ?? tunnel.error,
        installed: tunnel.installed,
        ngrokConfigured: tunnel.ngrokConfigured,
        tailscale: tunnel.tailscale
      }
    }
  }

  private emitStatus(): void {
    this.emit('status', this.status())
  }
}

export const mobileService = new MobileService()
export { clientCount }
