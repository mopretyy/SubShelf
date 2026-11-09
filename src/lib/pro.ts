import { FREE_LIMIT, type Channel } from './config'
import { addDays, type Sub } from './dates'
import { licenseActive, readLicense } from './license'
import type { PlanId, ProStore } from './store'

export type ProSource = 'founder' | 'store' | 'license' | 'demo'

export interface Pro {
  active: boolean
  source: ProSource | null
  plan: PlanId | null
  /** Last paid day (YYYY-MM-DD), null = forever or unknown. */
  until: string | null
  willRenew: boolean
  trial: boolean
}

export const FREE: Pro = {
  active: false,
  source: null,
  plan: null,
  until: null,
  willRenew: false,
  trial: false,
}

/**
 * What the person actually has. Store purchases count everywhere they were made; a license key
 * only in the direct APK (store rules forbid unlocking with outside payments); the demo only in
 * the browser preview.
 */
export function effectivePro(p: ProStore, channel: Channel, pubkey: string, today: string): Pro {
  const st = p.store
  // A renewing subscription stays on for a few days while the store retries the charge offline.
  if (st && (st.until === null || st.until >= addDays(today, st.willRenew ? -3 : 0))) {
    return {
      active: true,
      source: 'store',
      plan: st.plan,
      until: st.until,
      willRenew: st.willRenew,
      trial: st.trial,
    }
  }
  if (channel === 'direct' && p.license && pubkey) {
    const l = readLicense(p.license, pubkey)
    if (l && licenseActive(l, today)) {
      return {
        ...FREE,
        active: true,
        source: 'license',
        plan: l.until ? null : 'lifetime',
        until: l.until,
      }
    }
  }
  if (p.founder) return { ...FREE, active: true, source: 'founder', plan: 'lifetime' }
  if (channel === 'web' && p.demo) return { ...FREE, active: true, source: 'demo', plan: 'yearly' }
  return FREE
}

/** Trials and active subscriptions: what the free limit counts. History is free and unlimited. */
export const liveCount = (subs: Sub[]) => subs.filter((s) => !s.archivedAt).length

export const canAdd = (subs: Sub[], pro: Pro) => pro.active || liveCount(subs) < FREE_LIMIT

/** Pro-only features, so the paywall can say what was tapped. */
export type Feature = 'limit' | 'insights' | 'calendar' | 'csv'
