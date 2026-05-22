import { app, BrowserWindow, session, systemPreferences, protocol } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { join, extname, normalize } from 'path'
import { readFileSync } from 'fs'
import { createMainWindow, ensureSingleInstance, createOverlayWindow } from './windows'
import { registerHotkey, unregisterAll } from './hotkey'
import { registerIpcHandlers } from './ipc'
import { createTray } from './tray'
import { backgroundRefreshOnBoot } from './router/slot-discovery'

// Register custom "app://" scheme as secure so getUserMedia works in production.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
  }
])

if (!ensureSingleInstance()) {
  // app already quitting
} else {
  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.roberto.nexus')

    // Map app://nexus/<file> to packaged renderer files via Node fs (asar-aware).
    const rendererRoot = join(__dirname, '..', 'renderer')
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.mjs': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.map': 'application/json'
    }
    protocol.handle('app', (req) => {
      const url = new URL(req.url)
      const safePath = normalize(decodeURIComponent(url.pathname)).replace(/^\/+/, '')
      const fullPath = join(rendererRoot, safePath)
      if (!fullPath.startsWith(rendererRoot)) {
        return new Response('Forbidden', { status: 403 })
      }
      try {
        const data = readFileSync(fullPath)
        const type = mimeTypes[extname(fullPath).toLowerCase()] ?? 'application/octet-stream'
        return new Response(data, { headers: { 'content-type': type } })
      } catch (err) {
        console.warn('[protocol app://] not found:', fullPath, err)
        return new Response('Not found', { status: 404 })
      }
    })

    // Grant microphone access to renderer windows.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'media')
    })
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
      return permission === 'media'
    })

    // Trigger the macOS system prompt for microphone the first time.
    if (process.platform === 'darwin') {
      const before = systemPreferences.getMediaAccessStatus('microphone')
      console.log('[mic] status before ask:', before)
      try {
        const granted = await systemPreferences.askForMediaAccess('microphone')
        console.log('[mic] askForMediaAccess returned:', granted)
      } catch (err) {
        console.warn('[mic] askForMediaAccess failed:', err)
      }
      const after = systemPreferences.getMediaAccessStatus('microphone')
      console.log('[mic] status after ask:', after)
    }

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    registerIpcHandlers()
    createTray()
    createOverlayWindow()
    createMainWindow()
    registerHotkey()
    backgroundRefreshOnBoot()

    const userSettings = (await import('./store/settings')).loadSettings()
    if (userSettings.wakeMode) {
      const { createCaptureWindow, createHudWindow } = await import('./windows')
      createCaptureWindow()
      createHudWindow()
    }

    app.on('activate', () => {
      const visibleMain = BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && w.isVisible() && !w.isAlwaysOnTop()
      )
      if (!visibleMain) {
        createMainWindow()
      }
    })
  })

  app.on('window-all-closed', () => {
    // Stay alive in the menu bar even when all windows are closed.
  })

  app.on('will-quit', () => {
    unregisterAll()
  })
}
