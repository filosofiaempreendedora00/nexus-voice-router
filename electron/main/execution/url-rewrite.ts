import type { BaseUrlEntry } from '@shared/types'

/**
 * Rewrite a URL's origin (protocol + host + port) using the FIRST entry of the
 * baseUrls collection. Only rewrites if the original URL's origin matches one
 * of the collection entries — external URLs (chatgpt.com etc) are left alone.
 *
 * This lets the user keep route/template URLs as absolute paths (with a
 * specific origin) and switch environments via the ordered baseUrls list.
 */
export function rewriteUrlWithActiveBase(originalUrl: string, baseUrls: BaseUrlEntry[]): string {
  if (!baseUrls || baseUrls.length === 0) return originalUrl

  let original: URL
  try {
    original = new URL(originalUrl)
  } catch {
    return originalUrl
  }

  // Is the original origin one of the known base URLs?
  const matches = baseUrls.some((b) => {
    try {
      return new URL(b.url).origin === original.origin
    } catch {
      return false
    }
  })
  if (!matches) return originalUrl

  // Replace origin with the active (first) entry's origin.
  let active: URL
  try {
    active = new URL(baseUrls[0].url)
  } catch {
    return originalUrl
  }
  original.protocol = active.protocol
  original.hostname = active.hostname
  original.port = active.port
  return original.toString()
}
