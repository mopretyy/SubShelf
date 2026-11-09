import { ed25519 } from '@noble/curves/ed25519.js'
import { addDays } from './dates'

/**
 * Offline license keys for the direct APK (no server, nothing leaves the phone).
 *
 * Key = "SUBSHELF-" + base64url(payload ‖ signature)
 * payload (8 bytes): version u8 = 1 · plan u8 (1 = pro) · expiry u16 (days since 2024-01-01, 0 = forever) · id u32
 * signature: Ed25519 over the payload with the seller's private key (scripts/license.mjs).
 */
export interface License {
  id: number
  plan: 'pro'
  /** Last day the key works (YYYY-MM-DD), null = forever. */
  until: string | null
}

export const LICENSE_PREFIX = 'SUBSHELF-'
const EPOCH = '2024-01-01'
const PAYLOAD = 8
const SIG = 64

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase()
  if (!/^([0-9a-f]{2})+$/.test(clean)) throw new Error('bad hex')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export function encodePayload(l: License): Uint8Array {
  const p = new Uint8Array(PAYLOAD)
  const view = new DataView(p.buffer)
  view.setUint8(0, 1)
  view.setUint8(1, 1)
  const days = l.until ? Math.round((Date.parse(l.until) - Date.parse(EPOCH)) / 86_400_000) : 0
  view.setUint16(2, Math.max(0, Math.min(65_535, days)))
  view.setUint32(4, l.id >>> 0)
  return p
}

function decodePayload(p: Uint8Array): License | null {
  const view = new DataView(p.buffer, p.byteOffset, p.byteLength)
  if (view.getUint8(0) !== 1 || view.getUint8(1) !== 1) return null
  const days = view.getUint16(2)
  return { id: view.getUint32(4), plan: 'pro', until: days ? addDays(EPOCH, days) : null }
}

/** Normalises whatever the user pasted: spaces, line breaks, missing or lower-case prefix. */
export function cleanKey(text: string): string {
  const s = text.replace(/\s+/g, '')
  return s.toUpperCase().startsWith(LICENSE_PREFIX) ? s.slice(LICENSE_PREFIX.length) : s
}

/** Verifies the signature. Returns the license (possibly expired) or null when the key is not genuine. */
export function readLicense(text: string, pubkeyHex: string): License | null {
  try {
    const raw = fromBase64Url(cleanKey(text))
    if (raw.length !== PAYLOAD + SIG) return null
    const payload = raw.slice(0, PAYLOAD)
    const sig = raw.slice(PAYLOAD)
    if (!ed25519.verify(sig, payload, hexToBytes(pubkeyHex))) return null
    return decodePayload(payload)
  } catch {
    return null
  }
}

export const licenseActive = (l: License, today: string) => l.until === null || l.until >= today
