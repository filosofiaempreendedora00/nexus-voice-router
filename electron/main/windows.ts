import { BrowserWindow, screen, app } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let captureWindow: BrowserWindow | null = null
let hudWindow: BrowserWindow | null = null

const PRELOAD = join(__dirname, '../preload/index.js')

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow
}

export function getHudWindow(): BrowserWindow | null {
  return hudWindow
}

export function getCaptureWindow(): BrowserWindow | null {
  return captureWindow
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return mainWindow
  }

  mainWindow = new BrowserWindow({
    width: 1100,
    height: 740,
    // The renderer is fully responsive down to ~440px, so we set a generous
    // floor that allows side-by-side experimentation (e.g. NEXUS docked
    // beside Claude desktop). The renderer adapts via Tailwind breakpoints.
    minWidth: 480,
    minHeight: 560,
    show: false,
    title: 'NEXUS Voice Router',
    backgroundColor: '#0A0A0B',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
  mainWindow.webContents.once('did-finish-load', () => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html`)
  } else {
    mainWindow.loadURL('app://nexus/index.html')
  }

  return mainWindow
}

export function createOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow

  const display = screen.getPrimaryDisplay()
  const width = 640
  const height = 220
  const x = Math.round((display.workArea.width - width) / 2 + display.workArea.x)
  const y = Math.round(display.workArea.height * 0.28 + display.workArea.y)

  overlayWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    fullscreenable: false,
    hasShadow: true,
    roundedCorners: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  })

  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlayWindow.setAlwaysOnTop(true, 'floating')

  overlayWindow.on('blur', () => {
    if (overlayWindow?.isVisible()) overlayWindow.hide()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    overlayWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay.html`)
  } else {
    overlayWindow.loadURL('app://nexus/overlay.html')
  }

  return overlayWindow
}

export function showOverlay(): void {
  const win = createOverlayWindow()
  if (!win.isVisible()) {
    win.webContents.send('overlay:show')
    win.showInactive()
    setTimeout(() => win.focus(), 30)
  } else {
    win.focus()
  }
}

export function hideOverlay(): void {
  if (overlayWindow && overlayWindow.isVisible()) overlayWindow.hide()
}

export function createCaptureWindow(): BrowserWindow {
  if (captureWindow && !captureWindow.isDestroyed()) return captureWindow

  captureWindow = new BrowserWindow({
    width: 1,
    height: 1,
    x: -10,
    y: -10,
    show: false,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    focusable: false,
    movable: false,
    resizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })
  captureWindow.on('closed', () => { captureWindow = null })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    captureWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/capture.html`)
  } else {
    captureWindow.loadURL('app://nexus/capture.html')
  }
  return captureWindow
}

export function destroyCaptureWindow(): void {
  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.close()
  }
  captureWindow = null
}

export function createHudWindow(): BrowserWindow {
  if (hudWindow && !hudWindow.isDestroyed()) return hudWindow

  const display = screen.getPrimaryDisplay()
  const width = 140
  const height = 140
  const padding = 12
  // Roberto prefers the HUD on the left side of the screen — keeps it out of
  // the way of the macOS notification center / menu bar status icons that
  // crowd the right.
  const x = display.workArea.x + padding
  const y = display.workArea.y + display.workArea.height - height - padding

  hudWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })
  hudWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  hudWindow.setAlwaysOnTop(true, 'screen-saver')
  hudWindow.on('closed', () => { hudWindow = null })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    hudWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/hud.html`)
  } else {
    hudWindow.loadURL('app://nexus/hud.html')
  }

  hudWindow.once('ready-to-show', () => hudWindow?.showInactive())
  return hudWindow
}

export function destroyHudWindow(): void {
  if (hudWindow && !hudWindow.isDestroyed()) {
    hudWindow.close()
  }
  hudWindow = null
}

export function ensureSingleInstance(): boolean {
  const lock = app.requestSingleInstanceLock()
  if (!lock) {
    app.quit()
    return false
  }
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
  return true
}
