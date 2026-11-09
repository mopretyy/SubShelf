import { Capacitor } from '@capacitor/core'

/**
 * Where this build is distributed. It decides how Pro is sold:
 * - play / appstore: store billing through RevenueCat (store rules forbid anything else);
 * - direct: APK from GitHub Releases, Pro is unlocked with an offline license key;
 * - web: browser preview, purchases are simulated.
 */
export type Channel = 'play' | 'appstore' | 'direct' | 'web'

const env = import.meta.env

/** iOS is always the App Store. Android is Google Play unless the build asks for the direct APK. */
function resolveChannel(): Channel {
  const platform = Capacitor.getPlatform()
  if (platform === 'ios') return 'appstore'
  if (platform === 'android') return env.VITE_STORE === 'direct' ? 'direct' : 'play'
  return 'web'
}

export const CHANNEL: Channel = resolveChannel()

/** RevenueCat public SDK key for the current platform (safe to ship in the app). */
export const RC_KEY: string =
  (Capacitor.getPlatform() === 'ios' ? env.VITE_RC_IOS_KEY : env.VITE_RC_ANDROID_KEY) ?? ''

/** Hex Ed25519 public key that verifies license keys of the direct APK. */
export const LICENSE_PUBKEY: string = env.VITE_LICENSE_PUBKEY ?? ''

/** Where direct-APK users buy a license key (Telegram, Boosty, a site…). */
export const BUY_URL: string = env.VITE_BUY_URL ?? ''

export const SUPPORT_EMAIL: string = env.VITE_SUPPORT_EMAIL ?? ''

export const PRIVACY_URL: string =
  env.VITE_PRIVACY_URL || 'https://github.com/mopretyy/SubShelf/blob/main/docs/PRIVACY.md'

export const TERMS_URL: string =
  env.VITE_TERMS_URL || 'https://github.com/mopretyy/SubShelf/blob/main/docs/TERMS.md'

/** Store pages where people manage or cancel what they bought. */
export const MANAGE_URL: Record<'play' | 'appstore', string> = {
  play: 'https://play.google.com/store/account/subscriptions',
  appstore: 'https://apps.apple.com/account/subscriptions',
}

/** RevenueCat entitlement that unlocks Pro. */
export const ENTITLEMENT = 'pro'

/** How many live subscriptions (trials + active) the free plan keeps. */
export const FREE_LIMIT = 5
