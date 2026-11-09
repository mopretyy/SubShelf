import { Preferences } from '@capacitor/preferences'
import { matchCatalog } from './catalog'
import { isDomain } from './sites'
import {
  CATEGORIES,
  isValidYmd,
  localYmd,
  REMIND_OPTIONS,
  type Category,
  type Cycle,
  type RemindDays,
  type Sub,
  type SubIcon,
} from './dates'

const SUBS_KEY = 'subshelf.subs.v2'
const SETTINGS_KEY = 'subshelf.settings.v2'
const SUBS_KEY_V1 = 'subshelf.subs.v1'
const SETTINGS_KEY_V1 = 'subshelf.settings.v1'
const PRO_KEY = 'subshelf.pro.v1'

export type LangPref = 'system' | 'ru' | 'en'

export interface Settings {
  lang: LangPref
  /** Local hour for reminder notifications. */
  remindHour: number
  /** Reminder preset for new subscriptions. */
  defaultRemind: RemindDays
  /** Currency for new subscriptions and for the big totals. */
  currency: string
  /** Look up service icons online by name (only the name leaves the phone). */
  autoIcons: boolean
  profileName: string | null
  /** The welcome screens were shown. */
  onboarded: boolean
}

export const CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'RUB',
  'UAH',
  'MDL',
  'RON',
  'KZT',
  'BYN',
  'PLN',
  'TRY',
  'GEL',
  'AMD',
  'AZN',
  'UZS',
  'THB',
  'JPY',
  'CNY',
  'INR',
  'BRL',
  'CAD',
  'AUD',
  'CHF',
  'ILS',
  'AED',
]

const EURO = 'AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK'.split(' ')
const BY_REGION: Record<string, string> = {
  US: 'USD',
  GB: 'GBP',
  RU: 'RUB',
  UA: 'UAH',
  MD: 'MDL',
  RO: 'RON',
  KZ: 'KZT',
  BY: 'BYN',
  PL: 'PLN',
  TR: 'TRY',
  GE: 'GEL',
  AM: 'AMD',
  AZ: 'AZN',
  UZ: 'UZS',
  TH: 'THB',
  JP: 'JPY',
  CN: 'CNY',
  IN: 'INR',
  BR: 'BRL',
  CA: 'CAD',
  AU: 'AUD',
  CH: 'CHF',
  IL: 'ILS',
  AE: 'AED',
}

/** Currency of the device region ("ru-MD" → MDL), USD when the region is unknown. */
export function guessCurrency(locale = typeof navigator !== 'undefined' ? navigator.language : '') {
  const region = /[-_]([A-Za-z]{2})\b/.exec(locale)?.[1]?.toUpperCase() ?? ''
  if (EURO.includes(region)) return 'EUR'
  return BY_REGION[region] ?? 'USD'
}

export const defaultSettings: Settings = {
  lang: 'system',
  remindHour: 10,
  defaultRemind: 1,
  currency: guessCurrency(),
  autoIcons: true,
  profileName: null,
  onboarded: false,
}

const CYCLES: Cycle[] = ['weekly', 'monthly', 'yearly']

function sanitizeIcon(raw: unknown, name: string): SubIcon {
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    const kind = r.kind === 'catalog' || r.kind === 'remote' ? r.kind : 'monogram'
    const domain = typeof r.domain === 'string' && isDomain(r.domain) ? r.domain : undefined
    const data =
      typeof r.data === 'string' && r.data.startsWith('data:image/') && r.data.length < 60_000
        ? r.data
        : undefined
    if (kind !== 'monogram' && domain) return { kind, domain, data }
    if (kind === 'monogram') return { kind: 'monogram' }
  }
  const hit = matchCatalog(name)
  return hit ? { kind: 'catalog', domain: hit.domain } : { kind: 'monogram' }
}

/**
 * Coerce anything (v2 storage, v1 storage, backups) into a valid v2 Sub, or null.
 * v1 → v2: chargeDate → nextDate, 'cancelled' → archivedAt, cancelUrl kept in notes, startDate dropped.
 */
export function sanitizeSub(raw: unknown, fallbackId: number, today = localYmd()): Sub | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 80) : ''
  if (!name) return null
  const price = r.price === null || r.price === undefined || r.price === '' ? null : Number(r.price)
  const currency = typeof r.currency === 'string' ? r.currency.trim().toUpperCase() : ''
  const date = (v: unknown) => (isValidYmd(v) ? v : null)

  const archivedAt =
    date(r.archivedAt) ?? (r.status === 'cancelled' ? (date(r.cancelledAt) ?? today) : null)

  // v1 kept a cancel link; v2 first parked it in the notes. Both now live in `url`.
  const link = (v: unknown) => {
    if (typeof v !== 'string') return null
    const t = v.trim()
    return /^https?:\/\/[^\s]+$/i.test(t) && t.length <= 400 ? t : null
  }
  let notes = typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim() : ''
  const parked = /(?:^|\n)Ссылка для отмены: (https?:\/\/\S+)\s*$/.exec(notes)
  const url = link(r.url) ?? link(r.cancelUrl) ?? (parked ? link(parked[1]) : null)
  if (parked && url === link(parked[1])) notes = notes.slice(0, parked.index).trim()

  const remind: RemindDays =
    'remind' in r && REMIND_OPTIONS.includes(r.remind as RemindDays) ? (r.remind as RemindDays) : 1
  const category: Category = CATEGORIES.includes(r.category as Category)
    ? (r.category as Category)
    : (matchCatalog(name)?.category ?? 'other')

  return {
    id: Number.isInteger(r.id) && (r.id as number) > 0 ? (r.id as number) : fallbackId,
    name,
    status: r.status === 'trial' ? 'trial' : 'active',
    price: price !== null && Number.isFinite(price) && price >= 0 ? price : null,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : 'USD',
    cycle: CYCLES.includes(r.cycle as Cycle) ? (r.cycle as Cycle) : 'monthly',
    nextDate: date(r.nextDate) ?? date(r.chargeDate),
    remind,
    category,
    icon: sanitizeIcon(r.icon, name),
    url,
    notes: notes ? notes.slice(0, 600) : null,
    archivedAt,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
  }
}

export function sanitizeList(raw: unknown, today = localYmd()): Sub[] {
  if (!Array.isArray(raw)) return []
  const out: Sub[] = []
  const seen = new Set<number>()
  let next = 1
  for (const item of raw) {
    while (seen.has(next)) next++
    const s = sanitizeSub(item, next, today)
    if (!s) continue
    if (seen.has(s.id)) s.id = Math.max(...seen) + 1
    seen.add(s.id)
    out.push(s)
  }
  return out
}

export function sanitizeSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return defaultSettings
  const s = raw as Record<string, unknown>
  const pick = <T>(v: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(v as T) ? (v as T) : fallback
  const currency = typeof s.currency === 'string' ? s.currency.toUpperCase() : ''
  return {
    lang: pick(s.lang, ['system', 'ru', 'en'] as const, 'system'),
    remindHour:
      Number.isInteger(s.remindHour) &&
      (s.remindHour as number) >= 0 &&
      (s.remindHour as number) < 24
        ? (s.remindHour as number)
        : 10,
    defaultRemind: 'defaultRemind' in s ? pick(s.defaultRemind, REMIND_OPTIONS, 1) : 1,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : defaultSettings.currency,
    autoIcons: typeof s.autoIcons === 'boolean' ? s.autoIcons : true,
    profileName:
      typeof s.profileName === 'string' && s.profileName.trim()
        ? s.profileName.trim().slice(0, 40)
        : null,
    // Settings saved by an older version mean the person has used the app already.
    onboarded: typeof s.onboarded === 'boolean' ? s.onboarded : true,
  }
}

export function nextId(subs: Sub[]): number {
  return subs.reduce((max, s) => Math.max(max, s.id), 0) + 1
}

async function readJson(key: string): Promise<unknown> {
  const { value } = await Preferences.get({ key })
  if (!value) return undefined
  try {
    return JSON.parse(value)
  } catch (err) {
    console.error(`SubShelf: ${key} is unreadable`, err)
    return undefined
  }
}

/** Loads v2; on first run after the update migrates v1 and writes v2 (v1 stays as a backup). */
export async function loadSubs(): Promise<Sub[]> {
  const v2 = await readJson(SUBS_KEY)
  if (v2 !== undefined) return sanitizeList(v2)
  const v1 = await readJson(SUBS_KEY_V1)
  if (v1 === undefined) return []
  const migrated = sanitizeList(v1)
  await saveSubs(migrated)
  return migrated
}

export async function saveSubs(subs: Sub[]): Promise<void> {
  await Preferences.set({ key: SUBS_KEY, value: JSON.stringify(subs) })
}

export async function loadSettings(): Promise<Settings> {
  const v2 = await readJson(SETTINGS_KEY)
  if (v2 !== undefined) return sanitizeSettings(v2)
  const v1 = await readJson(SETTINGS_KEY_V1)
  return sanitizeSettings(v1)
}

export async function saveSettings(s: Settings): Promise<void> {
  await Preferences.set({ key: SETTINGS_KEY, value: JSON.stringify(s) })
}

export function exportJson(subs: Sub[]): string {
  return JSON.stringify(
    { app: 'subshelf', version: 2, exportedAt: new Date().toISOString(), subscriptions: subs },
    null,
    2,
  )
}

/** Accepts v1 and v2 exports or a bare array. Throws when nothing usable is inside. */
export function importJson(text: string): Sub[] {
  const data: unknown = JSON.parse(text)
  const list = Array.isArray(data)
    ? data
    : (data as { subscriptions?: unknown } | null)?.subscriptions
  const subs = sanitizeList(list)
  if (subs.length === 0) throw new Error('empty backup')
  return subs
}

/** CSV for spreadsheets (Excel, Numbers, Google Sheets). Semicolons keep commas in prices safe. */
export function exportCsv(subs: Sub[]): string {
  const cell = (v: string | number | null) => {
    const t = v === null ? '' : String(v)
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const head = [
    'name',
    'status',
    'price',
    'currency',
    'cycle',
    'next_date',
    'category',
    'archived_at',
    'notes',
  ]
  const rows = subs.map((s) =>
    [
      s.name,
      s.status,
      s.price,
      s.currency,
      s.cycle,
      s.nextDate,
      s.category,
      s.url,
      s.archivedAt,
      s.notes,
    ]
      .map(cell)
      .join(';'),
  )
  return '\ufeff' + [head.join(';'), ...rows].join('\r\n')
}

/** What Pro rests on. Store state is a cache of the last answer from RevenueCat. */
export interface ProStore {
  /** Had data before Pro existed: keeps everything for free. */
  founder: boolean
  /** Direct APK license key as typed. */
  license: string | null
  /** Simulated purchase in the browser preview. */
  demo: boolean
  store: StoreEntitlement | null
}

export type PlanId = 'monthly' | 'yearly' | 'lifetime'

export interface StoreEntitlement {
  plan: PlanId | null
  /** Expiration day (YYYY-MM-DD); null for lifetime. */
  until: string | null
  willRenew: boolean
  trial: boolean
}

export const emptyPro: ProStore = { founder: false, license: null, demo: false, store: null }

export function sanitizePro(raw: unknown): ProStore {
  if (!raw || typeof raw !== 'object') return emptyPro
  const r = raw as Record<string, unknown>
  const st = r.store && typeof r.store === 'object' ? (r.store as Record<string, unknown>) : null
  return {
    founder: r.founder === true,
    license: typeof r.license === 'string' && r.license ? r.license.slice(0, 200) : null,
    demo: r.demo === true,
    store: st
      ? {
          plan: (['monthly', 'yearly', 'lifetime'] as const).includes(st.plan as PlanId)
            ? (st.plan as PlanId)
            : null,
          until: isValidYmd(st.until) ? st.until : null,
          willRenew: st.willRenew === true,
          trial: st.trial === true,
        }
      : null,
  }
}

/** null when Pro was never saved: the first launch of this version. */
export async function loadPro(): Promise<ProStore | null> {
  const raw = await readJson(PRO_KEY)
  return raw === undefined ? null : sanitizePro(raw)
}

export async function savePro(p: ProStore): Promise<void> {
  await Preferences.set({ key: PRO_KEY, value: JSON.stringify(p) })
}
