import { useEffect, useRef, useState } from 'react'
import { ChevronRight, StickyNote } from 'lucide-react'
import { searchCatalog, norm, type CatalogEntry } from '@/lib/catalog'
import {
  CATEGORIES,
  fmtDate,
  REMIND_OPTIONS,
  type Category,
  type Cycle,
  type RemindDays,
  type Status,
  type Sub,
  type SubIcon,
} from '@/lib/dates'
import { resolveIcon } from '@/lib/icons'
import { useI18n, type Key } from '@/lib/i18n'
import { haptic } from '@/lib/native'
import { CURRENCIES } from '@/lib/store'
import { cn } from '@/lib/cn'
import { CalendarSheet } from './Calendar'
import { Fit } from './Fit'
import { ServiceIcon } from './ServiceIcon'
import { ChoiceSheet, Sheet } from './Sheet'
import { Segmented, relWord } from './SubRow'

const CYCLES: Cycle[] = ['weekly', 'monthly', 'yearly']

export type SubFields = Omit<Sub, 'id' | 'createdAt' | 'archivedAt'>

interface Draft {
  name: string
  status: Status
  price: string
  currency: string
  cycle: Cycle
  nextDate: string | null
  remind: RemindDays
  category: Category
  /** The person picked the category by hand: the name no longer changes it. */
  categoryPicked: boolean
  icon: SubIcon
  notes: string
}

export const remindKey = (r: RemindDays, short = false): Key =>
  `${short ? 'remindShort' : 'remind'}${r === null ? 'Off' : r}` as Key

function draftFrom(
  s: Sub | null,
  defaultRemind: RemindDays,
  currency: string,
  restore: boolean,
): Draft {
  if (!s) {
    return {
      name: '',
      status: 'trial',
      price: '',
      currency,
      cycle: 'monthly',
      nextDate: null,
      remind: defaultRemind,
      category: 'other',
      categoryPicked: false,
      icon: { kind: 'monogram' },
      notes: '',
    }
  }
  return {
    name: s.name,
    status: s.status,
    price: s.price == null ? '' : String(s.price).replace('.', ','),
    currency: s.currency,
    cycle: s.cycle,
    nextDate: restore ? null : s.nextDate,
    remind: s.remind,
    category: s.category,
    categoryPicked: true,
    icon: s.icon,
    notes: s.notes ?? '',
  }
}

type Picker = 'currency' | 'cycle' | 'remind' | 'date' | 'icon' | 'category' | null

export function SubForm({
  open,
  sub,
  restore,
  today,
  online,
  defaultRemind,
  defaultCurrency,
  onSave,
  onClose,
}: {
  open: boolean
  sub: Sub | null
  restore: boolean
  today: string
  online: boolean
  defaultRemind: RemindDays
  defaultCurrency: string
  onSave: (fields: SubFields) => void
  onClose: () => void
}) {
  const i18n = useI18n()
  const { t, locale } = i18n
  const [d, setD] = useState<Draft>(() => draftFrom(sub, defaultRemind, defaultCurrency, restore))
  const [noteOpen, setNoteOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picker, setPicker] = useState<Picker>(null)
  const [suggest, setSuggest] = useState<CatalogEntry[]>([])
  const [searching, setSearching] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const seq = useRef(0)

  useEffect(() => {
    if (!open) return
    setD(draftFrom(sub, defaultRemind, defaultCurrency, restore))
    setNoteOpen(Boolean(sub?.notes))
    setError(null)
    setSuggest([])
    setSearching(false)
    setPicker(null)
  }, [open, sub, defaultRemind, defaultCurrency, restore])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }))

  /** Icon follows the name: catalog instantly, online guess after a pause. */
  useEffect(() => {
    if (!open) return
    const q = d.name.trim()
    const my = ++seq.current
    const hits = searchCatalog(q, 3)
    const exact = hits.find((c) => norm(c.name) === norm(q) || c.aliases.includes(norm(q)))
    setSuggest(exact ? [] : hits)
    if (exact || hits.length === 1) {
      const c = exact ?? hits[0]
      setD((p) => ({
        ...p,
        icon: p.icon.domain === c.domain ? p.icon : { kind: 'catalog', domain: c.domain },
        category: p.categoryPicked ? p.category : c.category,
      }))
      setSearching(false)
      return
    }
    if (q.length < 2 || hits.length > 0 || !online) {
      setSearching(false)
      if (d.icon.kind !== 'monogram' && sub?.name !== d.name)
        setD((p) => ({ ...p, icon: { kind: 'monogram' } }))
      return
    }
    setSearching(true)
    const tm = window.setTimeout(() => {
      void resolveIcon(q, true).then((icon) => {
        if (seq.current !== my) return
        setSearching(false)
        setD((p) => ({ ...p, icon }))
      })
    }, 450)
    return () => window.clearTimeout(tm)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.name, open, online])

  const pick = (c: CatalogEntry) => {
    haptic.select()
    setD((p) => ({
      ...p,
      name: c.name,
      icon: { kind: 'catalog', domain: c.domain },
      category: p.categoryPicked ? p.category : c.category,
    }))
    setSuggest([])
  }

  const submit = () => {
    const name = d.name.trim()
    if (!name) {
      haptic.warn()
      return setError(t('errName'))
    }
    const raw = d.price.trim().replace(',', '.')
    const price = raw === '' ? null : Number(raw)
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      haptic.warn()
      return setError(t('errPrice'))
    }
    haptic.success()
    onSave({
      name: name.slice(0, 80),
      status: d.status,
      price,
      currency: d.currency,
      cycle: d.cycle,
      nextDate: d.nextDate,
      remind: d.remind,
      category: d.category,
      icon: d.icon,
      notes: d.notes.trim() ? d.notes.trim().slice(0, 500) : null,
    })
  }

  const trial = d.status === 'trial'
  const dateValues = d.nextDate
    ? [
        `${fmtDate(d.nextDate, locale)} · ${relWord(d.nextDate, today, i18n)}`,
        fmtDate(d.nextDate, locale),
      ]
    : [t('pick')]
  const title = restore ? t('formRestore') : sub ? t('formEdit') : t('formNew')

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        full
        label={title}
        onOpened={() => {
          if (!sub) nameRef.current?.focus({ preventScroll: true })
        }}
      >
        <div className="sheet-head">
          <button type="button" className="btn btn-ghost none" onClick={onClose}>
            {t('cancel')}
          </button>
          <span className="t-head line grow center">{title}</span>
          <span className="none head-spacer" />
        </div>

        <div className="sheet-body">
          <div className="namebox">
            <button
              type="button"
              className="icon-pick none"
              aria-label={t('iconTitle')}
              onClick={() => setPicker('icon')}
            >
              <ServiceIcon
                name={d.name || '?'}
                icon={d.icon}
                size={64}
                online={online}
                loading={searching}
              />
            </button>
            <input
              ref={nameRef}
              className="name-input"
              value={d.name}
              placeholder={t('fName')}
              aria-label={t('fName')}
              maxLength={80}
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="done"
              onChange={(e) => {
                set('name', e.target.value)
                setError(null)
              }}
            />
          </div>

          {suggest.length > 0 ? (
            <div className="group sugg">
              {suggest.map((c) => (
                <button key={c.name} type="button" className="row row-sugg" onClick={() => pick(c)}>
                  <ServiceIcon
                    name={c.name}
                    icon={{ kind: 'catalog', domain: c.domain }}
                    size={32}
                    online={online}
                  />
                  <span className="col grow">
                    <span className="t-body line">{c.name}</span>
                    <span className="t-cap c3 line">{c.domain}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : searching ? (
            <div className="t-sub c3 line sugg-note">{t('searching')}</div>
          ) : null}

          <Segmented<Status>
            label={t('statusTrial')}
            value={d.status}
            onChange={(v) => set('status', v)}
            options={[
              { value: 'trial', label: t('statusTrial') },
              { value: 'active', label: t('statusActive') },
            ]}
          />

          <div className="group">
            <div className="row row-form row-plain no-press">
              <span className="t-body line grow">{trial ? t('fPriceTrial') : t('fPrice')}</span>
              <input
                className="price-input none"
                value={d.price}
                inputMode="decimal"
                placeholder="0"
                aria-label={t('fPrice')}
                onChange={(e) => {
                  set('price', e.target.value)
                  setError(null)
                }}
              />
              <button type="button" className="cur-btn none" onClick={() => setPicker('currency')}>
                {d.currency}
              </button>
            </div>
            <FormRow
              label={t('fCycle')}
              values={[t(`cycle${d.cycle}`), t(`per${d.cycle}`)]}
              onClick={() => setPicker('cycle')}
            />
            <FormRow
              label={trial ? t('fDateTrial') : t('fDateActive')}
              values={dateValues}
              onClick={() => setPicker('date')}
            />
            <FormRow
              label={t('fRemind')}
              values={[t(remindKey(d.remind)), t(remindKey(d.remind, true))]}
              onClick={() => setPicker('remind')}
            />
            <FormRow
              label={t('fCategory')}
              values={[t(`cat${d.category}` as Key)]}
              onClick={() => setPicker('category')}
            />
          </div>

          <div className="group note-group">
            {noteOpen ? (
              <textarea
                className="note multi"
                value={d.notes}
                maxLength={500}
                placeholder={t('fNotePh')}
                aria-label={t('fNote')}
                rows={3}
                onChange={(e) => set('notes', e.target.value)}
              />
            ) : (
              <button
                type="button"
                className="row row-form row-plain"
                onClick={() => setNoteOpen(true)}
              >
                <StickyNote size={20} className="c2 none" />
                <span className="t-body line grow">{t('fNote')}</span>
                <ChevronRight size={16} className="chev" />
              </button>
            )}
          </div>

          {error ? <div className="err t-sub line">{error}</div> : null}
        </div>

        <div className="sheet-foot">
          <button type="button" className="btn btn-primary btn-wide" onClick={submit}>
            {t('save')}
          </button>
        </div>
      </Sheet>

      <ChoiceSheet
        open={picker === 'currency'}
        title={t('currency')}
        options={(CURRENCIES.includes(d.currency) ? CURRENCIES : [d.currency, ...CURRENCIES]).map(
          (c) => ({ value: c, label: c }),
        )}
        value={d.currency}
        onPick={(v) => set('currency', v)}
        onClose={() => setPicker(null)}
      />
      <ChoiceSheet<Category>
        open={picker === 'category'}
        title={t('fCategory')}
        options={CATEGORIES.map((c) => ({ value: c, label: t(`cat${c}` as Key) }))}
        value={d.category}
        onPick={(v) => setD((p) => ({ ...p, category: v, categoryPicked: true }))}
        onClose={() => setPicker(null)}
      />
      <ChoiceSheet
        open={picker === 'cycle'}
        title={t('fCycle')}
        options={CYCLES.map((c) => ({ value: c, label: t(`cycle${c}`) }))}
        value={d.cycle}
        onPick={(v) => set('cycle', v)}
        onClose={() => setPicker(null)}
      />
      <ChoiceSheet
        open={picker === 'remind'}
        title={t('fRemind')}
        options={REMIND_OPTIONS.map((r) => ({ value: r, label: t(remindKey(r)) }))}
        value={d.remind}
        onPick={(v) => set('remind', v)}
        onClose={() => setPicker(null)}
      />
      <ChoiceSheet
        open={picker === 'icon'}
        title={t('iconTitle')}
        options={[
          { value: 'retry', label: t('iconRetry') },
          { value: 'letter', label: t('iconLetter') },
        ]}
        value={undefined}
        onPick={(v) => {
          if (v === 'letter') set('icon', { kind: 'monogram' })
          else {
            setSearching(true)
            void resolveIcon(d.name, online).then((icon) => {
              setSearching(false)
              set('icon', icon)
            })
          }
        }}
        onClose={() => setPicker(null)}
      />
      <CalendarSheet
        open={picker === 'date'}
        value={d.nextDate}
        today={today}
        trial={trial}
        onPick={(v) => set('nextDate', v)}
        onClose={() => setPicker(null)}
      />
    </>
  )
}

export function FormRow({
  label,
  values,
  onClick,
  className,
}: {
  label: string
  values: string[]
  onClick: () => void
  className?: string
}) {
  return (
    <button type="button" className={cn('row row-form row-plain', className)} onClick={onClick}>
      <span className="t-body line none label-col">{label}</span>
      <Fit className="t-body c3 grow right" variants={values} />
      <ChevronRight size={18} className="chev" />
    </button>
  )
}
