import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { billing, type Offer } from '@/lib/billing'
import { BUY_URL, CHANNEL, FREE_LIMIT, LICENSE_PUBKEY, PRIVACY_URL, TERMS_URL } from '@/lib/config'
import { fmtDate } from '@/lib/dates'
import { useI18n, type Key } from '@/lib/i18n'
import { haptic, openUrl } from '@/lib/native'
import type { Feature, Pro } from '@/lib/pro'
import type { PlanId, StoreEntitlement } from '@/lib/store'
import { cn } from '@/lib/cn'
import { LogoGlyph } from './Logo'
import { Sheet } from './Sheet'

export type LicenseResult = { ok: true } | { ok: false; expired: string | null }

type Load = 'idle' | 'loading' | 'ready' | 'error'

export function Paywall({
  open,
  feature,
  pro,
  onClose,
  onStore,
  onDemo,
  onLicense,
  notify,
}: {
  open: boolean
  feature: Feature | null
  pro: Pro
  onClose: () => void
  onStore: (e: StoreEntitlement | null) => void
  onDemo: () => void
  onLicense: (key: string) => LicenseResult
  notify: (text: string) => void
}) {
  const i18n = useI18n()
  const { t, locale } = i18n
  const [offers, setOffers] = useState<Offer[]>([])
  const [load, setLoad] = useState<Load>('idle')
  const [plan, setPlan] = useState<PlanId>('yearly')
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null)
  const [key, setKey] = useState('')
  const [keyErr, setKeyErr] = useState<string | null>(null)
  const keyRef = useRef<HTMLInputElement>(null)
  const isLicense = billing.kind === 'license'

  const fetchOffers = () => {
    if (isLicense) return
    if (!billing.available) return setLoad('error')
    setLoad('loading')
    billing
      .offers()
      .then((list) => {
        setOffers(list)
        setLoad(list.length ? 'ready' : 'error')
        if (list.length && !list.some((o) => o.id === plan)) setPlan(list[0].id)
      })
      .catch((err: unknown) => {
        console.error('SubShelf: offers failed', err)
        setLoad('error')
      })
  }

  useEffect(() => {
    if (!open) return
    setKeyErr(null)
    setBusy(null)
    if (!pro.active && load !== 'ready') fetchOffers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const chosen = offers.find((o) => o.id === plan) ?? null

  const buy = async () => {
    if (!chosen || busy) return
    haptic.tap()
    setBusy('buy')
    const res = await billing.buy(chosen.id)
    setBusy(null)
    if (res.ok) {
      haptic.success()
      if (billing.kind === 'demo') onDemo()
      else onStore(res.store)
      notify(t('welcomePro'))
      onClose()
    } else if (!res.cancelled) {
      haptic.warn()
      notify(t('buyErr'))
    }
  }

  const restore = async () => {
    if (busy) return
    setBusy('restore')
    try {
      const e = await billing.restore()
      onStore(e)
      notify(e ? t('restoredOk') : t('restoredNone'))
      if (e) {
        haptic.success()
        onClose()
      }
    } catch (err) {
      console.error(err)
      notify(t('restoreErr'))
    } finally {
      setBusy(null)
    }
  }

  const activate = () => {
    const res = onLicense(key)
    if (res.ok) {
      haptic.success()
      notify(t('welcomePro'))
      setKey('')
      onClose()
    } else {
      haptic.warn()
      setKeyErr(
        res.expired ? t('keyExpired', { date: fmtDate(res.expired, locale, true) }) : t('keyBad'),
      )
    }
  }

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setKey(text.trim())
        setKeyErr(null)
      }
    } catch {
      keyRef.current?.focus()
    }
  }

  const subtitle = feature ? t(`pwSub${feature}` as Key, { n: FREE_LIMIT }) : t('pwSub')
  const features: Key[] = ['f1t', 'f2t', 'f3t', 'f4t']
  const legalKey: Key =
    CHANNEL === 'appstore' ? 'legalappstore' : CHANNEL === 'play' ? 'legalplay' : 'legalweb'
  const canBuy = load === 'ready' && chosen !== null

  return (
    <Sheet open={open} onClose={onClose} cover label={t('proCap')}>
      <div className="pw-top">
        <button
          type="button"
          className="icon-btn icon-btn-round"
          aria-label={t('close')}
          onClick={onClose}
        >
          <X size={20} />
        </button>
        {billing.kind === 'store' && !pro.active ? (
          <button
            type="button"
            className={cn('btn btn-second btn-sm', busy === 'restore' && 'is-busy')}
            onClick={() => void restore()}
          >
            {t('pwRestore')}
          </button>
        ) : null}
      </div>

      <div className="sheet-body" style={{ paddingTop: 0 }}>
        <div className="pw-hero">
          <div className="hstack" style={{ gap: 12 }}>
            <div className="pw-mark">
              <LogoGlyph size={30} />
            </div>
            <div className="t-mono acc line">{t('proCap')}</div>
          </div>
          <h2 className="t-title multi" style={{ margin: '14px 0 0' }}>
            {pro.active ? t('pwAlready') : t('pwTitle')}
          </h2>
          <p className="t-sub c2 multi" style={{ marginTop: 6 }}>
            {subtitle}
          </p>
        </div>

        <div className="feat-grid">
          {features.map((title, i) => (
            <div key={title} className="feat-tile">
              <span className="t-num c3">{String(i + 1).padStart(2, '0')}</span>
              <span className="t-head multi">{t(title)}</span>
            </div>
          ))}
        </div>

        {pro.active ? null : isLicense ? (
          <div style={{ marginTop: 18 }}>
            <div className="t-mono c3 line" style={{ padding: '0 4px 8px' }}>
              {t('keyTitle')}
            </div>
            {LICENSE_PUBKEY ? (
              <>
                <div className="hstack">
                  <input
                    ref={keyRef}
                    className="field field-mono grow"
                    value={key}
                    placeholder={t('keyPh')}
                    aria-label={t('keyTitle')}
                    autoCapitalize="characters"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    onChange={(e) => {
                      setKey(e.target.value)
                      setKeyErr(null)
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-second none"
                    onClick={() => void paste()}
                  >
                    {t('keyPaste')}
                  </button>
                </div>
                {keyErr ? <div className="err t-sub multi">{keyErr}</div> : null}
                <p className="t-sub c3 multi" style={{ padding: '10px 4px 0' }}>
                  {t('keyHint')}
                </p>
              </>
            ) : (
              <p className="t-sub c2 multi">{t('keyNoPub')}</p>
            )}
          </div>
        ) : (
          <div className="plans" role="radiogroup" aria-label={t('proCap')}>
            {load === 'loading' || load === 'idle'
              ? [0, 1, 2].map((i) => (
                  <div key={i} className="plan" aria-hidden="true">
                    <span className="radio" />
                    <span className="col grow">
                      <span className="skel" style={{ width: '30%' }} />
                      <span className="skel" style={{ width: '50%', height: 10, marginTop: 6 }} />
                    </span>
                  </div>
                ))
              : null}
            {load === 'error' ? (
              <div className="card card-pad center">
                <p className="t-body c2 multi">
                  {billing.available ? t('pwError') : t('pwNoStore')}
                </p>
                {billing.available ? (
                  <button
                    type="button"
                    className="btn btn-second btn-sm"
                    style={{ marginTop: 12 }}
                    onClick={fetchOffers}
                  >
                    {t('retry')}
                  </button>
                ) : null}
              </div>
            ) : null}
            {load === 'ready'
              ? offers.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={plan === o.id}
                    className={cn('plan', plan === o.id && 'is-on')}
                    onClick={() => {
                      if (plan !== o.id) haptic.select()
                      setPlan(o.id)
                    }}
                  >
                    <span className="radio" />
                    <span className="col grow">
                      <span className="hstack">
                        <span className="t-head line">{t(`plan${o.id}` as Key)}</span>
                        {o.savePct ? (
                          <span className="badge none">{t('saveBadge', { n: o.savePct })}</span>
                        ) : null}
                      </span>
                      <span className="t-sub c2 line">
                        {o.trialDays
                          ? t('trialDays', { n: o.trialDays })
                          : o.id === 'lifetime'
                            ? t('once')
                            : o.id === 'monthly'
                              ? t('permonthPlan')
                              : t('peryearPlan')}
                      </span>
                    </span>
                    <span className="col none right">
                      <span className="t-head line">{o.price}</span>
                      {o.perMonth ? (
                        <span className="t-sub c3 line">{t('perMonthEq', { p: o.perMonth })}</span>
                      ) : null}
                    </span>
                  </button>
                ))
              : null}
          </div>
        )}
        <div style={{ height: 8 }} />
      </div>

      <div className="pw-foot">
        {pro.active ? (
          <button type="button" className="btn btn-primary btn-wide" onClick={onClose}>
            {t('done')}
          </button>
        ) : isLicense ? (
          <>
            <button
              type="button"
              className="btn btn-primary btn-wide"
              disabled={!LICENSE_PUBKEY || key.trim().length < 20}
              onClick={activate}
            >
              {t('keyActivate')}
            </button>
            {BUY_URL ? (
              <button
                type="button"
                className="btn btn-ghost btn-wide"
                onClick={() => void openUrl(BUY_URL)}
              >
                {t('keyBuy')}
              </button>
            ) : null}
          </>
        ) : (
          <>
            <button
              type="button"
              className={cn('btn btn-primary btn-wide', busy === 'buy' && 'is-busy')}
              disabled={!canBuy}
              onClick={() => void buy()}
            >
              {chosen?.trialDays ? t('ctaTrial') : t('ctaBuy')}
            </button>
            <p className="t-sub c2 center line" style={{ marginTop: 8 }}>
              {chosen
                ? chosen.id === 'lifetime'
                  ? t('thenOnce')
                  : t('thenPrice', {
                      price: chosen.price,
                      per: chosen.id === 'monthly' ? t('permonthPlan') : t('peryearPlan'),
                    })
                : ' '}
            </p>
            <p className="legal center multi">{t(legalKey)}</p>
          </>
        )}
        <div className="legal-links">
          <button type="button" className="link" onClick={() => void openUrl(TERMS_URL)}>
            {t('terms')}
          </button>
          <button type="button" className="link" onClick={() => void openUrl(PRIVACY_URL)}>
            {t('privacy')}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
