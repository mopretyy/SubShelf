import { useEffect, useRef, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { billing } from '@/lib/billing'
import { CHANNEL, PRIVACY_URL, SUPPORT_EMAIL, TERMS_URL } from '@/lib/config'
import { REMIND_OPTIONS, type Sub } from '@/lib/dates'
import { useI18n, type Key } from '@/lib/i18n'
import { haptic, openUrl, vendor, type Vendor } from '@/lib/native'
import { isNative, notifState, requestNotifs, sendTest, type NotifState } from '@/lib/notify'
import type { Pro } from '@/lib/pro'
import {
  CURRENCIES,
  exportCsv,
  exportJson,
  importJson,
  type LangPref,
  type Settings as SettingsT,
  type StoreEntitlement,
} from '@/lib/store'
import { cn } from '@/lib/cn'
import { ChoiceSheet, Sheet } from './Sheet'
import { FormRow, remindKey } from './SubForm'

type Picker = 'hour' | 'remind' | 'lang' | 'currency' | 'battery' | null

const VENDORS: Vendor[] = ['xiaomi', 'huawei', 'samsung', 'oppo', 'vivo', 'other']
const CHANNEL_LABEL: Record<string, string> = {
  play: 'Google Play',
  appstore: 'App Store',
  direct: 'APK',
  web: 'Web',
}

export function Settings({
  settings,
  subs,
  pro,
  onChange,
  onImport,
  onBack,
  onPro,
  onStore,
  onManage,
  notify,
  confirm,
}: {
  settings: SettingsT
  subs: Sub[]
  pro: Pro
  onChange: (s: SettingsT) => void
  onImport: (subs: Sub[]) => void
  onBack: () => void
  onPro: (feature?: 'csv') => void
  onStore: (e: StoreEntitlement | null) => void
  onManage: () => void
  notify: (text: string) => void
  confirm: (text: string, onYes: () => void) => void
}) {
  const i18n = useI18n()
  const { t } = i18n
  const [picker, setPicker] = useState<Picker>(null)
  const [perm, setPerm] = useState<NotifState>('unsupported')
  const [brand, setBrand] = useState<Vendor>('other')
  const [restoring, setRestoring] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<SettingsT>) => onChange({ ...settings, ...patch })
  const ios = Capacitor.getPlatform() === 'ios'

  useEffect(() => {
    void notifState().then(setPerm)
    void vendor().then(setBrand)
  }, [])

  const langLabel: Record<LangPref, string> = {
    system: t('langSystem'),
    ru: 'Русский',
    en: 'English',
  }

  const share = async (text: string, title: string, copied: Key) => {
    try {
      if (isNative()) await Share.share({ title, text, dialogTitle: title })
      else {
        await navigator.clipboard.writeText(text)
        notify(t(copied))
      }
    } catch (err) {
      console.error(err)
    }
  }

  const doImport = async (file: File) => {
    try {
      const list = importJson(await file.text())
      confirm(t('importConfirm', { n: subs.length, m: list.length }), () => {
        onImport(list)
        notify(t('importDone', { n: list.length }))
      })
    } catch (err) {
      console.error(err)
      notify(t('importErr'))
    }
  }

  const testNotif = async () => {
    let p = perm
    if (p === 'prompt') {
      p = await requestNotifs()
      setPerm(p)
    }
    if (p === 'granted') {
      haptic.tap()
      await sendTest(i18n)
      notify(t('notifTestSent'))
    } else notify(p === 'unsupported' ? t('notifWebOnly') : t('notifDenied'))
  }

  const restore = async () => {
    setRestoring(true)
    try {
      const e = await billing.restore()
      onStore(e)
      notify(e ? t('restoredOk') : t('restoredNone'))
    } catch (err) {
      console.error(err)
      notify(t('restoreErr'))
    } finally {
      setRestoring(false)
    }
  }

  const vendors = ios
    ? (['ios'] as const)
    : [brand, ...VENDORS.filter((v) => v !== brand && v !== 'other'), 'other' as const].filter(
        (v, i, a) => a.indexOf(v) === i,
      )

  return (
    <div className="page-enter">
      <button type="button" className="btn btn-ghost back-btn" onClick={onBack}>
        <ChevronLeft size={22} /> <span className="t-body line">{t('profile')}</span>
      </button>
      <h1 className="t-large line page-title" style={{ margin: 0 }}>
        {t('settings')}
      </h1>

      <div className="t-mono c3 line sec-cap">{t('sReminders')}</div>
      <div className="group">
        <FormRow
          label={t('sRemindHour')}
          values={[`${String(settings.remindHour).padStart(2, '0')}:00`]}
          onClick={() => setPicker('hour')}
        />
        <FormRow
          label={t('sDefaultRemind')}
          values={[
            t(remindKey(settings.defaultRemind)),
            t(remindKey(settings.defaultRemind, true)),
          ]}
          onClick={() => setPicker('remind')}
        />
        <button type="button" className="row row-form row-plain" onClick={() => void testNotif()}>
          <span className="t-body line grow">
            {perm === 'prompt' ? t('notifAllow') : t('notifTest')}
          </span>
        </button>
        <FormRow
          label={t('batTitle')}
          values={['']}
          onClick={() => setPicker('battery')}
          className="row-label-grow"
        />
      </div>

      <div className="t-mono c3 line sec-cap">{t('sSubs')}</div>
      <div className="group">
        <FormRow
          label={t('sCurrency')}
          values={[settings.currency]}
          onClick={() => setPicker('currency')}
        />
        <SwitchRow
          label={t('sAutoIcons')}
          on={settings.autoIcons}
          onToggle={() => set({ autoIcons: !settings.autoIcons })}
        />
      </div>
      <p className="t-sub c3 multi foot-note">{t('sAutoIconsHint')}</p>

      <div className="t-mono c3 line sec-cap">{t('sData')}</div>
      <div className="group">
        <FormRow
          label={t('exportCopy')}
          values={['JSON']}
          onClick={() => void share(exportJson(subs), 'SubShelf backup', 'backupCopied')}
        />
        <button
          type="button"
          className="row row-form row-plain"
          onClick={() =>
            pro.active ? void share(exportCsv(subs), 'SubShelf.csv', 'csvCopied') : onPro('csv')
          }
        >
          <span className="t-body line grow">{t('exportCsv')}</span>
          {pro.active ? (
            <span className="t-num c3 none">CSV</span>
          ) : (
            <span className="pro-mark none">PRO</span>
          )}
        </button>
        <FormRow
          label={t('importFile')}
          values={['']}
          onClick={() => fileRef.current?.click()}
          className="row-label-grow"
        />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json,text/plain"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void doImport(f)
        }}
      />

      <div className="t-mono c3 line sec-cap">{t('sPro')}</div>
      <div className="group">
        {pro.active ? null : (
          <FormRow
            label={billing.kind === 'license' ? t('enterKey') : t('proCardMore')}
            values={['']}
            onClick={() => onPro()}
            className="row-label-grow"
          />
        )}
        {billing.kind === 'store' ? (
          <button
            type="button"
            className={cn('row row-form row-plain', restoring && 'is-busy')}
            disabled={restoring}
            onClick={() => void restore()}
          >
            <span className="t-body line grow">{t('restorePurchases')}</span>
          </button>
        ) : null}
        {billing.kind === 'store' && pro.source === 'store' ? (
          <FormRow
            label={t('manageSub')}
            values={['']}
            onClick={onManage}
            className="row-label-grow"
          />
        ) : null}
        {pro.active && billing.kind !== 'store' ? (
          <div className="row row-form row-plain no-press">
            <span className="t-body line grow">{t('proActive')}</span>
          </div>
        ) : null}
      </div>

      <div className="t-mono c3 line sec-cap">{t('sGeneral')}</div>
      <div className="group">
        <FormRow
          label={t('sLang')}
          values={[langLabel[settings.lang]]}
          onClick={() => setPicker('lang')}
        />
        <FormRow
          label={t('privacy')}
          values={['']}
          onClick={() => void openUrl(PRIVACY_URL)}
          className="row-label-grow"
        />
        <FormRow
          label={t('terms')}
          values={['']}
          onClick={() => void openUrl(TERMS_URL)}
          className="row-label-grow"
        />
        {SUPPORT_EMAIL ? (
          <FormRow
            label={t('support')}
            values={['']}
            onClick={() => {
              window.location.href = `mailto:${SUPPORT_EMAIL}?subject=SubShelf%20${encodeURIComponent(__APP_VERSION__)}`
            }}
            className="row-label-grow"
          />
        ) : null}
      </div>

      <div className="t-num c3 line center version">
        SubShelf {__APP_VERSION__} · {CHANNEL_LABEL[CHANNEL]}
      </div>

      <ChoiceSheet<number>
        open={picker === 'hour'}
        title={t('sRemindHour')}
        options={Array.from({ length: 16 }, (_, i) => ({
          value: i + 7,
          label: `${String(i + 7).padStart(2, '0')}:00`,
        }))}
        value={settings.remindHour}
        onPick={(v) => set({ remindHour: v })}
        onClose={() => setPicker(null)}
      />
      <ChoiceSheet
        open={picker === 'remind'}
        title={t('sDefaultRemind')}
        options={REMIND_OPTIONS.map((r) => ({ value: r, label: t(remindKey(r)) }))}
        value={settings.defaultRemind}
        onPick={(v) => set({ defaultRemind: v })}
        onClose={() => setPicker(null)}
      />
      <ChoiceSheet<LangPref>
        open={picker === 'lang'}
        title={t('sLang')}
        options={(['system', 'ru', 'en'] as LangPref[]).map((v) => ({
          value: v,
          label: langLabel[v],
        }))}
        value={settings.lang}
        onPick={(v) => set({ lang: v })}
        onClose={() => setPicker(null)}
      />
      <ChoiceSheet<string>
        open={picker === 'currency'}
        title={t('sCurrency')}
        options={(CURRENCIES.includes(settings.currency)
          ? CURRENCIES
          : [settings.currency, ...CURRENCIES]
        ).map((c) => ({ value: c, label: currencyName(c, i18n.locale), hint: c }))}
        value={settings.currency}
        onPick={(v) => set({ currency: v })}
        onClose={() => setPicker(null)}
      />
      <Sheet open={picker === 'battery'} onClose={() => setPicker(null)} label={t('batTitle')}>
        <div className="sheet-head">
          <span className="t-head line grow">{t('batTitle')}</span>
        </div>
        <div className="sheet-body">
          <p className="t-body c2 multi" style={{ padding: '0 2px 14px' }}>
            {t('batIntro')}
          </p>
          {vendors.map((v) => (
            <div key={v} className="card card-pad vendor">
              <div className="t-head line">{t(`bat${v}` as Key)}</div>
              <ol className="t-sub c2 multi steps" style={{ marginTop: 8 }}>
                {t(`bat${v}Steps` as Key)
                  .split('\n')
                  .map((step) => (
                    <li key={step}>{step}</li>
                  ))}
              </ol>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

function currencyName(code: string, locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: 'currency' }).of(code)
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : code
  } catch {
    return code
  }
}

export function SwitchRow({
  label,
  on,
  onToggle,
}: {
  label: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className="row row-form row-plain"
      role="switch"
      aria-checked={on}
      onClick={() => {
        haptic.select()
        onToggle()
      }}
    >
      <span className="t-body line grow">{label}</span>
      <span className={cn('switch none', on && 'is-on')} />
    </button>
  )
}
