import { addCycleN, monthlyCost, parseYmd, toYmd, type Category, type Sub } from './dates'

/** One charge on a calendar day. */
export interface Charge {
  sub: Sub
  date: string
  amount: number
  /** The first payment after a trial (happens only if the trial is not cancelled). */
  trial: boolean
}

export const monthStart = (ymd: string) => `${ymd.slice(0, 7)}-01`

export function shiftMonth(first: string, n: number): string {
  const d = parseYmd(first)
  return toYmd(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)))
}

/**
 * Every charge in [from, to). Active subscriptions repeat on their cycle (also before the stored
 * date, so a month shows all its payments); a trial charges once, on the day it ends.
 */
export function chargesBetween(subs: Sub[], from: string, to: string, currency?: string): Charge[] {
  const out: Charge[] = []
  for (const s of subs) {
    if (s.archivedAt || !s.nextDate || s.price == null) continue
    if (currency && s.currency !== currency) continue
    if (s.status === 'trial') {
      if (s.nextDate >= from && s.nextDate < to) {
        out.push({ sub: s, date: s.nextDate, amount: s.price, trial: true })
      }
      continue
    }
    let n = 0
    while (n > -1000 && addCycleN(s.nextDate, s.cycle, n - 1) >= from) n--
    for (let guard = 0; guard < 1000; guard++, n++) {
      const date = addCycleN(s.nextDate, s.cycle, n)
      if (date >= to) break
      if (date >= from) out.push({ sub: s, date, amount: s.price, trial: false })
    }
  }
  return out.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.sub.name.localeCompare(b.sub.name),
  )
}

export interface MonthBucket {
  /** First day of the month, YYYY-MM-01. */
  month: string
  /** Paid subscriptions only. */
  total: number
  charges: Charge[]
}

/** The next `months` calendar months, starting with the current one, in one currency. */
export function forecast(
  subs: Sub[],
  today: string,
  months: number,
  currency: string,
): MonthBucket[] {
  const first = monthStart(today)
  const all = chargesBetween(subs, first, shiftMonth(first, months), currency)
  return Array.from({ length: months }, (_, i) => {
    const month = shiftMonth(first, i)
    const next = shiftMonth(first, i + 1)
    const charges = all.filter((c) => c.date >= month && c.date < next)
    const total = charges.filter((c) => !c.trial).reduce((sum, c) => sum + c.amount, 0)
    return { month, total, charges }
  })
}

export interface CategoryShare {
  category: Category
  monthly: number
  share: number
  count: number
}

/** Where the money goes: monthly cost of active subscriptions per category, largest first. */
export function byCategory(subs: Sub[], currency: string): CategoryShare[] {
  const map = new Map<Category, { monthly: number; count: number }>()
  for (const s of subs) {
    if (s.archivedAt || s.status !== 'active' || s.price == null || s.currency !== currency)
      continue
    const cur = map.get(s.category) ?? { monthly: 0, count: 0 }
    map.set(s.category, { monthly: cur.monthly + monthlyCost(s), count: cur.count + 1 })
  }
  const total = [...map.values()].reduce((a, v) => a + v.monthly, 0)
  return [...map.entries()]
    .map(([category, v]) => ({ category, ...v, share: total ? v.monthly / total : 0 }))
    .filter((c) => c.monthly > 0)
    .sort((a, b) => b.monthly - a.monthly)
}

/** Most expensive active subscriptions by monthly cost. */
export function topExpensive(subs: Sub[], currency: string, n = 5): Sub[] {
  return subs
    .filter((s) => !s.archivedAt && s.status === 'active' && s.price && s.currency === currency)
    .sort((a, b) => monthlyCost(b) - monthlyCost(a))
    .slice(0, n)
}

/** What live trials will cost per month if nobody cancels them. */
export function trialsMonthly(subs: Sub[], currency: string): number {
  return subs
    .filter((s) => !s.archivedAt && s.status === 'trial' && s.currency === currency)
    .reduce((sum, s) => sum + monthlyCost(s), 0)
}

/** Currencies of live priced subscriptions other than the one the overview counts in. */
export function otherCurrencies(subs: Sub[], currency: string): string[] {
  const set = new Set<string>()
  for (const s of subs)
    if (!s.archivedAt && s.price != null && s.currency !== currency) set.add(s.currency)
  return [...set].sort()
}
