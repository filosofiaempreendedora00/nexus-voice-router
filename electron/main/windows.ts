import { BrowserWindow, screen, app } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null

const PRELOAD = join(__dirname, '../preload/index.js')

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow
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
    minWidth: 880,
    minHeight: 600,
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

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/index.html`)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
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
    overlayWindow.loadFile(join(__dirname, '../renderer/overlay.html'))
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
