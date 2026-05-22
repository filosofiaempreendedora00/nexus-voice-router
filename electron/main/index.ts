import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createMainWindow, ensureSingleInstance, createOverlayWindow } from './windows'
import { registerHotkey, unregisterAll } from './hotkey'
import { registerIpcHandlers } from './ipc'
import { createTray } from './tray'
import { loadSettings } from './store/settings'
import { backgroundRefreshOnBoot } from './router/slot-discovery'

if (!ensureSingleInstance()) {
  // app already quitting
} else {
  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.roberto.nexus')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    registerIpcHandlers()
    createTray()
    createOverlayWindow()

    const settings = loadSettings()
    if (!settings.firstRunCompleted) {
      createMainWindow()
    }

    registerHotkey()
    backgroundRefreshOnBoot()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w.isVisible()).length === 0) {
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
