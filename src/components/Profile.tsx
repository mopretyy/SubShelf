import { ChevronRight, Settings2 } from 'lucide-react'
import {
  fmtDate,
  fmtMoney,
  fmtMonthYear,
  mainCurrency,
  monthlyByCurrency,
  round2,
  type Sub,
} from '@/lib/dates'
import { useI18n, type Key } from '@/lib/i18n'
import type { Pro } from '@/lib/pro'
import { Fit } from './Fit'
import { Kicker } from './Home'
import { LogoGlyph } from './Logo'
import { ServiceIcon } from './ServiceIcon'

export function Profile({
  subs,
  name,
  online,
  today,
  pro,
  currency,
  onRename,
  onRestore,
  onOpenSettings,
  onPro,
  onManage,
}: {
  subs: Sub[]
  name: string | null
  online: boolean
  today: string
  pro: Pro
  currency: string
  onRename: () => void
  onRestore: (s: Sub) => void
  onOpenSettings: () => void
  onPro: () => void
  onManage: () => void
}) {
  const { t, locale } = useI18n()
  const live = subs.filter((s) => !s.archivedAt)
  const history = subs
    .filter((s) => s.archivedAt)
    .sort((a, b) => (a.archivedAt! < b.archivedAt! ? 1 : -1))

  const month = monthlyByCurrency(live, (s) => s.status === 'active')
  const cur = mainCurrency(month, currency)
  const m = round2(month.get(cur) ?? 0)
  const saved = monthlyByCurrency(history, () => true)
  const savedCur = mainCurrency(saved, currency)
  const savedV = round2(saved.get(savedCur) ?? 0)
  const display = name ?? t('you')

  const tile = (label: string, values: string[]) => (
    <div className="tile">
      <span className="t-mono c3 line">{label}</span>
      <Fit className="t-tile" variants={values} />
    </div>
  )

  const groups: { month: string; items: Sub[] }[] = []
  for (const s of history) {
    const key = fmtMonthYear(s.archivedAt!, locale)
    const last = groups[groups.length - 1]
    if (last && last.month === key) last.items.push(s)
    else groups.push({ month: key, items: [s] })
  }

  const proLine = (): string => {
    if (pro.source === 'founder') return t('proFounder')
    if (pro.source === 'demo') return t('proDemo')
    if (pro.source === 'license') {
      return pro.until ? t('proEnds', { date: fmtDate(pro.until, locale, true) }) : t('proLicense')
    }
    if (pro.until) {
      const date = fmtDate(pro.until, locale, true)
      if (pro.trial) return t('proTrialEnds', { date })
      return pro.willRenew ? t('proRenews', { date }) : t('proEnds', { date })
    }
    return t('proPlanlifetime')
  }

  return (
    <div className="page-enter">
      <div className="head">
        <div className="col grow">
          <Kicker today={today} />
          <h1 className="t-large line" style={{ margin: 0 }}>
            {t('profile')}
          </h1>
        </div>
      </div>

      <button type="button" className="card profile-head" onClick={onRename}>
        <span className="avatar">{(Array.from(display)[0] ?? '?').toUpperCase()}</span>
        <span className="col grow">
          <span className="t-title line">{display}</span>
          <Fit
            className="t-sub c3"
            variants={[t('localData'), t('localDataShort'), t('localDataTiny')]}
          />
        </span>
        <ChevronRight size={18} className="chev" />
      </button>

      {pro.active ? (
        <div className="pro-card pro-card-on">
          <div className="hstack">
            <span
              className="pw-mark"
              style={{ width: 40, height: 40, borderRadius: 12, margin: 0 }}
            >
              <LogoGlyph size={24} />
            </span>
            <span className="col grow">
              <span className="t-mono acc line">{t('proCap')}</span>
              <span className="t-head line">
                {pro.source === 'founder'
                  ? t('proFounderShort')
                  : pro.plan
                    ? t(`proPlan${pro.plan}` as Key)
                    : t('proActive')}
              </span>
            </span>
            {pro.source === 'store' ? (
              <button type="button" className="btn btn-second btn-sm none" onClick={onManage}>
                {t('proManage')}
              </button>
            ) : null}
          </div>
          <p className="t-sub c2 multi" style={{ marginTop: 12 }}>
            {proLine()}
          </p>
        </div>
      ) : (
        <button type="button" className="pro-card" onClick={onPro}>
          <span className="t-mono c3 line">{t('proCap')}</span>
          <span className="t-title line" style={{ marginTop: 6 }}>
            {t('proCardTitle')}
          </span>
          <span className="t-sub c2 multi" style={{ display: 'block', marginTop: 6 }}>
            {t('proCardText')}
          </span>
          <span className="btn btn-light btn-wide">{t('proCardMore')}</span>
        </button>
      )}

      <div className="tiles">
        {tile(t('tMonth'), [fmtMoney(m, cur, locale), fmtMoney(m, cur, locale, true)])}
        {tile(t('tYear'), [
          fmtMoney(Math.round(m * 12), cur, locale),
          fmtMoney(Math.round(m * 12), cur, locale, true),
        ])}
        {tile(t('tActive'), [String(live.filter((s) => s.status === 'active').length)])}
        {tile(t('tTrial'), [String(live.filter((s) => s.status === 'trial').length)])}
      </div>

      <div className="sec">
        <span className="t-mono c2 line none">{t('history')}</span>
        <span className="t-num c3 none">{String(history.length).padStart(2, '0')}</span>
        {savedV > 0 ? (
          <Fit
            className="t-sub good grow right"
            variants={[
              t('savedSum', { sum: fmtMoney(savedV, savedCur, locale) }),
              t('savedSumShort', { sum: fmtMoney(Math.round(savedV), savedCur, locale) }),
              '',
            ]}
          />
        ) : null}
      </div>

      {history.length === 0 ? (
        <div className="group">
          <div className="row row-plain no-press">
            <span className="t-body c3 line">{t('historyEmpty')}</span>
          </div>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.month}>
            <div className="t-mono c3 line month-cap">{g.month}</div>
            <div className="group">
              {g.items.map((s) => {
                const price =
                  s.price == null
                    ? ''
                    : `${fmtMoney(s.price, s.currency, locale)}${t(`short${s.cycle}`)}`
                const date = fmtDate(s.archivedAt!, locale)
                return (
                  <div key={s.id} className="row no-press">
                    <ServiceIcon name={s.name} icon={s.icon} size={42} online={online} />
                    <span className="col grow">
                      <span className="t-head line">{s.name}</span>
                      <Fit
                        className="t-sub c3"
                        variants={[
                          price
                            ? `${t('cancelledOn', { date })} · ${price}`
                            : t('cancelledOn', { date }),
                          price ? `${date} · ${price}` : date,
                          date,
                        ]}
                      />
                    </span>
                    <button
                      type="button"
                      className="btn btn-second btn-sm none"
                      onClick={() => onRestore(s)}
                    >
                      {t('restore')}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        ))
      )}

      <div className="group settings-link">
        <button type="button" className="row row-form row-plain" onClick={onOpenSettings}>
          <span className="row-icon">
            <Settings2 size={17} />
          </span>
          <span className="t-body line grow">{t('settings')}</span>
          <ChevronRight size={18} className="chev" />
        </button>
      </div>
    </div>
  )
}
