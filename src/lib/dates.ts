export type Status = 'trial' | 'active'
export type Cycle = 'weekly' | 'monthly' | 'yearly'
/** Days before the charge to remind; null = no reminder. */
export type RemindDays = 0 | 1 | 3 | 7 | null

export const REMIND_OPTIONS: RemindDays[] = [0, 1, 3, 7, null]

export type Category =
  'video' | 'music' | 'ai' | 'work' | 'cloud' | 'games' | 'learning' | 'social' | 'health' | 'other'

export const CATEGORIES: Category[] = [
  'video',
  'music',
  'ai',
  'work',
  'cloud',
  'games',
  'learning',
  'social',
  'health',
  'other',
]

export interface SubIcon {
  kind: 'catalog' | 'remote' | 'monogram'
  /** Service domain used to fetch the icon. */
  domain?: string
  /** Cached icon as a data URL, so the list never hits the network. */
  data?: string
}

export interface Sub {
  id: number
  name: string
  status: Status
  /** Price charged per cycle (after the trial for trials). */
  price: number | null
  currency: string
  cycle: Cycle
  /** trial: the day the trial ends (first charge). active: any known charge date, rolled forward. */
  nextDate: string | null
  remind: RemindDays
  category: Category
  icon: SubIcon
  notes: string | null
  /** Set when the subscription was cancelled: from then on it lives in the history. */
  archivedAt: string | null
  createdAt: number
}

export const YMD = /^\d{4}-\d{2}-\d{2}$/
const DAY = 86_400_000

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function toYmd(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isValidYmd(s: unknown): s is string {
  return typeof s === 'string' && YMD.test(s) && toYmd(parseYmd(s)) === s
}

/** The device's local calendar date. */
export function localYmd(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

export function daysUntil(ymd: string, today: string): number {
  return Math.round((parseYmd(ymd).getTime() - parseYmd(today).getTime()) / DAY)
}

export function addDays(ymd: string, n: number): string {
  return toYmd(new Date(parseYmd(ymd).getTime() + n * DAY))
}

/** n-th occurrence after `base`. Clamps the day (Jan 31 + 1 month = Feb 28/29) without drifting later. */
export function addCycleN(base: string, cycle: Cycle, n: number): string {
  if (cycle === 'weekly') return addDays(base, 7 * n)
  const [y, m, d] = base.split('-').map(Number)
  const total = m - 1 + (cycle === 'monthly' ? 1 : 12) * n
  const ny = y + Math.floor(total / 12)
  const nm = ((total % 12) + 12) % 12
  const dim = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate()
  return toYmd(new Date(Date.UTC(ny, nm, Math.min(d, dim))))
}

/** Upcoming charge dates (today or later), at most `count`. Archived subs and overdue trials yield nothing. */
export function upcomingCharges(s: Sub, today: string, count: number): string[] {
  if (s.archivedAt || !s.nextDate) return []
  if (s.status === 'trial') return daysUntil(s.nextDate, today) >= 0 ? [s.nextDate] : []
  const out: string[] = []
  for (let n = 0; n < 5000 && out.length < count; n++) {
    const date = addCycleN(s.nextDate, s.cycle, n)
    if (daysUntil(date, today) >= 0) out.push(date)
  }
  return out
}

export interface Next {
  date: string
  overdue: boolean
}

/** Next charge, or null when nothing will be charged. A trial past its date is reported as overdue. */
export function nextCharge(s: Sub, today: string): Next | null {
  if (s.archivedAt || !s.nextDate) return null
  if (s.status === 'trial') {
    return { date: s.nextDate, overdue: daysUntil(s.nextDate, today) < 0 }
  }
  const [date] = upcomingCharges(s, today, 1)
  return date ? { date, overdue: false } : null
}

const MONTHLY: Record<Cycle, number> = { weekly: 52 / 12, monthly: 1, yearly: 1 / 12 }

export function monthlyCost(s: Pick<Sub, 'price' | 'cycle'>): number {
  return (s.price ?? 0) * MONTHLY[s.cycle]
}

export function fmtDate(ymd: string, locale: string, long = false): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: long ? 'long' : 'short',
    timeZone: 'UTC',
  }).format(parseYmd(ymd))
}

/** "9 ноября", or "9 ноября 2027" when the year is not the current one. */
export function fmtDay(ymd: string, locale: string, today: string): string {
  const sameYear = ymd.slice(0, 4) === today.slice(0, 4)
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: sameYear ? undefined : 'numeric',
    timeZone: 'UTC',
  })
    .format(parseYmd(ymd))
    .replace(/\s?г\.$/, '')
}

export function fmtMonthYear(ymd: string, locale: string): string {
  const s = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(parseYmd(ymd))
    .replace(/\s?г\.$/, '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function fmtMoney(
  amount: number,
  currency: string,
  locale: string,
  compact = false,
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      notation: compact ? 'compact' : 'standard',
    }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

/** Sum of monthly costs per currency. */
export function monthlyByCurrency(subs: Sub[], filter: (s: Sub) => boolean): Map<string, number> {
  const out = new Map<string, number>()
  for (const s of subs) {
    if (!filter(s) || s.price == null) continue
    out.set(s.currency, (out.get(s.currency) ?? 0) + monthlyCost(s))
  }
  return out
}

/** The currency shown big: the preferred one when present, otherwise the largest total. */
export function mainCurrency(totals: Map<string, number>, preferred = 'USD'): string {
  if (totals.has(preferred) || totals.size === 0) return preferred
  let best = preferred
  let max = -1
  for (const [cur, v] of totals) {
    if (v > max) {
      best = cur
      max = v
    }
  }
  return best
}

export const round2 = (v: number) => Math.round(v * 100) / 100
