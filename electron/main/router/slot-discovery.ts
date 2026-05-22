import type { RouteTemplate, SlotValue, SlotRefreshResult } from '@shared/types'
import { listTemplates, updateTemplateSlotCache, getTemplate } from '../store/routes'

interface NormalizedResponse {
  slots: Record<string, SlotValue[]>
}

export async function refreshAllTemplates(): Promise<SlotRefreshResult[]> {
  const templates = listTemplates()
  const results: SlotRefreshResult[] = []
  for (const tpl of templates) {
    results.push(...(await refreshTemplate(tpl.id)))
  }
  return results
}

export async function refreshTemplate(templateId: string): Promise<SlotRefreshResult[]> {
  const tpl = getTemplate(templateId)
  if (!tpl) return []

  const endpointUrls = new Set<string>()
  for (const slot of tpl.slots) {
    if (slot.source.kind === 'endpoint') endpointUrls.add(slot.source.url)
  }

  const fetched = new Map<string, NormalizedResponse | { error: string }>()
  for (const url of endpointUrls) {
    fetched.set(url, await fetchAndNormalize(url))
  }

  const results: SlotRefreshResult[] = []
  for (const slot of tpl.slots) {
    if (slot.source.kind !== 'endpoint') continue
    const data = fetched.get(slot.source.url)
    if (!data) continue
    if ('error' in data) {
      updateTemplateSlotCache(tpl.id, slot.name, slot.source.cachedValues ?? [], data.error)
      results.push({
        templateId: tpl.id,
        slotName: slot.name,
        ok: false,
        error: data.error
      })
      continue
    }
    const values = data.slots[slot.name] ?? []
    updateTemplateSlotCache(tpl.id, slot.name, values)
    results.push({
      templateId: tpl.id,
      slotName: slot.name,
      ok: true,
      count: values.length
    })
  }
  return results
}

async function fetchAndNormalize(url: string): Promise<NormalizedResponse | { error: string }> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const json = (await res.json()) as unknown
    return { slots: normalizeSlots(json) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

function normalizeSlots(raw: unknown): Record<string, SlotValue[]> {
  if (raw === null || typeof raw !== 'object') return {}
  const obj = raw as Record<string, unknown>
  const slotsRaw = (obj.slots ?? obj) as Record<string, unknown>
  const result: Record<string, SlotValue[]> = {}
  for (const [name, items] of Object.entries(slotsRaw)) {
    if (!Array.isArray(items)) continue
    const normalized: SlotValue[] = []
    for (const item of items) {
      if (typeof item === 'string') {
        normalized.push({ value: item })
      } else if (item && typeof item === 'object') {
        const v = (item as Record<string, unknown>).value
        const aliases = (item as Record<string, unknown>).aliases
        if (typeof v === 'string' && v.trim()) {
          normalized.push({
            value: v,
            aliases: Array.isArray(aliases) ? aliases.filter((a): a is string => typeof a === 'string') : undefined
          })
        }
      }
    }
    result[name] = normalized
  }
  return result
}

export function backgroundRefreshOnBoot(): void {
  setTimeout(() => {
    void refreshAllTemplates().catch((err) => {
      console.warn('[slot-discovery] background refresh failed:', err)
    })
  }, 2500)
}

export function getSlotValues(tpl: RouteTemplate, slotName: string): SlotValue[] {
  const slot = tpl.slots.find((s) => s.name === slotName)
  if (!slot) return []
  return slot.source.kind === 'static' ? slot.source.values : slot.source.cachedValues ?? []
}
