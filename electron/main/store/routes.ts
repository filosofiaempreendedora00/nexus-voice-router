import { randomUUID } from 'crypto'
import type { Route, RouteMap, RouteTemplate, SlotDef } from '@shared/types'
import { routesPath } from './paths'
import { readJson, writeJson } from './json-file'

const DEFAULTS: RouteMap = {
  version: 2,
  baseUrls: {
    PROD: 'http://localhost:3000',
    LOCAL: 'http://localhost:3000'
  },
  categories: ['Clientes', 'Apps', 'Ferramentas', 'Pessoal'],
  routes: [
    {
      id: 'demo-organiker-investimento',
      command: 'Organiker Investimento',
      aliases: ['preço organiker', 'proposta organiker', 'investimento organiker'],
      keywords: ['organiker', 'investimento', 'preço', 'valor', 'proposta'],
      url: 'http://localhost:3000/clientes/organiker/investimento',
      category: 'Clientes',
      icon: '💰',
      useCount: 0,
      lastUsedAt: null,
      createdAt: new Date().toISOString()
    }
  ],
  templates: [
    {
      id: 'tpl-cliente-secao',
      command: 'Cliente · Seção',
      urlPattern: 'http://localhost:3000/clientes/{cliente}/{secao}',
      slots: [
        {
          name: 'cliente',
          required: true,
          source: {
            kind: 'static',
            values: [
              { value: 'organiker', aliases: ['organic', 'organico'] },
              { value: 'minimal', aliases: ['minim'] },
              { value: 'blackdragon', aliases: ['dragon', 'drago', 'blackdrgn'] },
              { value: 'forcell', aliases: ['força', 'forcel'] }
            ]
          }
        },
        {
          name: 'secao',
          required: true,
          source: {
            kind: 'static',
            values: [
              { value: 'investimento', aliases: ['preço', 'valor', 'proposta', 'preco'] },
              { value: 'dashboard', aliases: ['painel', 'métricas', 'metricas'] },
              { value: 'onboarding', aliases: ['cadastro', 'inicio'] },
              { value: 'creators', aliases: ['criadores', 'talentos'] },
              { value: 'settings', aliases: ['configurações', 'ajustes', 'config'] }
            ]
          }
        }
      ],
      category: 'Clientes',
      icon: '🧩',
      useCount: 0,
      lastUsedAt: null,
      createdAt: new Date().toISOString()
    }
  ]
}

export function loadRouteMap(): RouteMap {
  const map = readJson<RouteMap>(routesPath(), DEFAULTS)
  if (!map.routes) map.routes = DEFAULTS.routes
  if (!map.templates) map.templates = []
  if (!map.baseUrls) map.baseUrls = DEFAULTS.baseUrls
  if (!map.categories) map.categories = DEFAULTS.categories
  return map
}

export function saveRouteMap(map: RouteMap): void {
  writeJson(routesPath(), map)
}

export function listRoutes(): Route[] {
  return loadRouteMap().routes
}

export function getRoute(id: string): Route | null {
  return loadRouteMap().routes.find((r) => r.id === id) ?? null
}

export function upsertRoute(input: Partial<Route> & { command: string; url: string }): Route {
  const map = loadRouteMap()
  const now = new Date().toISOString()

  if (input.id) {
    const idx = map.routes.findIndex((r) => r.id === input.id)
    if (idx >= 0) {
      const merged: Route = {
        ...map.routes[idx],
        ...input,
        aliases: input.aliases ?? map.routes[idx].aliases,
        keywords: input.keywords ?? map.routes[idx].keywords,
        category: input.category ?? map.routes[idx].category,
        icon: input.icon ?? map.routes[idx].icon
      }
      map.routes[idx] = merged
      saveRouteMap(map)
      return merged
    }
  }

  const created: Route = {
    id: input.id ?? randomUUID(),
    command: input.command,
    aliases: input.aliases ?? [],
    keywords: input.keywords ?? deriveKeywords(input.command, input.aliases ?? []),
    url: input.url,
    category: input.category ?? 'Apps',
    icon: input.icon ?? '🔗',
    useCount: 0,
    lastUsedAt: null,
    createdAt: now
  }
  map.routes.push(created)
  saveRouteMap(map)
  return created
}

export function deleteRoute(id: string): void {
  const map = loadRouteMap()
  map.routes = map.routes.filter((r) => r.id !== id)
  saveRouteMap(map)
}

export function bumpRouteUsage(id: string): void {
  const map = loadRouteMap()
  const route = map.routes.find((r) => r.id === id)
  if (!route) return
  route.useCount += 1
  route.lastUsedAt = new Date().toISOString()
  saveRouteMap(map)
}

export function listTemplates(): RouteTemplate[] {
  return loadRouteMap().templates
}

export function getTemplate(id: string): RouteTemplate | null {
  return loadRouteMap().templates.find((t) => t.id === id) ?? null
}

export function upsertTemplate(
  input: Partial<RouteTemplate> & { command: string; urlPattern: string }
): RouteTemplate {
  const map = loadRouteMap()
  const now = new Date().toISOString()

  if (input.id) {
    const idx = map.templates.findIndex((t) => t.id === input.id)
    if (idx >= 0) {
      const merged: RouteTemplate = {
        ...map.templates[idx],
        ...input,
        slots: input.slots ?? map.templates[idx].slots,
        category: input.category ?? map.templates[idx].category,
        icon: input.icon ?? map.templates[idx].icon
      }
      map.templates[idx] = merged
      saveRouteMap(map)
      return merged
    }
  }

  const created: RouteTemplate = {
    id: input.id ?? randomUUID(),
    command: input.command,
    urlPattern: input.urlPattern,
    slots: input.slots ?? extractSlotsFromPattern(input.urlPattern),
    category: input.category ?? 'Apps',
    icon: input.icon ?? '🧩',
    useCount: 0,
    lastUsedAt: null,
    createdAt: now
  }
  map.templates.push(created)
  saveRouteMap(map)
  return created
}

export function deleteTemplate(id: string): void {
  const map = loadRouteMap()
  map.templates = map.templates.filter((t) => t.id !== id)
  saveRouteMap(map)
}

export function bumpTemplateUsage(id: string): void {
  const map = loadRouteMap()
  const tpl = map.templates.find((t) => t.id === id)
  if (!tpl) return
  tpl.useCount += 1
  tpl.lastUsedAt = new Date().toISOString()
  saveRouteMap(map)
}

export function updateTemplateSlotCache(
  templateId: string,
  slotName: string,
  values: Array<{ value: string; aliases?: string[] }>,
  error?: string
): void {
  const map = loadRouteMap()
  const tpl = map.templates.find((t) => t.id === templateId)
  if (!tpl) return
  const slot = tpl.slots.find((s) => s.name === slotName)
  if (!slot || slot.source.kind !== 'endpoint') return
  slot.source.cachedValues = values
  slot.source.lastFetchedAt = new Date().toISOString()
  slot.source.lastError = error ?? null
  saveRouteMap(map)
}

export function extractSlotsFromPattern(pattern: string): SlotDef[] {
  const names = Array.from(pattern.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)).map((m) => m[1])
  const seen = new Set<string>()
  return names
    .filter((n) => {
      if (seen.has(n)) return false
      seen.add(n)
      return true
    })
    .map((name) => ({
      name,
      required: true,
      source: { kind: 'static' as const, values: [] }
    }))
}

function deriveKeywords(command: string, aliases: string[]): string[] {
  const all = [command, ...aliases].join(' ').toLowerCase()
  return Array.from(
    new Set(
      all
        .split(/\s+/)
        .map((w) => w.replace(/[^a-zà-ú0-9]/gi, ''))
        .filter((w) => w.length >= 3)
    )
  )
}
