import { Capacitor } from '@capacitor/core'
import { catalogByDomain, matchCatalog } from './catalog'
import type { SubIcon } from './dates'
import { faviconUrl, findSites, parseSite, probeIcon, type SiteHit } from './sites'

export { faviconUrl }

/** Icon for a found website, keeping the cached image when there is one. */
export function iconFromSite(hit: SiteHit): SubIcon {
  return {
    kind: catalogByDomain(hit.domain) ? 'catalog' : 'remote',
    domain: hit.domain,
    data: hit.data,
  }
}

/** Fetches a favicon as a data URL through native HTTP (no WebView CORS). Null when the site has none. */
export async function fetchIconData(domain: string): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null
  const res = await probeIcon(domain)
  return res.ok ? (res.data ?? null) : null
}

/**
 * Resolve an icon for a typed name or link. Catalog first (instant, offline), then the web:
 * a pasted link is used as is, a name is looked up (official site, then name.com, name.io …).
 */
export async function resolveIcon(name: string, online: boolean): Promise<SubIcon> {
  const hit = matchCatalog(name)
  if (hit) return { kind: 'catalog', domain: hit.domain }
  const site = parseSite(name)
  if (!online) return site ? { kind: 'remote', domain: site.domain } : { kind: 'monogram' }
  const [best] = await findSites(name, 1)
  return best ? iconFromSite(best) : { kind: 'monogram' }
}

/** Makes sure a saved icon carries cached data so the list works offline. */
export async function withIconData(icon: SubIcon, online: boolean): Promise<SubIcon> {
  if (!online || icon.kind === 'monogram' || !icon.domain || icon.data) return icon
  const data = await fetchIconData(icon.domain)
  return data ? { ...icon, data } : icon
}

export function iconSrc(icon: SubIcon, online: boolean): string | null {
  if (icon.data) return icon.data
  if (online && icon.kind !== 'monogram' && icon.domain) return faviconUrl(icon.domain)
  return null
}
