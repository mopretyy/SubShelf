import { memo, useLayoutEffect, useRef, useState } from 'react'
import { daysUntil, fmtDate, fmtMoney, type Next, type Sub } from '@/lib/dates'
import { useI18n, type I18n } from '@/lib/i18n'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/native'
import { Fit } from './Fit'
import { ServiceIcon } from './ServiceIcon'

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={cn('line', o.value === value && 'is-on')}
          onClick={() => {
            if (o.value !== value) haptic.select()
            onChange(o.value)
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export type PillKind = 'solid' | 'out' | 'plain' | 'late'

/** Date pill text variants (longest first) and urgency, shown without relying on colour. */
export function duePill(
  next: Next | null,
  today: string,
  i18n: I18n,
): { kind: PillKind; v: string[] } {
  const { t, locale } = i18n
  if (!next) return { kind: 'plain', v: [t('noDate')] }
  const n = daysUntil(next.date, today)
  if (next.overdue || n < 0) return { kind: 'late', v: [t('overdue'), t('overdueShort')] }
  if (n === 0) return { kind: 'solid', v: [t('whenToday')] }
  if (n === 1) return { kind: 'solid', v: [t('whenTomorrow')] }
  if (n <= 7) return { kind: 'out', v: [t('whenIn', { n }), t('whenInShort', { n })] }
  return { kind: 'plain', v: [fmtDate(next.date, locale)] }
}

export function relWord(date: string, today: string, i18n: I18n): string {
  const n = daysUntil(date, today)
  if (n < 0) return i18n.t('overdue')
  if (n === 0) return i18n.t('whenToday')
  if (n === 1) return i18n.t('whenTomorrow')
  return i18n.t('whenIn', { n })
}

export function priceVariants(s: Pick<Sub, 'price' | 'currency' | 'cycle'>, i18n: I18n): string[] {
  const { t, locale } = i18n
  if (s.price == null) return [t('priceNone')]
  const p = fmtMoney(s.price, s.currency, locale)
  return [`${p} · ${t(`per${s.cycle}`)}`, `${p}${t(`short${s.cycle}`)}`, p]
}

/** One subscription line: icon, name over price, date pill. The pill shortens before the name gets squeezed. */
export const SubRow = memo(function SubRow({
  sub,
  next,
  today,
  online,
  onOpen,
  onLongPress,
}: {
  sub: Sub
  next: Next | null
  today: string
  online: boolean
  onOpen: (s: Sub) => void
  onLongPress: (s: Sub) => void
}) {
  const i18n = useI18n()
  const pill = duePill(next, today, i18n)
  const rowRef = useRef<HTMLButtonElement>(null)
  const nameRef = useRef<HTMLSpanElement>(null)
  const [idx, setIdx] = useState(0)
  const pillKey = pill.v.join('|')

  useLayoutEffect(() => {
    const row = rowRef.current
    const name = nameRef.current
    if (!row || !name) return
    const check = () => {
      setIdx(0)
      requestAnimationFrame(() => {
        if (name.clientWidth < row.clientWidth * 0.45 && pill.v.length > 1) setIdx(1)
      })
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(row)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pillKey])

  const timer = useRef<number | null>(null)
  const longFired = useRef(false)
  const start = () => {
    longFired.current = false
    timer.current = window.setTimeout(() => {
      longFired.current = true
      haptic.tap()
      onLongPress(sub)
    }, 480)
  }
  const stop = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
  }

  return (
    <button
      ref={rowRef}
      type="button"
      className="row"
      onClick={() => {
        if (!longFired.current) onOpen(sub)
      }}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <ServiceIcon name={sub.name} icon={sub.icon} size={42} online={online} />
      <span className="col grow">
        <span ref={nameRef} className="t-head line">
          {sub.name}
        </span>
        <Fit className="t-sub c2" variants={priceVariants(sub, i18n)} />
      </span>
      <span className={cn('pill', `pill-${pill.kind}`)}>
        {pill.v[Math.min(idx, pill.v.length - 1)]}
      </span>
    </button>
  )
})
