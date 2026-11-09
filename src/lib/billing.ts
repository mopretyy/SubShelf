import type {
  CustomerInfo,
  PurchasesError,
  PurchasesPackage,
  PurchasesStoreProduct,
} from '@revenuecat/purchases-capacitor'
import { CHANNEL, ENTITLEMENT, MANAGE_URL, RC_KEY } from './config'
import { localYmd } from './dates'
import type { PlanId, StoreEntitlement } from './store'

/** One plan as the paywall shows it. Prices come localised from the store. */
export interface Offer {
  id: PlanId
  price: string
  amount: number
  /** Yearly price spread over 12 months, e.g. "$0.83". */
  perMonth: string | null
  trialDays: number | null
  /** Yearly vs twelve monthly payments, whole percent. */
  savePct: number | null
}

export type BuyResult =
  { ok: true; store: StoreEntitlement | null } | { ok: false; cancelled: boolean; message?: string }

export interface Billing {
  /** store: Google Play / App Store · license: direct APK keys · demo: browser preview. */
  kind: 'store' | 'license' | 'demo'
  /** Store billing needs a RevenueCat key in the build. */
  available: boolean
  /** Starts the SDK. Resolves with the current entitlement, or undefined when unknown (offline, no key). */
  init(onChange: (e: StoreEntitlement | null) => void): Promise<StoreEntitlement | null | undefined>
  offers(): Promise<Offer[]>
  buy(id: PlanId): Promise<BuyResult>
  restore(): Promise<StoreEntitlement | null>
  manageUrl(): Promise<string | null>
}

const PLAN_ORDER: PlanId[] = ['yearly', 'monthly', 'lifetime']

function savePct(offers: Offer[]): number | null {
  const y = offers.find((o) => o.id === 'yearly')
  const m = offers.find((o) => o.id === 'monthly')
  if (!y || !m || m.amount <= 0) return null
  const pct = Math.round((1 - y.amount / (m.amount * 12)) * 100)
  return pct >= 5 ? pct : null
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

const UNIT_DAYS: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 }

/** Free trial length: App Store intro offer at 0, or Google Play free phase. */
function trialDays(p: PurchasesStoreProduct): number | null {
  const free = p.defaultOption?.freePhase?.billingPeriod
  if (free) return free.value * (UNIT_DAYS[free.unit] ?? 1)
  const intro = p.introPrice
  if (intro && intro.price === 0) {
    return (
      intro.periodNumberOfUnits * (UNIT_DAYS[intro.periodUnit] ?? 1) * Math.max(1, intro.cycles)
    )
  }
  return null
}

function planOf(id: string): PlanId | null {
  const s = id.toLowerCase()
  if (s.includes('life')) return 'lifetime'
  if (s.includes('year') || s.includes('annual')) return 'yearly'
  if (s.includes('month')) return 'monthly'
  return null
}

function fromInfo(ci: CustomerInfo): StoreEntitlement | null {
  const e = ci.entitlements.active[ENTITLEMENT]
  if (!e || !e.isActive) return null
  return {
    plan: planOf(e.productIdentifier) ?? (e.expirationDate ? null : 'lifetime'),
    until: e.expirationDate ? localYmd(new Date(e.expirationDate)) : null,
    willRenew: e.willRenew,
    trial: e.periodType === 'TRIAL',
  }
}

/** Google Play and App Store through RevenueCat (receipt checks happen on their servers). */
function revenueCat(): Billing {
  const packages = new Map<PlanId, PurchasesPackage>()
  let ready: Promise<void> | null = null
  const sdk = () => import('@revenuecat/purchases-capacitor')

  const configured = async () => {
    if (!RC_KEY) throw new Error('RevenueCat key is missing in this build')
    ready ??= sdk().then(({ Purchases }) => Purchases.configure({ apiKey: RC_KEY }))
    await ready
    return (await sdk()).Purchases
  }

  return {
    kind: 'store',
    available: Boolean(RC_KEY),
    async init(onChange) {
      if (!RC_KEY) return undefined
      try {
        const Purchases = await configured()
        await Purchases.addCustomerInfoUpdateListener((ci) => onChange(fromInfo(ci)))
        const { customerInfo } = await Purchases.getCustomerInfo()
        return fromInfo(customerInfo)
      } catch (err) {
        console.error('SubShelf: billing init failed', err)
        return undefined
      }
    },
    async offers() {
      const Purchases = await configured()
      const { current } = await Purchases.getOfferings()
      packages.clear()
      const out: Offer[] = []
      for (const pkg of current?.availablePackages ?? []) {
        const type = String(pkg.packageType)
        const id: PlanId | null =
          type === 'ANNUAL'
            ? 'yearly'
            : type === 'MONTHLY'
              ? 'monthly'
              : type === 'LIFETIME'
                ? 'lifetime'
                : planOf(pkg.identifier)
        if (!id || packages.has(id)) continue
        packages.set(id, pkg)
        const p = pkg.product
        out.push({
          id,
          price: p.priceString,
          amount: p.price,
          perMonth:
            id === 'yearly' ? (p.pricePerMonthString ?? money(p.price / 12, p.currencyCode)) : null,
          trialDays: id === 'lifetime' ? null : trialDays(p),
          savePct: null,
        })
      }
      out.sort((a, b) => PLAN_ORDER.indexOf(a.id) - PLAN_ORDER.indexOf(b.id))
      const pct = savePct(out)
      return out.map((o) => (o.id === 'yearly' ? { ...o, savePct: pct } : o))
    },
    async buy(id) {
      const pkg = packages.get(id)
      if (!pkg) return { ok: false, cancelled: false }
      try {
        const Purchases = await configured()
        const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg })
        return { ok: true, store: fromInfo(customerInfo) }
      } catch (err) {
        const e = err as Partial<PurchasesError>
        const { PURCHASES_ERROR_CODE } = await sdk()
        const cancelled =
          e.userCancelled === true || e.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
        if (!cancelled) console.error('SubShelf: purchase failed', err)
        return { ok: false, cancelled, message: e.message }
      }
    },
    async restore() {
      const Purchases = await configured()
      const { customerInfo } = await Purchases.restorePurchases()
      return fromInfo(customerInfo)
    },
    async manageUrl() {
      try {
        const Purchases = await configured()
        const { customerInfo } = await Purchases.getCustomerInfo()
        if (customerInfo.managementURL) return customerInfo.managementURL
      } catch {
        // Fall back to the store's own page.
      }
      return CHANNEL === 'appstore' ? MANAGE_URL.appstore : MANAGE_URL.play
    },
  }
}

/** Browser preview: the same paywall with sample prices; nothing is charged. */
function demo(): Billing {
  const usd = (n: number) => money(n, 'USD')
  const offers: Offer[] = [
    {
      id: 'yearly',
      price: usd(9.99),
      amount: 9.99,
      perMonth: usd(0.83),
      trialDays: 7,
      savePct: 58,
    },
    {
      id: 'monthly',
      price: usd(1.99),
      amount: 1.99,
      perMonth: null,
      trialDays: null,
      savePct: null,
    },
    {
      id: 'lifetime',
      price: usd(24.99),
      amount: 24.99,
      perMonth: null,
      trialDays: null,
      savePct: null,
    },
  ]
  return {
    kind: 'demo',
    available: true,
    init: async () => undefined,
    offers: async () => offers,
    buy: async () => {
      await new Promise((r) => setTimeout(r, 700))
      return { ok: true, store: null }
    },
    restore: async () => null,
    manageUrl: async () => null,
  }
}

/** Direct APK: Pro comes from a license key, checked offline (see license.ts). */
function licensed(): Billing {
  return {
    kind: 'license',
    available: true,
    init: async () => undefined,
    offers: async () => [],
    buy: async () => ({ ok: false, cancelled: false }),
    restore: async () => null,
    manageUrl: async () => null,
  }
}

export const billing: Billing =
  CHANNEL === 'web' ? demo() : CHANNEL === 'direct' ? licensed() : revenueCat()
