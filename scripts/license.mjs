#!/usr/bin/env node
/**
 * SubShelf Pro license keys for the direct APK (offline Ed25519, see src/lib/license.ts).
 *
 *   node scripts/license.mjs keygen [--key subshelf-license.key]
 *   node scripts/license.mjs issue  [--key subshelf-license.key] [--months 12 | --until 2027-12-31] [--note "Ivan, Boosty"]
 *   node scripts/license.mjs pubkey [--key subshelf-license.key]
 *   node scripts/license.mjs check  <KEY> [--key subshelf-license.key | --pub <hex>]
 *
 * The private key file must never be committed or shared. Keep a copy offline:
 * whoever has it can issue keys, and without it you cannot issue new ones.
 */
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
} from 'node:crypto'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const PREFIX = 'SUBSHELF-'
const EPOCH = Date.UTC(2024, 0, 1)
const DAY = 86_400_000

function args(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const next = argv[i + 1]
      out[a.slice(2)] = next && !next.startsWith('--') ? (i++, next) : true
    } else out._.push(a)
  }
  return out
}

const fail = (msg) => {
  console.error(`Error: ${msg}`)
  process.exit(1)
}

const rawPublic = (keyObject) =>
  createPublicKey(keyObject).export({ format: 'der', type: 'spki' }).subarray(-32)

function loadPrivate(path) {
  if (!existsSync(path)) fail(`no private key at ${path}. Run "keygen" first or pass --key.`)
  return createPrivateKey(readFileSync(path))
}

function untilFrom(opts) {
  if (opts.until) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.until)) fail('--until must be YYYY-MM-DD')
    return opts.until
  }
  if (opts.months) {
    const n = Number(opts.months)
    if (!Number.isInteger(n) || n < 1 || n > 120) fail('--months must be 1..120')
    const d = new Date()
    const until = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()))
    return until.toISOString().slice(0, 10)
  }
  return null
}

function payload(id, until) {
  const p = Buffer.alloc(8)
  p.writeUInt8(1, 0)
  p.writeUInt8(1, 1)
  const days = until ? Math.round((Date.parse(until) - EPOCH) / DAY) : 0
  if (days < 0 || days > 65_535) fail('expiry date out of range')
  p.writeUInt16BE(days, 2)
  p.writeUInt32BE(id >>> 0, 4)
  return p
}

function decode(key) {
  const s = key.replace(/\s+/g, '')
  const body = s.toUpperCase().startsWith(PREFIX) ? s.slice(PREFIX.length) : s
  const raw = Buffer.from(body, 'base64url')
  if (raw.length !== 72) return null
  return { payload: raw.subarray(0, 8), sig: raw.subarray(8) }
}

const opts = args(process.argv.slice(2))
const cmd = opts._[0]
const keyPath = resolve(typeof opts.key === 'string' ? opts.key : 'subshelf-license.key')

if (cmd === 'keygen') {
  if (existsSync(keyPath)) fail(`${keyPath} already exists, refusing to overwrite it.`)
  const { privateKey } = generateKeyPairSync('ed25519')
  writeFileSync(keyPath, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 })
  console.log(`Private key saved to ${keyPath} (keep it secret and back it up offline).`)
  console.log('')
  console.log('Public key (set it as the GitHub variable LICENSE_PUBKEY):')
  console.log(rawPublic(privateKey).toString('hex'))
} else if (cmd === 'pubkey') {
  console.log(rawPublic(loadPrivate(keyPath)).toString('hex'))
} else if (cmd === 'issue') {
  const privateKey = loadPrivate(keyPath)
  const until = untilFrom(opts)
  const id = randomBytes(4).readUInt32BE(0) || 1
  const p = payload(id, until)
  const key = PREFIX + Buffer.concat([p, sign(null, p, privateKey)]).toString('base64url')
  const note = typeof opts.note === 'string' ? opts.note.replace(/[\r\n,]/g, ' ') : ''
  const log = join(dirname(keyPath), 'subshelf-licenses.csv')
  if (!existsSync(log)) appendFileSync(log, 'issued,id,until,note\n')
  appendFileSync(
    log,
    `${new Date().toISOString().slice(0, 10)},${id},${until ?? 'forever'},${note}\n`,
  )
  console.log(key)
} else if (cmd === 'check') {
  const key = opts._[1]
  if (!key) fail('pass the key: check <KEY>')
  const pub =
    typeof opts.pub === 'string' ? Buffer.from(opts.pub, 'hex') : rawPublic(loadPrivate(keyPath))
  const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pub])
  const d = decode(key)
  const ok = d && verify(null, d.payload, { key: spki, format: 'der', type: 'spki' }, d.sig)
  if (!ok) fail('key is NOT valid for this public key')
  const days = d.payload.readUInt16BE(2)
  const until = days ? new Date(EPOCH + days * DAY).toISOString().slice(0, 10) : 'forever'
  console.log(`valid · id ${d.payload.readUInt32BE(4)} · until ${until}`)
} else {
  console.log(
    readFileSync(new URL(import.meta.url), 'utf8')
      .split('\n')
      .slice(2, 13)
      .join('\n'),
  )
  process.exit(cmd ? 1 : 0)
}
