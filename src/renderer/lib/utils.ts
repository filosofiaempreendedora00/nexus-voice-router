import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'nunca'
  const date = new Date(iso)
  const now = Date.now()
  const diff = Math.floor((now - date.getTime()) / 1000)

  if (diff < 60) return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  return date.toLocaleDateString('pt-BR')
}

/**
 * Format USD for per-message and dashboard display. More precision at small
 * values (where Roberto is most cost-curious) and clean tens-of-cents output
 * for larger numbers.
 *   < $0.01  → 4 decimals  ($0.0023)
 *   < $1     → 3 decimals  ($0.124)
 *   ≥ $1     → 2 decimals  ($1.23)
 */
export function formatUsd(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  if (usd < 1) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

/**
 * React hook returning the current viewport breakpoint label. Recomputes on
 * window resize (Electron BrowserWindow resize fires the standard event).
 * Used by responsive layout decisions that can't be expressed via Tailwind
 * classes alone (e.g. switching between a grid-table and a stacked-card
 * representation of the same data).
 */
export type Breakpoint = 'sm' | 'md' | 'lg' | 'xl'

export function getBreakpoint(width: number): Breakpoint {
  if (width >= 1280) return 'xl'
  if (width >= 1024) return 'lg'
  if (width >= 768) return 'md'
  return 'sm'
}
