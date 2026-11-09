import { describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/preferences', () => ({ Preferences: { get: vi.fn(), set: vi.fn() } }))

const { importJson, sanitizeList, sanitizeSettings, sanitizeSub } = await import('./store')
const { matchCatalog, searchCatalog } = await import('./catalog')
const { guessDomains } = await import('./icons')

const TODAY = '2026-10-09'

describe('v1 → v2 migration', () => {
  it('maps chargeDate to nextDate and drops startDate', () => {
    const s = sanitizeSub(
      {
        id: 3,
        name: 'Netflix',
        status: 'active',
        chargeDate: '2026-10-20',
        startDate: '2026-01-01',
      },
      1,
      TODAY,
    )!
    expect(s.nextDate).toBe('2026-10-20')
    expect('startDate' in s).toBe(false)
    expect(s.archivedAt).toBeNull()
    expect(s.remind).toBe(1)
  })

  it('moves cancelled subscriptions to history', () => {
    const a = sanitizeSub({ name: 'A', status: 'cancelled', cancelledAt: '2026-09-01' }, 1, TODAY)!
    expect(a.archivedAt).toBe('2026-09-01')
    expect(a.status).toBe('active')
    const b = sanitizeSub({ name: 'B', status: 'cancelled' }, 2, TODAY)!
    expect(b.archivedAt).toBe(TODAY)
  })

  it('keeps an old cancel link inside the notes', () => {
    const s = sanitizeSub({ name: 'X', notes: 'Семейный', cancelUrl: 'https://x.com/c' }, 1, TODAY)!
    expect(s.notes).toBe('Семейный\nСсылка для отмены: https://x.com/c')
    const t = sanitizeSub({ name: 'Y', cancelUrl: 'https://y.com' }, 1, TODAY)!
    expect(t.notes).toBe('Ссылка для отмены: https://y.com')
  })

  it('picks a catalog icon for known names without network', () => {
    expect(sanitizeSub({ name: 'Netflix' }, 1, TODAY)!.icon).toEqual({
      kind: 'catalog',
      domain: 'netflix.com',
    })
    expect(sanitizeSub({ name: 'Моя качалка' }, 1, TODAY)!.icon).toEqual({ kind: 'monogram' })
  })

  it('keeps valid v2 data as is and rejects junk', () => {
    const v2 = {
      id: 7,
      name: 'Aqua Voice',
      status: 'trial',
      price: 10,
      currency: 'usd',
      cycle: 'monthly',
      nextDate: '2026-10-10',
      remind: null,
      icon: { kind: 'remote', domain: 'aquavoice.com' },
      notes: null,
      archivedAt: null,
      createdAt: 5,
    }
    const s = sanitizeSub(v2, 1, TODAY)!
    expect(s).toMatchObject({ id: 7, status: 'trial', currency: 'USD', remind: null })
    expect(s.icon).toEqual({ kind: 'remote', domain: 'aquavoice.com', data: undefined })
    expect(sanitizeSub({ name: '  ' }, 1, TODAY)).toBeNull()
    expect(sanitizeSub(null, 1, TODAY)).toBeNull()
    expect(sanitizeSub({ name: 'Z', price: -5, nextDate: '2026-02-30' }, 1, TODAY)).toMatchObject({
      price: null,
      nextDate: null,
    })
  })

  it('dedupes ids and imports both export versions', () => {
    const list = sanitizeList([{ id: 1, name: 'A' }, { id: 1, name: 'B' }, 'junk'], TODAY)
    expect(list.map((s) => s.id)).toEqual([1, 2])
    expect(importJson(JSON.stringify({ version: 1, subscriptions: [{ name: 'A' }] }))).toHaveLength(
      1,
    )
    expect(() => importJson('[]')).toThrow()
  })

  it('fills new settings with defaults', () => {
    expect(sanitizeSettings({ theme: 'dark', refraction: true, remindHour: 9 })).toEqual({
      lang: 'system',
      remindHour: 9,
      defaultRemind: 1,
      currency: 'USD',
      autoIcons: true,
      profileName: null,
      onboarded: true,
    })
  })
})

describe('icons', () => {
  it('matches catalog names and aliases', () => {
    expect(matchCatalog('нетфликс')?.domain).toBe('netflix.com')
    expect(matchCatalog('Aqua Voice')?.domain).toBe('aquavoice.com')
    expect(searchCatalog('spo')[0]?.name).toBe('Spotify Premium')
    expect(matchCatalog('x')).toBeNull()
  })

  it('guesses domains for unknown services', () => {
    expect(guessDomains('Super Tool+')).toEqual([
      'supertoolplus.com',
      'supertoolplus.ai',
      'supertoolplus.app',
      'supertoolplus.io',
    ])
    expect(guessDomains('Кинозал')).toEqual([])
  })
})
