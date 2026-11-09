import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Link2, StickyNote } from 'lucide-react'
import {
  catalogByDomain,
  matchCatalog,
  searchCatalog,
  norm,
  type CatalogEntry,
} from '@/lib/catalog'
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
import { iconFromSite } from '@/lib/icons'
import { brandFromDomain, findSites, parseSite, probeIcon, type SiteHit } from '@/lib/sites'
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
  /** Website typed or picked by hand ('' = none). */
  url: string
  /** The site/icon was chosen by hand or comes from a saved subscription: the name no longer changes it. */
  sitePicked: boolean
  notes: string
}

type Site = NonNullable<ReturnType<typeof parseSite>>

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
      url: '',
      sitePicked: false,
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
    url: s.url ?? '',
    sitePicked: s.icon.kind !== 'monogram',
    notes: s.notes ?? '',
  }
}

type Picker = 'currency' | 'cycle' | 'remind' | 'date' | 'icon' | 'category' | 'site' | null
type Search = 'idle' | 'searching' | 'done'

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
  const [search, setSearch] = useState<Search>('idle')
  const [sites, setSites] = useState<SiteHit[]>([])
  const [typedLink, setTypedLink] = useState<Site | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const [nonce, setNonce] = useState(0)
  const pasted = useRef(false)
  const seq = useRef(0)
  const searching = search === 'searching'

  useEffect(() => {
    if (!open) return
    setD(draftFrom(sub, defaultRemind, defaultCurrency, restore))
    setNoteOpen(Boolean(sub?.notes))
    setError(null)
    setSuggest([])
    setSearch('idle')
    setSites([])
    setTypedLink(null)
    setPicker(null)
  }, [open, sub, defaultRemind, defaultCurrency, restore])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }))

  /**
   * The icon follows the name: the catalog answers instantly, then the web (official site, then
   * name.com, name.io …) after a pause. A link in the name field is offered as the site.
   */
  useEffect(() => {
    if (!open) return
    const q = d.name.trim()
    const my = ++seq.current
    setSites([])
    const link = parseSite(q)
    setTypedLink(link)
    if (link) {
      setSuggest([])
      setSearch('idle')
      return
    }
    const hits = searchCatalog(q, 3)
    const exact = hits.find((c) => norm(c.name) === norm(q) || c.aliases.includes(norm(q)))
    setSuggest(exact ? [] : hits)
    if (exact || hits.length === 1) {
      const c = exact ?? hits[0]
      setSearch('idle')
      setD((p) =>
        p.sitePicked
          ? p
          : {
              ...p,
              icon: p.icon.domain === c.domain ? p.icon : { kind: 'catalog', domain: c.domain },
              category: p.categoryPicked ? p.category : c.category,
            },
      )
      return
    }
    if (d.sitePicked || q.length < 2 || hits.length > 0 || !online) {
      setSearch('idle')
      if (!d.sitePicked && d.icon.kind !== 'monogram')
        setD((p) => ({ ...p, icon: { kind: 'monogram' } }))
      return
    }
    setSearch('searching')
    const ctrl = new AbortController()
    const tm = window.setTimeout(() => {
      void findSites(q, 4, ctrl.signal).then((found) => {
        if (seq.current !== my) return
        setSites(found)
        setSearch('done')
        setD((p) => {
          if (p.sitePicked) return p
          const top = found[0]
          const guess = top ? (catalogByDomain(top.domain)?.category ?? top.category) : undefined
          return {
            ...p,
            icon: top ? iconFromSite(top) : { kind: 'monogram' },
            category: p.categoryPicked || !guess ? p.category : guess,
          }
        })
      })
    }, 500)
    return () => {
      window.clearTimeout(tm)
      ctrl.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.name, open, online, nonce])

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

  /** A site chosen by hand: its icon, its link, and the service name when the field is empty or a link. */
  const applySite = (site: Site, renameFrom?: string) => {
    haptic.select()
    const entry = catalogByDomain(site.domain) ?? matchCatalog(brandFromDomain(site.domain))
    setD((p) => {
      const rename = !p.name.trim() || parseSite(p.name) || renameFrom !== undefined
      return {
        ...p,
        name: rename ? (entry?.name ?? brandFromDomain(site.domain)) : p.name,
        url: site.url,
        sitePicked: true,
        icon: entry
          ? { kind: 'catalog', domain: entry.domain }
          : { kind: 'remote', domain: site.domain },
        category: p.categoryPicked || !entry ? p.category : entry.category,
      }
    })
    setSites([])
    setSuggest([])
    if (!online) return
    setSearch('searching')
    void probeIcon(site.domain).then((res) => {
      setSearch('idle')
      setD((p) =>
        p.icon.domain !== site.domain && !entry
          ? p
          : res.ok
            ? { ...p, icon: { ...p.icon, data: res.data } }
            : entry
              ? p
              : { ...p, icon: { kind: 'monogram' } },
      )
    })
  }

  const pickHit = (hit: SiteHit) => {
    haptic.select()
    const guess = catalogByDomain(hit.domain)?.category ?? hit.category
    setD((p) => ({
      ...p,
      icon: iconFromSite(hit),
      url: p.url || `https://${hit.domain}`,
      sitePicked: true,
      category: p.categoryPicked || !guess ? p.category : guess,
    }))
  }

  /** Look again from scratch: forget the hand-picked site. */
  const research = () => {
    setD((p) => ({ ...p, sitePicked: false, icon: { kind: 'monogram' } }))
    setNonce((n) => n + 1)
  }

  const submit = () => {
    let name = d.name.trim()
    let url = d.url.trim()
    const link = parseSite(name)
    if (link) {
      name = catalogByDomain(link.domain)?.name ?? brandFromDomain(link.domain)
      url = url || link.url
    }
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
      icon: link && d.icon.kind === 'monogram' ? { kind: 'remote', domain: link.domain } : d.icon,
      url: url ? url.slice(0, 400) : null,
      notes: d.notes.trim() ? d.notes.trim().slice(0, 500) : null,
    })
  }

  const siteDomain = parseSite(d.url)?.domain ?? (d.icon.kind !== 'monogram' ? d.icon.domain : null)

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
              placeholder={t('fNamePh')}
              aria-label={t('fName')}
              maxLength={400}
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="done"
              onPaste={() => {
                pasted.current = true
              }}
              onChange={(e) => {
                const value = e.target.value
                const link = pasted.current ? parseSite(value) : null
                pasted.current = false
                setError(null)
                if (link) applySite(link, value)
                else set('name', value)
              }}
            />
          </div>

          {typedLink ? (
            <div className="group sugg">
              <button type="button" className="row row-sugg" onClick={() => applySite(typedLink)}>
                <ServiceIcon
                  name={brandFromDomain(typedLink.domain)}
                  icon={{ kind: 'remote', domain: typedLink.domain }}
                  size={32}
                  online={online}
                />
                <span className="col grow">
                  <span className="t-body line">{brandFromDomain(typedLink.domain)}</span>
                  <span className="t-num c3 line">{typedLink.domain}</span>
                </span>
                <span className="btn btn-second btn-sm none">{t('done')}</span>
              </button>
            </div>
          ) : suggest.length > 0 ? (
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
                    <span className="t-num c3 line">{c.domain}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : searching ? (
            <div className="t-sub c3 line sugg-note">{t('searching')}</div>
          ) : search === 'done' && sites.length > 0 ? (
            <div className="site-pick">
              <span className="t-mono c3 line">{t('siteFound')}</span>
              <div className="site-chips">
                {sites.map((h) => (
                  <button
                    key={h.domain}
                    type="button"
                    className={cn('site-chip', d.icon.domain === h.domain && 'is-on')}
                    onClick={() => pickHit(h)}
                    title={h.title}
                  >
                    <ServiceIcon name={h.domain} icon={iconFromSite(h)} size={26} online={online} />
                    <span className="t-num line">{h.domain}</span>
                  </button>
                ))}
                <button type="button" className="site-chip" onClick={() => setPicker('site')}>
                  <Link2 size={16} className="c2" />
                  <span className="t-sub line">{t('siteOther')}</span>
                </button>
              </div>
            </div>
          ) : search === 'done' ? (
            <button type="button" className="sugg-note link-row" onClick={() => setPicker('site')}>
              <span className="t-sub c2 line">{t('siteNone')}</span>
            </button>
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
            <FormRow
              label={t('fSite')}
              values={[siteDomain ?? t('siteAdd')]}
              onClick={() => setPicker('site')}
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
          { value: 'site', label: t('iconSite') },
          { value: 'letter', label: t('iconLetter') },
        ]}
        value={undefined}
        onPick={(v) => {
          if (v === 'letter') setD((p) => ({ ...p, icon: { kind: 'monogram' }, sitePicked: true }))
          else if (v === 'site') setTimeout(() => setPicker('site'), 300)
          else research()
        }}
        onClose={() => setPicker(null)}
      />
      <SiteSheet
        open={picker === 'site'}
        value={d.url || siteDomain || ''}
        canClear={Boolean(d.url)}
        onSave={(site) => applySite(site)}
        onClear={() => setD((p) => ({ ...p, url: '' }))}
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

/** Type or paste the service address; the icon and (for an empty name) the name follow it. */
function SiteSheet({
  open,
  value,
  canClear,
  onSave,
  onClear,
  onClose,
}: {
  open: boolean
  value: string
  canClear: boolean
  onSave: (site: Site) => void
  onClear: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [v, setV] = useState(value)
  const [err, setErr] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open) {
      setV(value)
      setErr(false)
    }
  }, [open, value])
  const save = () => {
    const site = parseSite(v)
    if (!site) {
      haptic.warn()
      return setErr(true)
    }
    onSave(site)
    onClose()
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      label={t('siteTitle')}
      onOpened={() => ref.current?.focus()}
    >
      <div className="sheet-head">
        <span className="t-head line grow">{t('siteTitle')}</span>
      </div>
      <div className="sheet-body">
        <input
          ref={ref}
          className="field field-mono"
          value={v}
          placeholder={t('sitePh')}
          aria-label={t('fSite')}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="url"
          spellCheck={false}
          enterKeyHint="done"
          onChange={(e) => {
            setV(e.target.value)
            setErr(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
          }}
        />
        {err ? <div className="err t-sub line">{t('siteBad')}</div> : null}
        <p className="t-sub c3 multi" style={{ padding: '10px 4px 0' }}>
          {t('siteHint')}
        </p>
      </div>
      <div className="sheet-foot row-gap">
        {canClear ? (
          <button
            type="button"
            className="btn btn-second none"
            onClick={() => {
              onClear()
              onClose()
            }}
          >
            {t('siteClear')}
          </button>
        ) : null}
        <button type="button" className="btn btn-primary grow" onClick={save}>
          {t('done')}
        </button>
      </div>
    </Sheet>
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
