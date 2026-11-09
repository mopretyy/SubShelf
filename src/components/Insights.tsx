import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import {
  addDays,
  fmtDate,
  fmtMoney,
  fmtMonthYear,
  mainCurrency,
  monthlyByCurrency,
  monthlyCost,
  parseYmd,
  round2,
  type Sub,
} from '@/lib/dates'
import { useI18n, type Key } from '@/lib/i18n'
import {
  byCategory,
  forecast,
  monthStart,
  otherCurrencies,
  topExpensive,
  trialsMonthly,
  type MonthBucket,
} from '@/lib/insights'
import { haptic } from '@/lib/native'
import type { Pro } from '@/lib/pro'
import { cn } from '@/lib/cn'
import { Fit } from './Fit'
import { Kicker } from './Home'
import { ServiceIcon } from './ServiceIcon'

const MONTHS = 12

export function Insights({
  subs,
  today,
  online,
  pro,
  currency,
  onPro,
  onOpen,
}: {
  subs: Sub[]
  today: string
  online: boolean
  pro: Pro
  currency: string
  onPro: () => void
  onOpen: (s: Sub) => void
}) {
  const i18n = useI18n()
  const { t, locale } = i18n
  const live = useMemo(() => subs.filter((s) => !s.archivedAt), [subs])
  const cur = mainCurrency(
    monthlyByCurrency(live, () => true),
    currency,
  )
  const buckets = useMemo(() => forecast(live, today, MONTHS, cur), [live, today, cur])
  const [sel, setSel] = useState(0)
  useEffect(() => setSel(0), [cur])

  const yearTotal = round2(buckets.reduce((a, b) => a + b.total, 0))
  const priced = live.some((s) => s.price != null && s.currency === cur && s.nextDate)

  const header = (
    <div className="head">
      <div className="col grow">
        <Kicker today={today} />
        <h1 className="t-large line" style={{ margin: 0 }}>
          {t('insTitle')}
        </h1>
      </div>
      {pro.active ? null : (
        <button type="button" className="chip" onClick={onPro}>
          <span className="pro-mark">PRO</span>
        </button>
      )}
    </div>
  )

  if (!priced) {
    return (
      <div className="page-enter">
        {header}
        <div className="card card-pad">
          <p className="t-body c2 multi">{t('insEmpty')}</p>
        </div>
      </div>
    )
  }

  const details = (
    <>
      <MonthCard
        buckets={buckets}
        sel={sel}
        setSel={setSel}
        today={today}
        online={online}
        currency={cur}
        onOpen={onOpen}
      />
      <Categories subs={live} currency={cur} />
      <Top subs={live} currency={cur} online={online} onOpen={onOpen} />
    </>
  )

  const trials = trialsMonthly(live, cur)
  const others = otherCurrencies(live, cur)

  return (
    <div className="page-enter">
      {header}

      <div className="card summary">
        <div className="t-mono c3 line">{t('insYear')}</div>
        <Fit
          className="t-hero"
          variants={[fmtMoney(yearTotal, cur, locale), fmtMoney(yearTotal, cur, locale, true)]}
        />
        <span className="t-sub c2 line summary-meta">
          {t('insAvg', { sum: fmtMoney(round2(yearTotal / MONTHS), cur, locale) })}
        </span>
        {pro.active ? <Chart buckets={buckets} sel={sel} onSel={setSel} currency={cur} /> : null}
      </div>

      {pro.active ? (
        <>
          {details}
          {trials > 0 ? (
            <div className="card card-pad">
              <div className="t-mono c3 line">{t('insTrials')}</div>
              <p className="t-body multi" style={{ marginTop: 8 }}>
                {t('insTrialsText', { sum: fmtMoney(round2(trials), cur, locale) })}
              </p>
            </div>
          ) : null}
          {others.length ? (
            <p className="t-sub c3 multi foot-note">
              {t('insCurrencyNote', { cur, list: others.join(', ') })}
            </p>
          ) : null}
        </>
      ) : (
        <div className="lock-wrap">
          <div className="blurred" aria-hidden="true" inert>
            <div className="card summary">
              <Chart buckets={buckets} sel={0} onSel={() => {}} currency={cur} />
            </div>
            {details}
          </div>
          <div className="lock-over">
            <div className="lock-card">
              <div className="pw-mark" style={{ margin: '0 auto 14px', width: 52, height: 52 }}>
                <Lock size={22} />
              </div>
              <div className="t-title multi">{t('insLockTitle')}</div>
              <p className="t-sub c2 multi" style={{ marginTop: 6 }}>
                {t('insLockText')}
              </p>
              <button
                type="button"
                className="btn btn-primary btn-wide"
                style={{ marginTop: 16 }}
                onClick={onPro}
              >
                {t('insLockCta')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** 12 monthly columns: one hue, the current month in signal red, the selected one in ink. */
function Chart({
  buckets,
  sel,
  onSel,
  currency,
}: {
  buckets: MonthBucket[]
  sel: number
  onSel: (i: number) => void
  currency: string
}) {
  const { t, locale } = useI18n()
  const max = Math.max(...buckets.map((b) => b.total), 1)
  const label = (ymd: string) =>
    new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
      .format(parseYmd(ymd))
      .replace('.', '')
      .slice(0, 3)
  return (
    <div className="chart" role="group" aria-label={t('insChart')}>
      <div className="gridline" style={{ top: 0 }}>
        <span>{fmtMoney(Math.round(max), currency, locale, true)}</span>
      </div>
      <div className="bars">
        {buckets.map((b, i) => (
          <button
            key={b.month}
            type="button"
            className={cn('bar-hit', i === sel && 'is-on', i === 0 && 'is-now')}
            aria-label={`${fmtMonthYear(b.month, locale)}: ${fmtMoney(round2(b.total), currency, locale)}`}
            aria-pressed={i === sel}
            onClick={() => {
              if (i !== sel) haptic.select()
              onSel(i)
            }}
          >
            <span className="bar" style={{ height: `${Math.max(1.5, (b.total / max) * 100)}%` }} />
          </button>
        ))}
      </div>
      <div className="bar-labels" aria-hidden="true">
        {buckets.map((b, i) => (
          <span key={b.month} className={cn(i === sel && 'is-on')}>
            {label(b.month)}
          </span>
        ))}
      </div>
    </div>
  )
}

/** The selected month as a calendar with charge days marked, then the charges themselves. */
function MonthCard({
  buckets,
  sel,
  setSel,
  today,
  online,
  currency,
  onOpen,
}: {
  buckets: MonthBucket[]
  sel: number
  setSel: (i: number) => void
  today: string
  online: boolean
  currency: string
  onOpen: (s: Sub) => void
}) {
  const i18n = useI18n()
  const { t, locale } = i18n
  const b = buckets[sel]
  const view = b.month
  const first = parseYmd(view)
  const lead = (first.getUTCDay() + 6) % 7
  const start = addDays(view, -lead)
  const weeks = Math.ceil(
    (lead + new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()) /
      7,
  )
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
  const chargeDays = new Set(b.charges.map((c) => c.date))
  const groups = new Map<string, typeof b.charges>()
  for (const c of b.charges) groups.set(c.date, [...(groups.get(c.date) ?? []), c])

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-pad" style={{ paddingBottom: 8 }}>
        <div className="hstack">
          <span className="t-mono c3 line grow">{t('insCalendar')}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('prevMonth')}
            disabled={sel === 0}
            onClick={() => setSel(sel - 1)}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('nextMonth')}
            disabled={sel === buckets.length - 1}
            onClick={() => setSel(sel + 1)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="hstack" style={{ alignItems: 'baseline', marginTop: 2 }}>
          <span className="t-title line grow">{fmtMonthYear(view, locale)}</span>
          <span className="t-head none">{fmtMoney(round2(b.total), currency, locale)}</span>
        </div>
        <span className="t-sub c3 line">
          {b.charges.length ? t('insCharges', { n: b.charges.length }) : t('insNoCharges')}
        </span>
        <div className="cal" style={{ marginTop: 12 }}>
          {t('weekdays')
            .split(',')
            .map((w) => (
              <div key={w} className="cal-w line">
                {w}
              </div>
            ))}
          {days.map((d) => (
            <div
              key={d}
              className={cn(
                'cal-d',
                monthStart(d) !== view && 'is-muted',
                d === today && 'is-today',
                d < today && monthStart(d) === view && 'is-past',
              )}
              style={{ display: 'grid', placeItems: 'center', height: 40 }}
            >
              {monthStart(d) === view ? Number(d.slice(8)) : ''}
              {chargeDays.has(d) && monthStart(d) === view ? <span className="cal-dot" /> : null}
            </div>
          ))}
        </div>
      </div>
      {groups.size ? (
        <div style={{ borderTop: '1px solid var(--line)' }}>
          {[...groups.entries()].map(([date, list]) => (
            <div key={date}>
              <div className="charge-day t-mono c3 line">{fmtDate(date, locale, true)}</div>
              {list.map((c) => (
                <button
                  key={`${c.sub.id}-${c.date}`}
                  type="button"
                  className="row"
                  style={{ minHeight: 56 }}
                  onClick={() => onOpen(c.sub)}
                >
                  <ServiceIcon name={c.sub.name} icon={c.sub.icon} size={34} online={online} />
                  <span className="col grow">
                    <span className="t-head line">{c.sub.name}</span>
                    {c.trial ? <span className="t-sub acc line">{t('trialTag')}</span> : null}
                  </span>
                  <span className={cn('t-head none tab-nums', c.trial && 'c3')}>
                    {fmtMoney(c.amount, c.sub.currency, locale)}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Ranked bars, one hue: identity is the label, the bar only carries the share. */
function Categories({ subs, currency }: { subs: Sub[]; currency: string }) {
  const { t, locale } = useI18n()
  const list = byCategory(subs, currency)
  if (!list.length) return null
  const max = list[0].monthly
  return (
    <div className="card card-pad" style={{ marginTop: 14 }}>
      <div className="t-mono c3 line">{t('insCategories')}</div>
      <div style={{ marginTop: 6 }}>
        {list.map((c) => (
          <div key={c.category} style={{ padding: '10px 0' }}>
            <div className="hstack">
              <span className="t-head line grow">{t(`cat${c.category}` as Key)}</span>
              <span className="t-num c3 none">{Math.round(c.share * 100)}%</span>
              <span className="t-head none tab-nums" style={{ minWidth: 72, textAlign: 'right' }}>
                {fmtMoney(round2(c.monthly), currency, locale)}
              </span>
            </div>
            <div className="meter" aria-hidden="true">
              <span style={{ width: `${Math.max(2, (c.monthly / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Top({
  subs,
  currency,
  online,
  onOpen,
}: {
  subs: Sub[]
  currency: string
  online: boolean
  onOpen: (s: Sub) => void
}) {
  const { t, locale } = useI18n()
  const list = topExpensive(subs, currency, 5)
  if (list.length < 2) return null
  return (
    <>
      <div className="sec">
        <span className="t-mono c2 line">{t('insTop')}</span>
      </div>
      <div className="group">
        {list.map((s, i) => (
          <button key={s.id} type="button" className="row" onClick={() => onOpen(s)}>
            <span className="t-num c3 none" style={{ width: 18 }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <ServiceIcon name={s.name} icon={s.icon} size={36} online={online} />
            <span className="col grow">
              <span className="t-head line">{s.name}</span>
              <span className="t-sub c3 line">
                {t('perYearLine', {
                  sum: fmtMoney(Math.round(monthlyCost(s) * 12), currency, locale),
                })}
              </span>
            </span>
            <span className="t-head none tab-nums">
              {fmtMoney(round2(monthlyCost(s)), currency, locale)}
              <span className="t-sub c3">{t('shortmonthly')}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  )
}
