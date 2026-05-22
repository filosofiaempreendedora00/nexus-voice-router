import { contextBridge, ipcRenderer } from 'electron'

type Listener = () => void

const api = {
  listRoutes: () => ipcRenderer.invoke('routes:list'),
  getRoute: (id: string) => ipcRenderer.invoke('routes:get', id),
  saveRoute: (route: unknown) => ipcRenderer.invoke('routes:save', route),
  deleteRoute: (id: string) => ipcRenderer.invoke('routes:delete', id),

  listTemplates: () => ipcRenderer.invoke('templates:list'),
  getTemplate: (id: string) => ipcRenderer.invoke('templates:get', id),
  saveTemplate: (tpl: unknown) => ipcRenderer.invoke('templates:save', tpl),
  deleteTemplate: (id: string) => ipcRenderer.invoke('templates:delete', id),
  refreshTemplateSlots: (id: string) => ipcRenderer.invoke('templates:refreshSlots', id),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),

  listHistory: (limit?: number) => ipcRenderer.invoke('history:list', limit),

  classify: (input: string) => ipcRenderer.invoke('router:classify', input),
  execute: (input: string) => ipcRenderer.invoke('router:execute', input),
  executeChoice: (input: string, candidate: unknown) =>
    ipcRenderer.invoke('router:executeChoice', input, candidate),

  transcribe: (audioBase64: string) => ipcRenderer.invoke('voice:transcribe', audioBase64),

  debugMicStatus: () => ipcRenderer.invoke('debug:micStatus'),

  wakeChunk: (audioBase64: string) => ipcRenderer.invoke('wake:chunk', audioBase64),
  wakeVoiceStart: () => ipcRenderer.send('wake:voiceStart'),
  wakeVoiceEnd: () => ipcRenderer.send('wake:voiceEnd'),
  getWakeStatus: () => ipcRenderer.invoke('wake:getStatus'),
  onWakeStatus: (cb: (s: unknown) => void) => {
    const handler = (_: unknown, status: unknown): void => cb(status)
    ipcRenderer.on('wake:status', handler)
    return () => ipcRenderer.removeListener('wake:status', handler)
  },

  hideOverlay: () => ipcRenderer.send('overlay:hide'),
  openMainWindow: () => ipcRenderer.send('window:openMain'),

  onOverlayShow: (cb: Listener) => {
    const handler = (): void => cb()
    ipcRenderer.on('overlay:show', handler)
    return () => ipcRenderer.removeListener('overlay:show', handler)
  }
}

contextBridge.exposeInMainWorld('nexus', api)
