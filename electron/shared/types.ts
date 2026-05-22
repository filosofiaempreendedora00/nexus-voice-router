export type RouteCategory = string

export interface Route {
  id: string
  command: string
  aliases: string[]
  keywords: string[]
  url: string
  category: RouteCategory
  icon: string
  baseUrlKey?: string
  useCount: number
  lastUsedAt: string | null
  createdAt: string
}

export interface SlotValue {
  value: string
  aliases?: string[]
}

export type SlotSource =
  | { kind: 'static'; values: SlotValue[] }
  | {
      kind: 'endpoint'
      url: string
      cachedValues: SlotValue[]
      lastFetchedAt: string | null
      lastError?: string | null
    }

export interface SlotDef {
  name: string
  required: boolean
  source: SlotSource
}

export interface RouteTemplate {
  id: string
  command: string
  urlPattern: string
  slots: SlotDef[]
  category: RouteCategory
  icon: string
  useCount: number
  lastUsedAt: string | null
  createdAt: string
}

export interface RouteMap {
  version: number
  baseUrls: Record<string, string>
  categories: string[]
  routes: Route[]
  templates: RouteTemplate[]
}

export type Environment = 'PROD' | 'STAGING' | 'LOCAL'

export interface BaseUrlEntry {
  id: string
  url: string
  label: string
}

export interface Settings {
  hotkey: string
  environment: Environment
  aiFallbackEnabled: boolean
  whisperModel: 'tiny' | 'base' | 'small'
  language: string
  firstRunCompleted: boolean
  wakeMode: boolean
  wakeWord: string
  silenceSubmitMs: number
  vadThreshold: number
  baseUrls: BaseUrlEntry[]
}

export type WakeState = 'idle' | 'hearing' | 'listening' | 'thinking' | 'executed' | 'error'

export interface WakeStatus {
  state: WakeState
  message?: string
  buffer?: string
}

export interface HistoryEntry {
  id: string
  at: string
  input: string
  intent: Intent['kind'] | 'unknown'
  matchedRouteId?: string
  matchedTemplateId?: string
  filledSlots?: Record<string, string>
  url?: string
  prompt?: string
  status: 'executed' | 'ambiguous' | 'rejected' | 'failed'
  errorMessage?: string
}

export interface FilledSlots {
  [slotName: string]: string
}

export type NavCandidate =
  | { kind: 'route'; routeId: string; score: number; url: string }
  | { kind: 'template'; templateId: string; score: number; url: string; slots: FilledSlots }

export type Intent =
  | { kind: 'navigation'; routeId: string; url: string; score: number }
  | {
      kind: 'template_navigation'
      templateId: string
      url: string
      slots: FilledSlots
      score: number
    }
  | { kind: 'navigation_ambiguous'; candidates: NavCandidate[] }
  | { kind: 'prompt_claude'; text: string }
  | { kind: 'operational'; action: OpAction }
  | { kind: 'unknown'; reason: string }

export type OpAction =
  | 'send'
  | 'back'
  | 'forward'
  | 'refresh'
  | 'close_tab'
  | 'new_tab'
  | 'next_tab'
  | 'prev_tab'
  | 'copy'
  | 'paste'
  | 'cancel'

export interface ClassifyResult {
  input: string
  normalized: string
  intent: Intent
}

export interface ExecuteResult {
  ok: boolean
  message: string
}

export interface SlotRefreshResult {
  templateId: string
  slotName: string
  ok: boolean
  count?: number
  error?: string
}

declare global {
  interface Window {
    nexus: {
      listRoutes: () => Promise<Route[]>
      getRoute: (id: string) => Promise<Route | null>
      saveRoute: (route: Partial<Route> & { command: string; url: string }) => Promise<Route>
      deleteRoute: (id: string) => Promise<void>

      listTemplates: () => Promise<RouteTemplate[]>
      getTemplate: (id: string) => Promise<RouteTemplate | null>
      saveTemplate: (
        tpl: Partial<RouteTemplate> & { command: string; urlPattern: string }
      ) => Promise<RouteTemplate>
      deleteTemplate: (id: string) => Promise<void>
      refreshTemplateSlots: (id: string) => Promise<SlotRefreshResult[]>

      getSettings: () => Promise<Settings>
      saveSettings: (settings: Partial<Settings>) => Promise<Settings>
      listHistory: (limit?: number) => Promise<HistoryEntry[]>
      classify: (input: string) => Promise<ClassifyResult>
      execute: (input: string) => Promise<ExecuteResult>
      executeChoice: (input: string, candidate: NavCandidate) => Promise<ExecuteResult>
      transcribe: (audioBase64: string) => Promise<string>
      debugMicStatus: () => Promise<{ status: string; askResult?: boolean | string; after?: string }>

      wakeChunk: (audioBase64: string) => Promise<void>
      wakeVoiceStart: () => void
      wakeVoiceEnd: () => void
      onWakeStatus: (cb: (s: WakeStatus) => void) => () => void
      getWakeStatus: () => Promise<WakeStatus>

      hideOverlay: () => void
      onOverlayShow: (cb: () => void) => () => void
      openMainWindow: () => void
    }
  }
}
