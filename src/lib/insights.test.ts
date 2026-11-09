import { describe, expect, it, vi } from 'vitest'
import type { Sub } from './dates'

vi.mock('@capacitor/preferences', () => ({ Preferences: { get: vi.fn(), set: vi.fn() } }))

const { byCategory, chargesBetween, forecast, otherCurrencies, topExpensive, trialsMonthly } =
  await import('./insights')
const { exportCsv, guessCurrency, sanitizeSettings, sanitizeSub } = await import('./store')
const { makeI18n, pluralIndex, resolveLang } = await import('./i18n')

const TODAY = '2026-11-09'
const sub = (over: Partial<Sub>): Sub => ({
  id: 1,
  name: 'Test',
  status: 'active',
  price: 10,
  currency: 'USD',
  cycle: 'monthly',
  nextDate: '2026-11-20',
  remind: 1,
  category: 'other',
  icon: { kind: 'monogram' },
  notes: null,
  archivedAt: null,
  createdAt: 0,
  ...over,
})

describe('forecast', () => {
  it('spreads charges over the next 12 months, including earlier days of this month', () => {
    const list = [
      sub({ id: 1, price: 10, nextDate: '2026-11-20' }),
      sub({ id: 2, price: 5, nextDate: '2026-11-25', cycle: 'weekly' }),
      sub({ id: 3, price: 120, nextDate: '2027-03-15', cycle: 'yearly' }),
      sub({ id: 4, price: 3, nextDate: '2026-12-03' }),
    ]
    const months = forecast(list, TODAY, 12, 'USD')
    expect(months).toHaveLength(12)
    expect(months[0].month).toBe('2026-11-01')
    expect(months[11].month).toBe('2027-10-01')
    // November: monthly 10 + weekly on 4, 11, 18, 25 + the monthly-3 on Nov 3.
    expect(months[0].total).toBe(10 + 5 * 4 + 3)
    expect(months[4].charges.some((c) => c.sub.id === 3)).toBe(true)
    const year = months.reduce((a, m) => a + m.total, 0)
    expect(year).toBe(
      10 * 12 +
        120 +
        3 * 12 +
        months.reduce((a, m) => a + m.charges.filter((c) => c.sub.id === 2).length * 5, 0),
    )
  })

  it('shows a trial once on its end day and keeps it out of the totals', () => {
    const list = [sub({ id: 1, status: 'trial', price: 20, nextDate: '2026-11-12' })]
    const [nov] = forecast(list, TODAY, 12, 'USD')
    expect(nov.charges).toHaveLength(1)
    expect(nov.charges[0].trial).toBe(true)
    expect(nov.total).toBe(0)
    expect(trialsMonthly(list, 'USD')).toBe(20)
  })

  it('skips archived, unpriced, undated and other-currency subscriptions', () => {
    const list = [
      sub({ id: 1, archivedAt: '2026-10-01' }),
      sub({ id: 2, price: null }),
      sub({ id: 3, nextDate: null }),
      sub({ id: 4, currency: 'EUR' }),
    ]
    expect(chargesBetween(list, '2026-11-01', '2027-11-01', 'USD')).toHaveLength(0)
    expect(otherCurrencies(list, 'USD')).toEqual(['EUR'])
  })

  it('ranks categories and the most expensive subscriptions by monthly cost', () => {
    const list = [
      sub({ id: 1, name: 'Netflix', category: 'video', price: 15 }),
      sub({ id: 2, name: 'Adobe', category: 'work', price: 240, cycle: 'yearly' }),
      sub({ id: 3, name: 'YouTube', category: 'video', price: 14 }),
      sub({ id: 4, name: 'Trial', category: 'ai', price: 20, status: 'trial' }),
    ]
    const cats = byCategory(list, 'USD')
    expect(cats.map((c) => c.category)).toEqual(['video', 'work'])
    expect(cats[0].monthly).toBe(29)
    expect(cats[0].share + cats[1].share).toBeCloseTo(1)
    expect(topExpensive(list, 'USD', 2).map((s) => s.name)).toEqual(['Adobe', 'Netflix'])
  })
})

describe('store additions', () => {
  it('fills a category from the catalog for old data', () => {
    expect(sanitizeSub({ name: 'Netflix' }, 1, TODAY)!.category).toBe('video')
    expect(sanitizeSub({ name: 'Something odd' }, 1, TODAY)!.category).toBe('other')
    expect(sanitizeSub({ name: 'Netflix', category: 'work' }, 1, TODAY)!.category).toBe('work')
    expect(sanitizeSub({ name: 'Netflix', category: 'nope' }, 1, TODAY)!.category).toBe('video')
  })

  it('migrates old settings: drops theme and accent, skips onboarding', () => {
    const s = sanitizeSettings({ theme: 'dark', accent: 'pink', surface: 'glass', remindHour: 9 })
    expect('theme' in s).toBe(false)
    expect('accent' in s).toBe(false)
    expect(s.remindHour).toBe(9)
    expect(s.onboarded).toBe(true)
    expect(sanitizeSettings({ currency: 'eur' }).currency).toBe('EUR')
  })

  it('guesses the currency from the device region', () => {
    expect(guessCurrency('ru-RU')).toBe('RUB')
    expect(guessCurrency('ro-MD')).toBe('MDL')
    expect(guessCurrency('de-DE')).toBe('EUR')
    expect(guessCurrency('en')).toBe('USD')
  })

  it('exports CSV that spreadsheets open correctly', () => {
    const csv = exportCsv([sub({ name: 'A; "B"', notes: 'line1\nline2' })])
    expect(csv.startsWith('﻿name;status;price')).toBe(true)
    expect(csv).toContain('"A; ""B"""')
    expect(csv).toContain('"line1\nline2"')
  })
})

describe('i18n', () => {
  it('picks Russian plural forms', () => {
    expect([1, 2, 5, 11, 21, 22, 25, 111].map((n) => pluralIndex('ru', n))).toEqual([
      0, 1, 2, 2, 0, 1, 2, 2,
    ])
    const { t } = makeI18n('ru')
    expect(t('whenIn', { n: 1 })).toBe('через 1 день')
    expect(t('whenIn', { n: 3 })).toBe('через 3 дня')
    expect(t('whenIn', { n: 12 })).toBe('через 12 дней')
    expect(makeI18n('en').t('whenIn', { n: 1 })).toBe('in 1 day')
  })

  it('has every key in both languages and falls back to English abroad', () => {
    expect(resolveLang('ru')).toBe('ru')
    expect(resolveLang('en')).toBe('en')
    const ru = makeI18n('ru')
    const en = makeI18n('en')
    expect(ru.t('pwTitle')).not.toBe(en.t('pwTitle'))
  })
})
