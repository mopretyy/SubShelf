import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { norm } from './catalog'
import type { Category } from './dates'

/**
 * Finding the website of any service from what the person typed: a link, a bare domain or a name.
 * Only the typed name (or domain) leaves the phone: to Google's favicon service and to Wikidata.
 */

export interface SiteHit {
  domain: string
  /** Page title, when it could be read (native only, browsers block it). */
  title?: string
  /** Cached icon as a data URL (native). */
  data?: string
  /** Found as the official website of a matching Wikidata entry. */
  official?: boolean
  /** Category guessed from the Wikidata description. */
  category?: Category
}

const CATEGORY_HINTS: [Category, RegExp][] = [
  [
    'ai',
    /artificial intelligence|\bai\b|chatbot|language model|machine learning|нейросет|искусственн/i,
  ],
  ['video', /video|streaming|television|\btv\b|film|movie|кино|видео|стриминг/i],
  ['music', /music|audio|podcast|audiobook|radio|музык|аудио|подкаст/i],
  ['games', /video game|gaming|game (?:service|platform|subscription)|игр/i],
  ['cloud', /cloud|storage|vpn|password|backup|hosting|e-?mail|облак|хранилищ/i],
  ['learning', /education|learning|language|course|dictionary|обучени|образова|курс/i],
  ['health', /fitness|health|exercise|meditation|sleep|workout|здоров|фитнес|медитац/i],
  ['social', /social|messag|dating|community|chat|соцсет|мессенджер|знакомств/i],
  [
    'work',
    /software|productivity|note|design|developer|office|collaboration|project|search engine|browser|приложени|программ/i,
  ],
]

/** "note-taking software" → work, "video on demand service" → video … */
export function categoryFromText(text: string): Category | undefined {
  return CATEGORY_HINTS.find(([, re]) => re.test(text))?.[0]
}

const native = () => Capacitor.isNativePlatform()

/** Google's favicon service: 404 (native) or a 16×16 globe (browser) when a site has no icon. */
export const faviconUrl = (domain: string, size = 128) =>
  `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(`https://${domain}`)}&size=${size}`

const DOMAIN =
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,24}|xn--[a-z0-9-]{2,59})$/i

export const isDomain = (s: string) => DOMAIN.test(s)

/** Subdomains that never name the brand: app.notion.so → notion.so. */
const NOISE_SUB =
  /^(www\d?|m|app|apps|my|account|accounts|billing|auth|login|id|web|portal|dashboard|go|get|pay|secure|store|shop|help|support)\./

/**
 * A link or a bare domain → its host, or null when the text is just a name.
 * "https://www.tembo.io/pricing" → "tembo.io", "tembo.io" → "tembo.io", "Tembo" → null.
 */
export function parseSite(text: string): { domain: string; url: string } | null {
  const raw = text.trim()
  if (!raw || /\s/.test(raw)) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
  let u: URL
  try {
    u = new URL(withScheme)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  let host = u.hostname.toLowerCase().replace(/\.$/, '')
  if (!isDomain(host)) return null
  while (NOISE_SUB.test(host) && host.split('.').length > 2) host = host.replace(NOISE_SUB, '')
  const path = u.pathname === '/' && !u.search ? '' : u.pathname + u.search
  return { domain: host, url: `https://${u.hostname.toLowerCase()}${path}` }
}

const TWO_PART_TLD = /\.(co|com|org|net|ac|gov)\.[a-z]{2}$/

/** "tembo.io" → "Tembo", "open.spotify.com" → "Spotify", "bbc.co.uk" → "Bbc". */
export function brandFromDomain(domain: string): string {
  const parts = domain.split('.')
  const label = TWO_PART_TLD.test(domain) ? parts[parts.length - 3] : parts[parts.length - 2]
  const word = (label ?? domain).replace(/-/g, ' ')
  return word.replace(/(^|\s)\S/g, (c) => c.toUpperCase())
}

const CYR: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  і: 'i',
  ї: 'yi',
  є: 'ye',
  ґ: 'g',
}

export const translit = (s: string) => Array.from(s, (c) => CYR[c] ?? c).join('')

/** Plan words that are not part of the domain: "Cursor Pro" → cursor, "Spotify Premium" → spotify. */
const PLAN_WORDS = new Set([
  'pro',
  'plus',
  'premium',
  'max',
  'super',
  'ultra',
  'family',
  'basic',
  'standard',
  'team',
  'business',
  'personal',
  'individual',
  'student',
  'monthly',
  'yearly',
  'annual',
  'subscription',
  'membership',
  'app',
  'подписка',
  'премиум',
  'плюс',
  'про',
])

const TLDS = ['com', 'io', 'ai', 'app', 'co', 'so', 'dev', 'net', 'org', 'me', 'tv', 'gg']

/** Domains worth checking for a typed name, most likely first. */
export function candidateDomains(name: string): string[] {
  const n = norm(name).replace(/\+/g, ' plus ')
  const cyrillic = /[а-яёіїєґ]/.test(n)
  const words = translit(n)
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  if (!words.length) return []
  const core =
    words.length > 1 && PLAN_WORDS.has(words[words.length - 1]) ? words.slice(0, -1) : words
  const slugs = [core.join(''), core.length > 1 ? core.join('-') : '', words.join('')].filter(
    (s, i, a) => s.length >= 2 && a.indexOf(s) === i,
  )
  const tlds = cyrillic ? ['ru', ...TLDS] : TLDS
  const out: string[] = []
  for (const tld of tlds) for (const s of slugs) out.push(`${s}.${tld}`)
  return out.filter((d, i, a) => isDomain(d) && a.indexOf(d) === i).slice(0, 18)
}

/** Wikidata descriptions of things people pay a subscription for. */
const SERVICE =
  /software|service|platform|app|application|website|web site|company|corporation|startup|streaming|subscription|video on demand|online|messag|cloud|vpn|music|social|search engine|artificial intelligence|\bai\b|chatbot|language model|marketplace|bank|game (?:service|platform|subscription)|newspaper|magazine|news|сервис|компания|платформ|приложени|сайт|онлайн/i

interface WdSearch {
  search?: { id: string; label?: string; description?: string }[]
}
interface WdEntities {
  entities?: Record<
    string,
    { claims?: { P856?: { mainsnak?: { datavalue?: { value?: string } } }[] } }
  >
}

/** Official websites of Wikidata entries whose name matches and which look like a service. */
export function pickOfficial(
  query: string,
  search: WdSearch,
  entities: WdEntities,
): { domain: string; category?: Category }[] {
  const q = norm(query)
  const out: { domain: string; category?: Category }[] = []
  for (const s of search.search ?? []) {
    const label = norm(s.label ?? '')
    if (!label || !(label === q || label.startsWith(q) || q.startsWith(label))) continue
    if (!SERVICE.test(s.description ?? '')) continue
    const site = entities.entities?.[s.id]?.claims?.P856?.[0]?.mainsnak?.datavalue?.value
    const host = site ? parseSite(site)?.domain : null
    if (host && !out.some((o) => o.domain === host)) {
      out.push({ domain: host, category: categoryFromText(s.description ?? '') })
    }
  }
  return out
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    if (native()) {
      const res = await CapacitorHttp.get({ url, connectTimeout: 6000, readTimeout: 6000 })
      return res.status === 200
        ? typeof res.data === 'string'
          ? JSON.parse(res.data)
          : res.data
        : null
    }
    const res = await fetch(url, { signal })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

async function wikidata(
  query: string,
  signal?: AbortSignal,
): Promise<{ domain: string; category?: Category }[]> {
  const lang = /[а-яё]/i.test(query) ? 'ru' : 'en'
  const api = 'https://www.wikidata.org/w/api.php?format=json&origin=*'
  const search = await getJson<WdSearch>(
    `${api}&action=wbsearchentities&type=item&limit=7&language=${lang}&uselang=${lang}&search=${encodeURIComponent(query)}`,
    signal,
  )
  const ids = (search?.search ?? []).map((s) => s.id)
  if (!search || !ids.length) return []
  const entities = await getJson<WdEntities>(
    `${api}&action=wbgetentities&props=claims&ids=${ids.join('|')}`,
    signal,
  )
  return entities ? pickOfficial(query, search, entities) : []
}

/** Does the site have a real icon? Native also returns the image so the list works offline. */
export async function probeIcon(domain: string): Promise<{ ok: boolean; data?: string }> {
  if (native()) {
    try {
      const res = await CapacitorHttp.get({
        url: faviconUrl(domain),
        responseType: 'blob',
        connectTimeout: 6000,
        readTimeout: 6000,
      })
      if (res.status !== 200 || typeof res.data !== 'string' || res.data.length < 200)
        return { ok: false }
      const type = String(res.headers['Content-Type'] ?? res.headers['content-type'] ?? 'image/png')
        .split(';')[0]
        .trim()
      const data = `data:${type};base64,${res.data}`
      return { ok: true, data: data.length < 60_000 ? data : undefined }
    } catch {
      return { ok: false }
    }
  }
  // Browsers cannot read the status (no CORS); Google answers a 16×16 globe for "no icon".
  return new Promise((resolve) => {
    const img = new Image()
    const done = (ok: boolean) => {
      clearTimeout(timer)
      resolve({ ok })
    }
    const timer = setTimeout(() => done(false), 7000)
    img.onload = () => done(img.naturalWidth > 16)
    img.onerror = () => done(false)
    img.src = faviconUrl(domain, 64)
  })
}

const PARKED =
  /\b(?:domain (?:is )?for sale|buy this domain|this domain (?:is|may be) for sale|domain is parked|parked (?:free|domain)|hugedomains|sedoparking|sedo\.com|dan\.com|afternic)\b|домен продается|купить домен/i

/** Home page title, to name the candidates and skip parked domains. Native only. */
async function siteTitle(domain: string): Promise<string | null | false> {
  if (!native()) return null
  try {
    const res = await CapacitorHttp.get({
      url: `https://${domain}`,
      responseType: 'text',
      connectTimeout: 5000,
      readTimeout: 5000,
    })
    if (res.status >= 400) return false
    const html = typeof res.data === 'string' ? res.data.slice(0, 60_000) : ''
    const og = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i.exec(html)?.[1]
    const title = og ?? /<title[^>]*>([^<]{1,120})/i.exec(html)?.[1] ?? ''
    const clean = title
      .replace(/&amp;/g, '&')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
    if (PARKED.test(clean) || PARKED.test(html.slice(0, 4000))) return false
    return clean || null
  } catch {
    return null
  }
}

async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

/**
 * Websites for a typed name, best first: official sites from Wikidata, then name.com, name.io,
 * name.ai … that really have an icon (and, on phones, are not parked domains).
 */
export async function findSites(
  query: string,
  limit = 4,
  signal?: AbortSignal,
): Promise<SiteHit[]> {
  const direct = parseSite(query)
  if (direct) {
    const probe = await probeIcon(direct.domain)
    return [{ domain: direct.domain, data: probe.data, official: true }]
  }
  const official = await wikidata(query.trim(), signal)
  if (signal?.aborted) return []
  const officialDomains = official.map((o) => o.domain)
  const domains = [...officialDomains, ...candidateDomains(query)].filter(
    (d, i, a) => a.indexOf(d) === i,
  )
  const probes = await pool(domains, 8, probeIcon)
  if (signal?.aborted) return []
  const found = domains
    .map((domain, i) => ({
      domain,
      data: probes[i].data,
      ok: probes[i].ok,
      official: officialDomains.includes(domain),
      category: official.find((o) => o.domain === domain)?.category,
    }))
    .filter((h) => h.ok)
    .slice(0, limit + 2)
  const titles = await Promise.all(found.map((h) => siteTitle(h.domain)))
  const hits: SiteHit[] = []
  found.forEach((h, i) => {
    if (titles[i] === false) return
    hits.push({
      domain: h.domain,
      data: h.data,
      official: h.official,
      title: titles[i] || undefined,
    })
  })
  return hits.slice(0, limit)
}
