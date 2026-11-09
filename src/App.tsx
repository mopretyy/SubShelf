import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChartColumn, List, Plus, User } from 'lucide-react'
import { App as CapApp } from '@capacitor/app'
import { LocalNotifications } from '@capacitor/local-notifications'
import { StatusBar, Style } from '@capacitor/status-bar'
import { popBack, useBack } from '@/lib/back'
import { billing } from '@/lib/billing'
import { CHANNEL, LICENSE_PUBKEY } from '@/lib/config'
import { localYmd, nextCharge, type Sub } from '@/lib/dates'
import { I18nContext, makeI18n, resolveLang } from '@/lib/i18n'
import { withIconData } from '@/lib/icons'
import { cleanKey, LICENSE_PREFIX, licenseActive, readLicense } from '@/lib/license'
import { haptic, openUrl } from '@/lib/native'
import { ensureChannel, isNative, notifState, requestNotifs, reschedule } from '@/lib/notify'
import { canAdd, effectivePro, type Feature } from '@/lib/pro'
import {
  defaultSettings,
  emptyPro,
  loadPro,
  loadSettings,
  loadSubs,
  nextId,
  savePro,
  saveSettings,
  saveSubs,
  type ProStore,
  type Settings as SettingsT,
  type StoreEntitlement,
} from '@/lib/store'
import { cn } from '@/lib/cn'
import { Detail } from '@/components/Detail'
import { Fit } from '@/components/Fit'
import { Home } from '@/components/Home'
import { Insights } from '@/components/Insights'
import { Onboarding } from '@/components/Onboarding'
import { Paywall, type LicenseResult } from '@/components/Paywall'
import { Profile } from '@/components/Profile'
import { Settings } from '@/components/Settings'
import { ConfirmDialog, Sheet, Toast, type ConfirmState, type ToastState } from '@/components/Sheet'
import { SubForm, type SubFields } from '@/components/SubForm'

type Tab = 'subs' | 'insights' | 'profile'

export function App() {
  const [subs, setSubs] = useState<Sub[] | null>(null)
  const [settings, setSettings] = useState<SettingsT>(defaultSettings)
  const [proStore, setProStore] = useState<ProStore>(emptyPro)
  const [today, setToday] = useState(() => localYmd())
  const [tab, setTab] = useState<Tab>('subs')
  const [page, setPage] = useState<'main' | 'settings'>('main')
  const [detailId, setDetailId] = useState<number | null>(null)
  const [form, setForm] = useState<{ sub: Sub | null; restore: boolean } | null>(null)
  const [paywall, setPaywall] = useState<{ feature: Feature | null } | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [actions, setActions] = useState<Sub | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [onboarding, setOnboarding] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const i18n = useMemo(() => makeI18n(resolveLang(settings.lang)), [settings.lang])
  const { t } = i18n
  const online = settings.autoIcons
  const pro = useMemo(
    () => effectivePro(proStore, CHANNEL, LICENSE_PUBKEY, today),
    [proStore, today],
  )

  // One light style: dark status bar icons on paper.
  useEffect(() => {
    document.documentElement.lang = i18n.lang
    if (isNative()) {
      void StatusBar.setStyle({ style: Style.Light }).catch(() => {})
      void StatusBar.setBackgroundColor({ color: '#eaeaea' }).catch(() => {})
    }
  }, [i18n.lang])

  const notify = useCallback((text: string, action?: ToastState['action']) => {
    setToast({ id: Date.now(), text, action })
  }, [])
  const clearToast = useCallback(() => setToast(null), [])

  const updatePro = useCallback((fn: (p: ProStore) => ProStore) => {
    setProStore((prev) => {
      const next = fn(prev)
      savePro(next).catch((err: unknown) => console.error(err))
      return next
    })
  }, [])

  const onStore = useCallback(
    (e: StoreEntitlement | null) => updatePro((p) => ({ ...p, store: e })),
    [updatePro],
  )

  // Initial load. People who had data before Pro existed keep everything for free.
  useEffect(() => {
    void Promise.all([loadSubs(), loadSettings(), loadPro()])
      .then(([list, s, p]) => {
        let proState = p ?? emptyPro
        if (p === null) {
          proState = { ...emptyPro, founder: isNative() && list.length > 0 }
          void savePro(proState)
        }
        setSettings(s)
        setProStore(proState)
        setSubs(list)
        if (!s.onboarded && list.length === 0) setOnboarding(true)
      })
      .catch((err: unknown) => {
        console.error(err)
        setSubs([])
      })
  }, [])

  // Store billing: the SDK knows the truth, our copy only covers the first frames and offline starts.
  useEffect(() => {
    if (billing.kind !== 'store') return
    void billing.init(onStore).then((e) => {
      if (e !== undefined) onStore(e)
    })
  }, [onStore])

  // Reminders follow the list, debounced so typing and quick edits do not hammer the bridge.
  useEffect(() => {
    if (!subs) return
    const tm = window.setTimeout(() => {
      void ensureChannel(i18n)
        .then(() => reschedule(subs, i18n, settings.remindHour))
        .catch((err: unknown) => console.error('SubShelf: reschedule failed', err))
    }, 500)
    return () => window.clearTimeout(tm)
  }, [subs, i18n, settings.remindHour])

  const commit = useCallback(
    (next: Sub[]) => {
      setSubs(next)
      saveSubs(next).catch((err: unknown) => {
        console.error(err)
        notify(t('saveErr'))
      })
    },
    [notify, t],
  )
  const subsRef = useRef<Sub[]>([])
  subsRef.current = subs ?? []

  const updateSettings = (s: SettingsT) => {
    setSettings(s)
    saveSettings(s).catch((err: unknown) => console.error(err))
  }

  // Refresh "today" on resume; the Android back button closes the top layer first.
  useEffect(() => {
    const resume = CapApp.addListener('resume', () => setToday(localYmd()))
    const back = CapApp.addListener('backButton', () => {
      if (!popBack()) void CapApp.exitApp()
    })
    return () => {
      void resume.then((h) => h.remove())
      void back.then((h) => h.remove())
    }
  }, [])
  // Tapping a reminder opens that subscription, with the link to cancel it on the site.
  useEffect(() => {
    if (!isNative()) return
    const tap = LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
      const id = Number((e.notification.extra as { subId?: unknown } | undefined)?.subId)
      if (!Number.isInteger(id) || id <= 0) return
      setTab('subs')
      setPage('main')
      setDetailId(id)
    })
    return () => {
      void tap.then((h) => h.remove())
    }
  }, [])
  useBack(tab !== 'subs', () => setTab('subs'))
  useBack(tab === 'profile' && page === 'settings', () => setPage('main'))

  const items = useMemo(
    () =>
      (subs ?? [])
        .filter((s) => !s.archivedAt)
        .map((s) => ({ s, next: nextCharge(s, today) }))
        .sort((a, b) => {
          const ra = a.next?.overdue ? 0 : a.next ? 1 : 2
          const rb = b.next?.overdue ? 0 : b.next ? 1 : 2
          if (ra !== rb) return ra - rb
          if (a.next && b.next && a.next.date !== b.next.date)
            return a.next.date < b.next.date ? -1 : 1
          return a.s.name.localeCompare(b.s.name)
        }),
    [subs, today],
  )

  const detail = subs?.find((s) => s.id === detailId) ?? null

  const openPaywall = useCallback((feature: Feature | null = null) => {
    haptic.tap()
    setPaywall({ feature })
  }, [])

  /** New subscription, unless the free plan is full. */
  const openAdd = () => {
    if (!canAdd(subsRef.current, pro)) return openPaywall('limit')
    haptic.tap()
    setForm({ sub: null, restore: false })
  }

  /** Cache the icon image right after saving, so the list works offline and never refetches. */
  const cacheIcon = useCallback(
    (id: number) => {
      const s = subsRef.current.find((x) => x.id === id)
      if (!s || !online) return
      void withIconData(s.icon, online).then((icon) => {
        if (icon === s.icon || !icon.data) return
        commit(subsRef.current.map((x) => (x.id === id ? { ...x, icon } : x)))
      })
    },
    [commit, online],
  )

  const saveForm = async (fields: SubFields) => {
    if (!subs || !form) return
    let id: number
    if (!form.sub) {
      id = nextId(subs)
      commit([...subs, { ...fields, id, createdAt: Date.now(), archivedAt: null }])
      notify(t('addedToast', { name: fields.name }))
    } else {
      id = form.sub.id
      commit(
        subs.map((s) =>
          s.id === id ? { ...s, ...fields, archivedAt: form.restore ? null : s.archivedAt } : s,
        ),
      )
      notify(form.restore ? t('restoredToast', { name: fields.name }) : t('savedToast'))
      if (form.restore) {
        setTab('subs')
        setPage('main')
      }
    }
    setForm(null)
    setTimeout(() => cacheIcon(id), 50)
    if ((await notifState()) === 'prompt') await requestNotifs()
  }

  const askCancel = (sub: Sub) => {
    setDetailId(null)
    setConfirm({
      title: t('confirmCancelTitle', { name: sub.name }),
      body: t('confirmCancelBody'),
      yes: t('confirmCancelYes'),
      onYes: () => {
        const list = subsRef.current
        commit(list.map((s) => (s.id === sub.id ? { ...s, archivedAt: today } : s)))
        notify(t('movedToHistory', { name: sub.name }), {
          label: t('undo'),
          run: () =>
            commit(subsRef.current.map((s) => (s.id === sub.id ? { ...s, archivedAt: null } : s))),
        })
      },
    })
  }

  const askDelete = (sub: Sub) => {
    setDetailId(null)
    setConfirm({
      title: t('confirmDeleteTitle', { name: sub.name }),
      body: t('confirmDeleteBody'),
      yes: t('delete'),
      danger: true,
      onYes: () => commit(subsRef.current.filter((s) => s.id !== sub.id)),
    })
  }

  /** An ended trial: it became a paid plan (charges roll on from the trial end) or was cancelled. */
  const resolveTrial = (sub: Sub, kept: boolean) => {
    haptic.tap()
    if (kept) {
      commit(subsRef.current.map((s) => (s.id === sub.id ? { ...s, status: 'active' } : s)))
      notify(t('attnKeptToast', { name: sub.name }))
      return
    }
    const day = sub.nextDate && sub.nextDate < today ? sub.nextDate : today
    commit(subsRef.current.map((s) => (s.id === sub.id ? { ...s, archivedAt: day } : s)))
    notify(t('movedToHistory', { name: sub.name }), {
      label: t('undo'),
      run: () =>
        commit(subsRef.current.map((s) => (s.id === sub.id ? { ...s, archivedAt: null } : s))),
    })
  }

  const openEdit = (sub: Sub) => {
    setDetailId(null)
    setTimeout(() => setForm({ sub, restore: false }), 120)
  }

  const restoreFromHistory = (sub: Sub) => {
    if (!canAdd(subsRef.current, pro)) return openPaywall('limit')
    setForm({ sub, restore: true })
  }

  const manage = () => {
    void billing.manageUrl().then((url) => {
      if (url) void openUrl(url)
    })
  }

  const activateLicense = (raw: string): LicenseResult => {
    const l = readLicense(raw, LICENSE_PUBKEY)
    if (!l) return { ok: false, expired: null }
    if (!licenseActive(l, today)) return { ok: false, expired: l.until }
    updatePro((p) => ({ ...p, license: LICENSE_PREFIX + cleanKey(raw) }))
    return { ok: true }
  }

  const finishOnboarding = () => {
    setOnboarding(false)
    updateSettings({ ...settings, onboarded: true })
    // One gentle look at Pro after the welcome; a single tap closes it.
    if (!pro.active) setTimeout(() => setPaywall({ feature: null }), 450)
  }

  const goTab = (next: Tab) => {
    if (next === tab) {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      if (next === 'profile') setPage('main')
      return
    }
    haptic.select()
    setTab(next)
    setPage('main')
    scrollRef.current?.scrollTo({ top: 0 })
  }

  const tabs: { id: Tab; icon: typeof List; label: string[] }[] = [
    { id: 'subs', icon: List, label: [t('subs'), t('subsShort')] },
    { id: 'insights', icon: ChartColumn, label: [t('insights')] },
    { id: 'profile', icon: User, label: [t('profile')] },
  ]

  return (
    <I18nContext.Provider value={i18n}>
      <div className="shell">
        <div ref={scrollRef} className="scroll">
          <div className="content" key={`${tab}-${page}`}>
            {tab === 'subs' ? (
              <Home
                items={items}
                loading={subs === null}
                today={today}
                online={online}
                pro={pro}
                currency={settings.currency}
                onAdd={openAdd}
                onOpen={(s) => setDetailId(s.id)}
                onLongPress={setActions}
                onPro={() => openPaywall('limit')}
                onResolveTrial={resolveTrial}
              />
            ) : tab === 'insights' ? (
              <Insights
                subs={subs ?? []}
                today={today}
                online={online}
                pro={pro}
                currency={settings.currency}
                onPro={() => openPaywall('insights')}
                onOpen={(s) => setDetailId(s.id)}
              />
            ) : page === 'settings' ? (
              <Settings
                settings={settings}
                subs={subs ?? []}
                pro={pro}
                onChange={updateSettings}
                onImport={commit}
                onBack={() => setPage('main')}
                onPro={(f) => openPaywall(f ?? null)}
                onStore={onStore}
                onManage={manage}
                notify={notify}
                confirm={(text, onYes) =>
                  setConfirm({ title: t('importFile'), body: text, yes: t('done'), onYes })
                }
              />
            ) : (
              <Profile
                subs={subs ?? []}
                name={settings.profileName}
                online={online}
                today={today}
                pro={pro}
                currency={settings.currency}
                onRename={() => setRenaming(true)}
                onRestore={restoreFromHistory}
                onOpenSettings={() => setPage('settings')}
                onPro={() => openPaywall()}
                onManage={manage}
              />
            )}
          </div>
        </div>

        <nav className="tabbar" aria-label={t('subs')}>
          <div className="tabs">
            {tabs.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                type="button"
                className={cn('tab', tab === id && 'is-on')}
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => goTab(id)}
              >
                <Icon size={21} strokeWidth={tab === id ? 2.1 : 1.8} />
                <Fit className="t-tab" variants={label} />
              </button>
            ))}
          </div>
          <button type="button" className="fab" aria-label={t('add')} onClick={openAdd}>
            <Plus size={26} strokeWidth={2} />
          </button>
        </nav>

        <Detail
          sub={detail}
          next={detail ? nextCharge(detail, today) : null}
          today={today}
          online={online}
          onClose={() => setDetailId(null)}
          onEdit={openEdit}
          onCancelSub={askCancel}
          onDelete={askDelete}
        />

        <SubForm
          open={form !== null}
          sub={form?.sub ?? null}
          restore={form?.restore ?? false}
          today={today}
          online={online}
          defaultRemind={settings.defaultRemind}
          defaultCurrency={settings.currency}
          onSave={(f) => void saveForm(f)}
          onClose={() => setForm(null)}
        />

        <Paywall
          open={paywall !== null}
          feature={paywall?.feature ?? null}
          pro={pro}
          onClose={() => setPaywall(null)}
          onStore={onStore}
          onDemo={() => updatePro((p) => ({ ...p, demo: true }))}
          onLicense={activateLicense}
          notify={notify}
        />

        <Sheet open={actions !== null} onClose={() => setActions(null)} label={actions?.name ?? ''}>
          {actions ? (
            <>
              <div className="sheet-head">
                <span className="t-head line grow">{actions.name}</span>
              </div>
              <div className="sheet-body">
                <div className="group">
                  {[
                    { label: t('edit'), run: () => openEdit(actions) },
                    { label: t('actionCancel'), run: () => askCancel(actions) },
                    { label: t('delete'), run: () => askDelete(actions), danger: true },
                  ].map((a) => (
                    <button
                      key={a.label}
                      type="button"
                      className={cn('row row-form row-plain', a.danger && 'dng')}
                      onClick={() => {
                        setActions(null)
                        a.run()
                      }}
                    >
                      <span className="t-body line grow">{a.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </Sheet>

        <RenameSheet
          open={renaming}
          value={settings.profileName ?? ''}
          title={t('rename')}
          saveLabel={t('save')}
          onSave={(name) => updateSettings({ ...settings, profileName: name.trim() || null })}
          onClose={() => setRenaming(false)}
        />

        <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} noLabel={t('notNow')} />
        <Toast toast={toast} onDone={clearToast} />
        {onboarding ? <Onboarding online={online} today={today} onDone={finishOnboarding} /> : null}
      </div>
    </I18nContext.Provider>
  )
}

function RenameSheet({
  open,
  value,
  title,
  saveLabel,
  onSave,
  onClose,
}: {
  open: boolean
  value: string
  title: string
  saveLabel: string
  onSave: (v: string) => void
  onClose: () => void
}) {
  const [v, setV] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open) setV(value)
  }, [open, value])
  return (
    <Sheet open={open} onClose={onClose} label={title} onOpened={() => ref.current?.focus()}>
      <div className="sheet-head">
        <span className="t-head line grow">{title}</span>
      </div>
      <div className="sheet-body">
        <input
          ref={ref}
          className="name-input wide-input"
          value={v}
          maxLength={40}
          onChange={(e) => setV(e.target.value)}
        />
      </div>
      <div className="sheet-foot">
        <button
          type="button"
          className="btn btn-primary btn-wide"
          onClick={() => {
            onSave(v)
            onClose()
          }}
        >
          {saveLabel}
        </button>
      </div>
    </Sheet>
  )
}
