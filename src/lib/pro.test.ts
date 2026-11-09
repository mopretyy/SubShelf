import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { ed25519 } from '@noble/curves/ed25519.js'

vi.mock('@capacitor/preferences', () => ({ Preferences: { get: vi.fn(), set: vi.fn() } }))

const { encodePayload, readLicense, licenseActive, toBase64Url, LICENSE_PREFIX } =
  await import('./license')
const { effectivePro, canAdd, liveCount, FREE } = await import('./pro')
const { emptyPro, sanitizePro } = await import('./store')
const { FREE_LIMIT } = await import('./config')

const TODAY = '2026-11-09'
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

function issue(secret: Uint8Array, until: string | null, id = 42) {
  const payload = encodePayload({ id, plan: 'pro', until })
  const sig = ed25519.sign(payload, secret)
  const raw = new Uint8Array(payload.length + sig.length)
  raw.set(payload)
  raw.set(sig, payload.length)
  return LICENSE_PREFIX + toBase64Url(raw)
}

describe('license keys', () => {
  const { secretKey, publicKey } = ed25519.keygen()
  const pub = hex(publicKey)

  it('accepts a genuine key and reads its terms', () => {
    expect(readLicense(issue(secretKey, null), pub)).toEqual({ id: 42, plan: 'pro', until: null })
    const dated = readLicense(issue(secretKey, '2027-11-09', 7), pub)!
    expect(dated).toEqual({ id: 7, plan: 'pro', until: '2027-11-09' })
    expect(licenseActive(dated, TODAY)).toBe(true)
    expect(licenseActive(dated, '2027-11-10')).toBe(false)
  })

  it('tolerates pasting noise but rejects forgeries', () => {
    const key = issue(secretKey, null)
    expect(readLicense(`  ${key.slice(0, 30)}\n${key.slice(30)} `, pub)).not.toBeNull()
    expect(readLicense(key.replace(LICENSE_PREFIX, 'subshelf-'), pub)).not.toBeNull()
    const other = ed25519.keygen()
    expect(readLicense(issue(other.secretKey, null), pub)).toBeNull()
    const tampered = key.slice(0, -3) + (key.endsWith('AAA') ? 'BBB' : 'AAA')
    expect(readLicense(tampered, pub)).toBeNull()
    expect(readLicense('SUBSHELF-hello', pub)).toBeNull()
    expect(readLicense(key, 'not-hex')).toBeNull()
  })

  it('verifies keys issued by scripts/license.mjs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'subshelf-'))
    const keyFile = join(dir, 'test.key')
    const run = (...args: string[]) =>
      execFileSync('node', ['scripts/license.mjs', ...args, '--key', keyFile], { encoding: 'utf8' })
    const pubHex = run('keygen').trim().split('\n').pop()!
    const forever = run('issue', '--note', 'test').trim()
    const yearly = run('issue', '--until', '2027-01-31').trim()
    expect(readLicense(forever, pubHex)?.until).toBeNull()
    expect(readLicense(yearly, pubHex)?.until).toBe('2027-01-31')
    expect(run('check', yearly)).toContain('until 2027-01-31')
  })
})

describe('Pro rules', () => {
  const sub = (id: number, archived = false) =>
    ({ id, name: `S${id}`, archivedAt: archived ? '2026-01-01' : null }) as never

  it('counts only live subscriptions against the free limit', () => {
    const list = [...Array.from({ length: FREE_LIMIT - 1 }, (_, i) => sub(i + 1)), sub(99, true)]
    expect(liveCount(list)).toBe(FREE_LIMIT - 1)
    expect(canAdd(list, FREE)).toBe(true)
    const full = [...list, sub(100)]
    expect(canAdd(full, FREE)).toBe(false)
    expect(canAdd(full, { ...FREE, active: true })).toBe(true)
  })

  it('honours store entitlements with a short grace for renewals', () => {
    const store = { plan: 'yearly' as const, until: '2026-11-08', willRenew: true, trial: false }
    expect(effectivePro({ ...emptyPro, store }, 'play', '', TODAY).active).toBe(true)
    expect(
      effectivePro({ ...emptyPro, store: { ...store, willRenew: false } }, 'play', '', TODAY)
        .active,
    ).toBe(false)
    expect(
      effectivePro({ ...emptyPro, store: { ...store, until: '2026-11-01' } }, 'play', '', TODAY)
        .active,
    ).toBe(false)
    const lifetime = { plan: 'lifetime' as const, until: null, willRenew: false, trial: false }
    expect(effectivePro({ ...emptyPro, store: lifetime }, 'appstore', '', TODAY).source).toBe(
      'store',
    )
  })

  it('uses license keys only in the direct APK and the demo only on the web', () => {
    const { secretKey, publicKey } = ed25519.keygen()
    const p = { ...emptyPro, license: issue(secretKey, null), demo: true }
    expect(effectivePro(p, 'direct', hex(publicKey), TODAY).source).toBe('license')
    expect(effectivePro(p, 'play', hex(publicKey), TODAY).active).toBe(false)
    expect(effectivePro(p, 'web', hex(publicKey), TODAY).source).toBe('demo')
    expect(effectivePro({ ...emptyPro, founder: true }, 'appstore', '', TODAY).source).toBe(
      'founder',
    )
  })

  it('sanitises stored Pro state', () => {
    expect(sanitizePro(null)).toEqual(emptyPro)
    expect(
      sanitizePro({ founder: 'yes', store: { plan: 'weird', until: 'x', willRenew: true } }),
    ).toEqual({
      founder: false,
      license: null,
      demo: false,
      store: { plan: null, until: null, willRenew: true, trial: false },
    })
  })
})
