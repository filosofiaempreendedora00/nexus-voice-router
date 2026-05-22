import { globalShortcut } from 'electron'
import { showOverlay, hideOverlay, getOverlayWindow } from './windows'
import { loadSettings } from './store/settings'

let currentBinding: string | null = null

export function registerHotkey(): void {
  const settings = loadSettings()
  bind(settings.hotkey)
}

export function rebindHotkey(accelerator: string): boolean {
  return bind(accelerator)
}

function bind(accelerator: string): boolean {
  if (currentBinding) globalShortcut.unregister(currentBinding)

  try {
    const ok = globalShortcut.register(accelerator, toggleOverlay)
    if (ok) {
      currentBinding = accelerator
      return true
    }
    console.warn(`[hotkey] Failed to register ${accelerator}`)
    return false
  } catch (err) {
    console.error('[hotkey] register error:', err)
    return false
  }
}

function toggleOverlay(): void {
  const win = getOverlayWindow()
  if (win && win.isVisible()) {
    hideOverlay()
  } else {
    showOverlay()
  }
}

export function unregisterAll(): void {
  globalShortcut.unregisterAll()
  currentBinding = null
}
