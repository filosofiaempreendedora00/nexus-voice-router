import { ipcMain, systemPreferences, BrowserWindow } from 'electron'
import { wakeService } from './voice/wake-service'
import { getHudWindow } from './windows'
import { AGENTS } from './agents/agent-config'
import { listMessages, clearConversation } from './agents/agent-storage'
import { sendToAgent } from './agents/agent-claude'
import { agentEvents } from './agents/agent-events'
import { listUsage, summarize } from './agents/usage-store'
import { mobileService } from './mobile'
import {
  listRoutes,
  getRoute,
  upsertRoute,
  deleteRoute,
  listTemplates,
  getTemplate,
  upsertTemplate,
  deleteTemplate
} from './store/routes'
import { loadSettings, saveSettings } from './store/settings'
import { listHistory } from './store/history'
import { classifyOnly, executeInput, executeChoice } from './router/executor'
import { transcribeAudio } from './voice/whisper'
import { refreshTemplate } from './router/slot-discovery'
import { hideOverlay, createMainWindow } from './windows'
import { rebindHotkey } from './hotkey'

export function registerIpcHandlers(): void {
  ipcMain.handle('routes:list', () => listRoutes())
  ipcMain.handle('routes:get', (_e, id: string) => getRoute(id))
  ipcMain.handle('routes:save', (_e, route) => upsertRoute(route))
  ipcMain.handle('routes:delete', (_e, id: string) => deleteRoute(id))

  ipcMain.handle('templates:list', () => listTemplates())
  ipcMain.handle('templates:get', (_e, id: string) => getTemplate(id))
  ipcMain.handle('templates:save', (_e, tpl) => upsertTemplate(tpl))
  ipcMain.handle('templates:delete', (_e, id: string) => deleteTemplate(id))
  ipcMain.handle('templates:refreshSlots', (_e, id: string) => refreshTemplate(id))

  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:save', (_e, patch) => {
    const next = saveSettings(patch)
    if (patch.hotkey) rebindHotkey(next.hotkey)
    return next
  })

  ipcMain.handle('history:list', (_e, limit?: number) => listHistory(limit))

  ipcMain.handle('router:classify', (_e, input: string) => classifyOnly(input))
  ipcMain.handle('router:execute', (_e, input: string) => executeInput(input))
  ipcMain.handle('router:executeChoice', (_e, input: string, candidate) =>
    executeChoice(input, candidate)
  )

  ipcMain.handle('voice:transcribe', async (_e, audioBase64: string) => {
    return transcribeAudio(audioBase64)
  })

  ipcMain.handle('debug:micStatus', async () => {
    if (process.platform !== 'darwin') return { status: 'n/a' }
    const status = systemPreferences.getMediaAccessStatus('microphone')
    let askResult: boolean | string = 'not-asked'
    if (status !== 'granted') {
      try {
        askResult = await systemPreferences.askForMediaAccess('microphone')
      } catch (err) {
        askResult = `error: ${err instanceof Error ? err.message : String(err)}`
      }
    }
    const after = systemPreferences.getMediaAccessStatus('microphone')
    return { status, askResult, after }
  })

  ipcMain.on('overlay:hide', () => hideOverlay())
  ipcMain.on('window:openMain', () => createMainWindow())

  // Wake service: receives audio chunks from capture window, broadcasts state to HUD.
  ipcMain.handle('wake:chunk', async (_e, audioBase64: string) => {
    await wakeService.processChunk(audioBase64)
  })
  ipcMain.on('wake:voiceStart', () => wakeService.onVoiceStart())
  ipcMain.on('wake:voiceEnd', () => wakeService.onVoiceEnd())
  ipcMain.handle('wake:getStatus', () => wakeService.getStatus())

  wakeService.on('status', (status) => {
    const hud = getHudWindow()
    if (hud && !hud.isDestroyed()) {
      hud.webContents.send('wake:status', status)
    }
  })

  // ---------- Mobile companion ----------
  ipcMain.handle('mobile:enable', async () => await mobileService.enable())
  ipcMain.handle('mobile:disable', () => mobileService.disable())
  ipcMain.handle('mobile:status', async () => await mobileService.statusAsync())
  mobileService.on('status', (status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('mobile:status', status)
    }
  })

  // ---------- Usage / cost ----------
  ipcMain.handle('usage:list', () => listUsage())
  ipcMain.handle('usage:summary', () => summarize())

  // ---------- Agents (NEXUS-managed Claude conversations) ----------
  ipcMain.handle('agents:list', () => AGENTS)
  ipcMain.handle('agents:listMessages', (_e, agentId: string) => listMessages(agentId))
  ipcMain.handle('agents:send', (_e, agentId: string, text: string) => sendToAgent(agentId, text))
  ipcMain.handle('agents:clear', (_e, agentId: string) => {
    clearConversation(agentId)
  })

  // Broadcast new agent messages to every renderer window so the Chat page
  // updates live whether the message originated from voice or from the typed
  // input in the Chat panel itself.
  agentEvents.on('message', (evt) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('agents:message', evt)
    }
  })
}
