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
  claudeAutoEnter: boolean
  claudeCodeApp: string
  anthropicApiKey: string
  anthropicModel: string
  // ngrok stable-URL config — when both are filled, the mobile tunnel uses
  // ngrok instead of the disposable cloudflared quick tunnel.
  ngrokAuthtoken: string
  ngrokStaticDomain: string
}

// =============== Agents (NEXUS-managed Claude conversations) ===============

export interface AgentConfig {
  id: string                // e.g. "octopus"
  displayName: string       // e.g. "Octopus"
  description: string       // shown in UI
  chatTrigger: string       // chat name from wake (e.g. "OFICIAL - OCTOPUS")
  systemPrompt: string
  color: string             // tailwind color token for badge
  emoji: string             // visual icon for picker
}

export interface MessageUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  usd: number
  model: string
}

export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
  at: string                // ISO timestamp
  usage?: MessageUsage      // only present on assistant messages
}

export interface AgentSendResult {
  ok: boolean
  agentId: string
  reply?: string            // assistant text (when ok)
  usage?: MessageUsage      // populated on success
  error?: string            // human-readable error (when !ok)
}

// =============== Mobile companion (PWA on phone) ===============

/** Tailscale Funnel readiness probe — what's missing before Funnel can run. */
export type TailscaleState =
  | 'not-installed'    // CLI binary not found on the Mac
  | 'needs-login'      // Tailscale installed but user hasn't signed in
  | 'ready'            // Logged in; Funnel may or may not be enabled (try to confirm)
  | 'unknown'

export interface MobileTunnelStatus {
  state: 'stopped' | 'starting' | 'running' | 'error'
  /** Which backend is currently running OR would be picked. */
  kind: 'tailscale' | 'ngrok' | 'cloudflared' | 'none'
  url?: string
  error?: string
  /** Backend binary is installed for the currently-picked kind. */
  installed: boolean
  /** Both ngrokAuthtoken and ngrokStaticDomain are filled in Settings. */
  ngrokConfigured: boolean
  /** Detailed Tailscale state, when relevant. */
  tailscale: TailscaleState
}

export interface MobileStatus {
  enabled: boolean
  port: number
  lanUrl: string | null
  tunnel: MobileTunnelStatus
  connectedClients: number
}

// =============== Usage / cost dashboard ===============

export interface UsageEntry {
  at: string                              // ISO timestamp of the API call
  agentId: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  usd: number                             // total cost of this single call
}

export interface UsageBucket {
  usd: number
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  calls: number
}

export interface UsageSummary {
  today: UsageBucket
  week: UsageBucket
  month: UsageBucket
  all: UsageBucket
  perAgent: Record<string, UsageBucket>
  perDay: Record<string, UsageBucket>     // key = "YYYY-MM-DD" (local)
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
  | { kind: 'prompt_claude'; text: string; targetChat?: string }
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
      wakeCancel: () => void
      onWakeStatus: (cb: (s: WakeStatus) => void) => () => void
      getWakeStatus: () => Promise<WakeStatus>

      hideOverlay: () => void
      onOverlayShow: (cb: () => void) => () => void
      openMainWindow: () => void

      mobileEnable: () => Promise<MobileStatus>
      mobileDisable: () => Promise<MobileStatus>
      mobileStatus: () => Promise<MobileStatus>
      onMobileStatus: (cb: (s: MobileStatus) => void) => () => void

      usageList: () => Promise<UsageEntry[]>
      usageSummary: () => Promise<UsageSummary>

      agentsList: () => Promise<AgentConfig[]>
      agentsListMessages: (agentId: string) => Promise<AgentMessage[]>
      agentsSend: (agentId: string, text: string) => Promise<AgentSendResult>
      agentsClear: (agentId: string) => Promise<void>
      onAgentReply: (
        cb: (payload: {
          agentId: string
          role: 'user' | 'assistant'
          content: string
          at: string
          usage?: MessageUsage
        }) => void
      ) => () => void
    }
  }
}
