import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import { WebSocketServer, WebSocket } from 'ws'

// Bundle the PWA assets as strings at build time. Vite's `?raw` suffix returns
// the file's contents verbatim, so the static site travels inside the main
// process bundle — no extra files to ship, no asar gymnastics.
import indexHtml from './static/index.html?raw'
import appJs from './static/app.js?raw'
import styleCss from './static/style.css?raw'
import manifestJson from './static/manifest.json?raw'
import { ICON_PNG_BASE64 } from './static/icon-png'

const PORT = 47823

interface StaticFile {
  body: string | Buffer
  contentType: string
}

// Decode the icon once at module init so each request is a cheap reference,
// not a base64 decode.
const ICON_PNG_BUFFER = Buffer.from(ICON_PNG_BASE64, 'base64')

const STATIC_ROUTES: Record<string, StaticFile> = {
  '/': { body: indexHtml, contentType: 'text/html; charset=utf-8' },
  '/index.html': { body: indexHtml, contentType: 'text/html; charset=utf-8' },
  '/app.js': { body: appJs, contentType: 'text/javascript; charset=utf-8' },
  '/style.css': { body: styleCss, contentType: 'text/css; charset=utf-8' },
  '/manifest.json': { body: manifestJson, contentType: 'application/json; charset=utf-8' },
  '/icon.png': { body: ICON_PNG_BUFFER, contentType: 'image/png' },
  '/icon-180.png': { body: ICON_PNG_BUFFER, contentType: 'image/png' },
  '/icon-512.png': { body: ICON_PNG_BUFFER, contentType: 'image/png' }
}

// ============== Connection registry ==============

export interface MobileClient {
  id: string
  ws: WebSocket
  /** Hello payload — what kind of client this is (PWA, debug, etc.). */
  meta: { client?: string }
  connectedAt: number
}

const clients = new Map<string, MobileClient>()
let connectionSeq = 0

// Per-event listener registries — kept tiny instead of pulling EventEmitter
// types through the rest of the module. Order is insertion order; iteration
// is synchronous.
type AudioListener = (audioBase64: string) => void
type VoiceListener = (kind: 'start' | 'end') => void
type ConnectListener = (count: number) => void

const audioListeners = new Set<AudioListener>()
const voiceListeners = new Set<VoiceListener>()
const connectListeners = new Set<ConnectListener>()

export function onAudio(fn: AudioListener): () => void {
  audioListeners.add(fn)
  return () => audioListeners.delete(fn)
}
export function onVoiceEvent(fn: VoiceListener): () => void {
  voiceListeners.add(fn)
  return () => voiceListeners.delete(fn)
}
export function onConnectionChange(fn: ConnectListener): () => void {
  connectListeners.add(fn)
  return () => connectListeners.delete(fn)
}

export function clientCount(): number {
  return clients.size
}

/**
 * Send a JSON payload to every connected mobile client. Used to push wake
 * status and agent replies from the Mac out to the phone UI.
 */
export function broadcast(payload: object): void {
  const raw = JSON.stringify(payload)
  for (const c of clients.values()) {
    if (c.ws.readyState === WebSocket.OPEN) {
      try { c.ws.send(raw) } catch { /* swallow */ }
    }
  }
}

// ============== Server lifecycle ==============

let httpServer: Server | null = null
let wss: WebSocketServer | null = null

export function startServer(): { port: number } {
  if (httpServer) return { port: PORT }

  httpServer = createServer(handleHttp)
  wss = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', (req, socket, head) => {
    const url = req.url ?? '/'
    if (url !== '/ws') {
      socket.destroy()
      return
    }
    wss!.handleUpgrade(req, socket, head, (ws) => {
      handleWsConnection(ws)
    })
  })

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('[mobile] HTTP server listening on', PORT)
  })

  httpServer.on('error', (err) => {
    console.error('[mobile] server error:', err)
  })

  return { port: PORT }
}

export function stopServer(): void {
  for (const c of clients.values()) {
    try { c.ws.terminate() } catch { /* */ }
  }
  clients.clear()
  notifyConnect()

  if (wss) {
    wss.close()
    wss = null
  }
  if (httpServer) {
    httpServer.close()
    httpServer = null
  }
  console.log('[mobile] HTTP server stopped')
}

export function isRunning(): boolean {
  return httpServer != null
}

// ============== HTTP handler (static files) ==============

function handleHttp(req: IncomingMessage, res: ServerResponse): void {
  // Allow any origin — the tunnel domain is dynamic and the PWA is the only
  // thing that calls these endpoints anyway. There's no sensitive data here.
  res.setHeader('Access-Control-Allow-Origin', '*')

  const url = (req.url ?? '/').split('?')[0]
  const file = STATIC_ROUTES[url]
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
    return
  }
  res.writeHead(200, {
    'Content-Type': file.contentType,
    'Cache-Control': 'no-cache'
  })
  res.end(file.body)
}

// ============== WebSocket handler ==============

function handleWsConnection(ws: WebSocket): void {
  const id = `c${++connectionSeq}`
  const client: MobileClient = {
    id,
    ws,
    meta: {},
    connectedAt: Date.now()
  }
  clients.set(id, client)
  notifyConnect()
  console.log('[mobile] client connected', id, 'total=', clients.size)

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      // Audio frame — phone sent a WAV blob. Convert to base64 for the
      // wake-service which is the same format the Mac capture window uses.
      const buf = data as Buffer
      const b64 = buf.toString('base64')
      for (const l of audioListeners) {
        try { l(b64) } catch (err) { console.error('[mobile] audio listener err', err) }
      }
      return
    }
    // Text message — JSON control frame
    let msg: any
    try { msg = JSON.parse(data.toString()) } catch { return }
    if (!msg || typeof msg.type !== 'string') return

    if (msg.type === 'hello') {
      client.meta.client = String(msg.client ?? 'unknown').slice(0, 40)
    } else if (msg.type === 'voiceStart') {
      for (const l of voiceListeners) l('start')
    } else if (msg.type === 'voiceEnd') {
      for (const l of voiceListeners) l('end')
    }
  })

  ws.on('close', () => {
    clients.delete(id)
    notifyConnect()
    console.log('[mobile] client disconnected', id, 'remaining=', clients.size)
  })

  ws.on('error', (err) => {
    console.warn('[mobile] ws error', id, err)
  })
}

function notifyConnect(): void {
  const n = clients.size
  for (const l of connectListeners) {
    try { l(n) } catch { /* */ }
  }
}
