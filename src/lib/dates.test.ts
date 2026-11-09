import { describe, expect, it } from 'vitest'
import {
  addCycleN,
  daysUntil,
  isValidYmd,
  mainCurrency,
  monthlyByCurrency,
  monthlyCost,
  nextCharge,
  upcomingCharges,
  type Sub,
} from './dates'

const sub = (over: Partial<Sub>): Sub => ({
  id: 1,
  name: 'Test',
  status: 'active',
  price: 10,
  currency: 'USD',
  cycle: 'monthly',
  nextDate: '2026-10-01',
  remind: 1,
  category: 'other',
  icon: { kind: 'monogram' },
  url: null,
  notes: null,
  archivedAt: null,
  createdAt: 0,
  ...over,
})

describe('dates', () => {
  it('validates real calendar dates only', () => {
    expect(isValidYmd('2026-02-28')).toBe(true)
    expect(isValidYmd('2026-02-30')).toBe(false)
    expect(isValidYmd('26-2-1')).toBe(false)
  })

  it('counts days across month ends', () => {
    expect(daysUntil('2026-11-01', '2026-10-30')).toBe(2)
    expect(daysUntil('2026-10-01', '2026-10-08')).toBe(-7)
  })

  it('clamps month ends without drifting', () => {
    expect(addCycleN('2026-01-31', 'monthly', 1)).toBe('2026-02-28')
    expect(addCycleN('2026-01-31', 'monthly', 2)).toBe('2026-03-31')
    expect(addCycleN('2028-02-29', 'yearly', 1)).toBe('2029-02-28')
    expect(addCycleN('2026-10-01', 'weekly', 2)).toBe('2026-10-15')
  })

  it('rolls active subscriptions forward to the next charge', () => {
    expect(nextCharge(sub({}), '2026-10-08')).toEqual({ date: '2026-11-01', overdue: false })
    expect(nextCharge(sub({}), '2026-10-01')).toEqual({ date: '2026-10-01', overdue: false })
  })

  it('reports trials as overdue once the date passed', () => {
    const t = sub({ status: 'trial', nextDate: '2026-10-10' })
    expect(nextCharge(t, '2026-10-08')).toEqual({ date: '2026-10-10', overdue: false })
    expect(nextCharge(t, '2026-10-12')).toEqual({ date: '2026-10-10', overdue: true })
    expect(upcomingCharges(t, '2026-10-12', 2)).toEqual([])
  })

  it('never charges archived subscriptions', () => {
    expect(nextCharge(sub({ archivedAt: '2026-10-02' }), '2026-10-08')).toBeNull()
    expect(upcomingCharges(sub({ archivedAt: '2026-10-02' }), '2026-10-08', 2)).toEqual([])
  })

  it('lists several upcoming charges for reminders', () => {
    expect(upcomingCharges(sub({}), '2026-10-08', 2)).toEqual(['2026-11-01', '2026-12-01'])
  })

  it('normalises prices to a month and groups by currency', () => {
    expect(monthlyCost(sub({ cycle: 'yearly', price: 120 }))).toBe(10)
    expect(monthlyCost(sub({ price: null }))).toBe(0)
    const totals = monthlyByCurrency(
      [sub({ price: 5 }), sub({ price: 649, currency: 'RUB' }), sub({ price: 3 })],
      () => true,
    )
    expect(totals.get('USD')).toBe(8)
    expect(mainCurrency(totals)).toBe('USD')
    expect(
      mainCurrency(
        new Map([
          ['RUB', 649],
          ['EUR', 5],
        ]),
      ),
    ).toBe('RUB')
  })
})

describe('fmtDay', () => {
  it('adds the year only when it is not the current one', async () => {
    const { fmtDay } = await import('./dates')
    expect(fmtDay('2026-11-09', 'ru-RU', '2026-01-01')).toBe('9 ноября')
    expect(fmtDay('2027-11-09', 'ru-RU', '2026-01-01')).toBe('9 ноября 2027')
    expect(fmtDay('2027-11-09', 'en-US', '2026-01-01')).toBe('November 9, 2027')
  })
})
