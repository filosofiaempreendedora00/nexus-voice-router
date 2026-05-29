import { networkInterfaces } from 'os'

/**
 * Best-guess of the Mac's LAN IPv4 address so we can show a usable URL even
 * before the cloudflared tunnel comes up. Returns "127.0.0.1" as a safe
 * fallback — calling code should treat that as "tunnel-only, no LAN URL".
 *
 * Picks the first non-internal IPv4 from a "real" interface (en0/en1/Wi-Fi)
 * over generic ones like utun/awdl/bridge — those are usually VPN/tunneling
 * pseudo-interfaces that wouldn't be reachable from a phone on the same Wi-Fi.
 */
export function findLanIp(): string {
  const all = networkInterfaces()
  const preferred: string[] = []
  const fallback: string[] = []
  for (const [name, addrs] of Object.entries(all)) {
    if (!addrs) continue
    const isReal = /^(en|wlan|eth|wlp|enp)/.test(name) || name === 'Wi-Fi'
    for (const a of addrs) {
      if (a.family !== 'IPv4' || a.internal) continue
      if (isReal) preferred.push(a.address)
      else fallback.push(a.address)
    }
  }
  return preferred[0] ?? fallback[0] ?? '127.0.0.1'
}
