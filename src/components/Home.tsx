import { ArrowUpRight, Plus } from 'lucide-react'
import { FREE_LIMIT } from '@/lib/config'
import { fmtMoney, mainCurrency, monthlyByCurrency, round2, type Next, type Sub } from '@/lib/dates'
import { useI18n } from '@/lib/i18n'
import type { Pro } from '@/lib/pro'
import { cn } from '@/lib/cn'
import { Fit } from './Fit'
import { SampleStack } from './Samples'
import { ServiceIcon } from './ServiceIcon'
import { SubRow, relWord } from './SubRow'

export interface Item {
  s: Sub
  next: Next | null
}

/** "Понедельник, 9 ноября" over the large title, as in Apple's own apps. */
export function Kicker({ today }: { today: string }) {
  const { locale } = useI18n()
  const [y, m, d] = today.split('-').map(Number)
  const text = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(y, m - 1, d))
  return <span className="t-mono c3 line">{text}</span>
}

export function Home({
  items,
  loading,
  today,
  online,
  pro,
  currency,
  onAdd,
  onOpen,
  onLongPress,
  onPro,
}: {
  items: Item[]
  loading: boolean
  today: string
  online: boolean
  pro: Pro
  currency: string
  onAdd: () => void
  onOpen: (s: Sub) => void
  onLongPress: (s: Sub) => void
  onPro: () => void
}) {
  const i18n = useI18n()
  const { t, locale } = i18n
  const count = items.length
  const atLimit = !pro.active && count >= FREE_LIMIT

  const header = (
    <div className="head">
      <div className="col grow">
        <Kicker today={today} />
        <h1 className="t-large line" style={{ margin: 0 }}>
          {t('subs')}
        </h1>
      </div>
      {!loading && !pro.active && count > 0 ? (
        <button type="button" className="chip t-num" onClick={onPro} aria-label={t('limitCta')}>
          {atLimit ? <span className="chip-dot" /> : null}
          {t('freeCounter', { n: count, m: FREE_LIMIT })}
        </button>
      ) : null}
    </div>
  )

  if (loading) {
    return (
      <div aria-busy="true">
        {header}
        <div className="card summary">
          <div className="skel" style={{ width: '24%' }} />
          <div className="skel" style={{ width: '52%', height: 40, marginTop: 12 }} />
          <div className="skel" style={{ width: '38%', marginTop: 12 }} />
        </div>
        <div className="group" style={{ marginTop: 14 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="row">
              <span className="svc-icon" style={{ width: 42, height: 42, borderRadius: 11 }} />
              <span className="col grow">
                <span className="skel" style={{ width: '60%' }} />
                <span className="skel" style={{ width: '35%', height: 10 }} />
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (count === 0) {
    return (
      <div className="page-enter">
        {header}
        <div className="empty">
          <div className="frame frame-ticks">
            <SampleStack online={online} today={today} count={3} />
          </div>
          <div className="t-title multi" style={{ marginTop: 18 }}>
            {t('emptyTitle')}
          </div>
          <p className="t-body c2 multi">{t('emptyText')}</p>
          <button type="button" className="btn btn-primary" onClick={onAdd}>
            <Plus size={20} /> {t('addFirst')}
          </button>
        </div>
      </div>
    )
  }

  const subs = items.map((i) => i.s)
  const totals = monthlyByCurrency(subs, (s) => s.status === 'active')
  const main = mainCurrency(totals, currency)
  const month = round2(totals.get(main) ?? 0)
  const others = [...totals.keys()].filter((c) => c !== main)
  const actives = subs.filter((s) => s.status === 'active').length
  const trials = subs.length - actives
  const soonest = items
    .filter((i) => i.next && !i.next.overdue)
    .sort((a, b) => (a.next!.date < b.next!.date ? -1 : 1))[0]

  const sections: { title: string; list: Item[] }[] = [
    { title: t('trials'), list: items.filter((i) => i.s.status === 'trial') },
    { title: t('actives'), list: items.filter((i) => i.s.status === 'active') },
  ]

  const meta = [
    t('perYearLine', { sum: fmtMoney(Math.round(month * 12), main, locale) }),
    actives ? t('nActive', { n: actives }) : null,
    trials ? t('nTrials', { n: trials }) : null,
  ].filter(Boolean) as string[]

  return (
    <div className="page-enter">
      {header}

      <div className="card summary">
        <div className="t-mono c3 line">{t('perMonthCap')}</div>
        <Fit
          className="t-hero"
          variants={[fmtMoney(month, main, locale), fmtMoney(month, main, locale, true)]}
        />
        <Fit
          className="t-sub c2 summary-meta"
          variants={[meta.join(' · '), meta.slice(0, 2).join(' · '), meta[0]]}
        />
        {others.length === 1 ? (
          <Fit
            className="t-sub c3"
            variants={[
              t('moreCur1', {
                sum: fmtMoney(Math.round(totals.get(others[0]) ?? 0), others[0], locale),
              }),
              `+ ${fmtMoney(Math.round(totals.get(others[0]) ?? 0), others[0], locale)}`,
            ]}
          />
        ) : others.length > 1 ? (
          <span className="t-sub c3 line">{t('moreCurN', { n: others.length })}</span>
        ) : null}

        {soonest?.next ? (
          <>
            <div className="rule" />
            <div className="t-mono c3 line" style={{ marginBottom: 8 }}>
              {t('nextCharge')}
            </div>
            <button type="button" className="next-row" onClick={() => onOpen(soonest.s)}>
              <ServiceIcon name={soonest.s.name} icon={soonest.s.icon} size={34} online={online} />
              <span className="col grow">
                <span className="t-head line">{soonest.s.name}</span>
                <span className="t-sub c2 line">
                  {soonest.s.price != null
                    ? `${fmtMoney(soonest.s.price, soonest.s.currency, locale)} · `
                    : ''}
                  {relWord(soonest.next.date, today, i18n)}
                </span>
              </span>
              <ArrowUpRight size={18} className="c3 none" />
            </button>
          </>
        ) : null}
      </div>

      {atLimit ? (
        <button type="button" className="limit" onClick={onPro}>
          <span className="col grow">
            <span className="t-head line">{t('limitTitle', { n: FREE_LIMIT })}</span>
            <span className="t-sub c2 line">{t('limitText')}</span>
            <span className="limit-bar" aria-hidden="true">
              {Array.from({ length: FREE_LIMIT }, (_, i) => (
                <span key={i} className={cn(i < count && 'is-on')} />
              ))}
            </span>
          </span>
          <span className="btn btn-primary btn-sm none">{t('limitCta')}</span>
        </button>
      ) : null}

      {sections.map((sec) =>
        sec.list.length ? (
          <section key={sec.title}>
            <div className="sec">
              <span className="t-mono c2 line">{sec.title}</span>
              <span className="t-num c3 none">{String(sec.list.length).padStart(2, '0')}</span>
            </div>
            <div className="group">
              {sec.list.map(({ s, next }) => (
                <SubRow
                  key={s.id}
                  sub={s}
                  next={next}
                  today={today}
                  online={online}
                  onOpen={onOpen}
                  onLongPress={onLongPress}
                />
              ))}
            </div>
          </section>
        ) : null,
      )}
    </div>
  )
}
