import { describe, expect, it, vi } from 'vitest'

vi.mock('@capacitor/preferences', () => ({ Preferences: { get: vi.fn(), set: vi.fn() } }))

const { importJson, sanitizeList, sanitizeSettings, sanitizeSub } = await import('./store')
const { matchCatalog, searchCatalog } = await import('./catalog')

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

  it('moves an old cancel link into the website field', () => {
    const s = sanitizeSub({ name: 'X', notes: 'Семейный', cancelUrl: 'https://x.com/c' }, 1, TODAY)!
    expect(s.url).toBe('https://x.com/c')
    expect(s.notes).toBe('Семейный')
    // v2 parked it at the end of the notes: take it out of there too.
    const t = sanitizeSub(
      { name: 'Y', notes: 'Семейный\nСсылка для отмены: https://y.com/cancel' },
      1,
      TODAY,
    )!
    expect(t.url).toBe('https://y.com/cancel')
    expect(t.notes).toBe('Семейный')
    expect(sanitizeSub({ name: 'Z', url: 'javascript:alert(1)' }, 1, TODAY)!.url).toBeNull()
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
})
