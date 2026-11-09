import { useState, type ReactNode } from 'react'
import { BellRing, Check, ShieldCheck } from 'lucide-react'
import { addDays, fmtDate, fmtMoney } from '@/lib/dates'
import { useI18n, type Key } from '@/lib/i18n'
import { haptic } from '@/lib/native'
import { notifState, requestNotifs } from '@/lib/notify'
import { cn } from '@/lib/cn'
import { LogoGlyph } from './Logo'
import { SampleStack } from './Samples'

/** Three calm screens on first launch. The art is made of the app's own UI pieces. */
export function Onboarding({
  online,
  today,
  onDone,
}: {
  online: boolean
  today: string
  onDone: () => void
}) {
  const { t, locale } = useI18n()
  const [step, setStep] = useState(0)
  const [notif, setNotif] = useState<'idle' | 'on' | 'off'>('idle')

  const allow = async () => {
    haptic.tap()
    let s = await notifState()
    if (s === 'prompt') s = await requestNotifs()
    setNotif(s === 'granted' ? 'on' : 'off')
    if (s === 'granted') haptic.success()
  }

  const pages: { title: Key; text: Key; art: ReactNode }[] = [
    {
      title: 'ob1t',
      text: 'ob1d',
      art: (
        <div style={{ width: '100%', maxWidth: 380 }}>
          <SampleStack online={online} today={today} count={4} />
        </div>
      ),
    },
    {
      title: 'ob2t',
      text: 'ob2d',
      art: (
        <div className="notif-mock">
          <span className="app-glyph">
            <LogoGlyph size={24} />
          </span>
          <span className="col grow">
            <span className="hstack">
              <span className="t-mono c3 line grow">SubShelf</span>
              <span className="t-num c3 none">10:00</span>
            </span>
            <span className="t-head multi">{t('obSampleNotif')}</span>
            <span className="t-sub c2 multi">
              {t('obSampleNotifBody', {
                date: fmtDate(addDays(today, 1), locale, true),
                price: fmtMoney(20, 'USD', locale),
              })}
            </span>
          </span>
        </div>
      ),
    },
    {
      title: 'ob3t',
      text: 'ob3d',
      art: (
        <div className="lock-mock">
          <ShieldCheck size={48} strokeWidth={1.5} />
        </div>
      ),
    },
  ]

  const last = step === pages.length - 1
  const page = pages[step]

  return (
    <div className="ob" role="dialog" aria-modal="true" aria-label={t(page.title)}>
      <div className="hstack" style={{ height: 44 }}>
        <span className="t-num c3 grow">
          {String(step + 1).padStart(2, '0')} / {String(pages.length).padStart(2, '0')}
        </span>
        {last ? null : (
          <button type="button" className="btn btn-ghost" onClick={onDone}>
            {t('obSkip')}
          </button>
        )}
      </div>

      <div className="ob-art" key={step}>
        <div className="frame frame-ticks page-enter" style={{ width: '100%' }}>
          {page.art}
        </div>
      </div>

      <div className="page-enter" key={`text-${step}`}>
        <h1 className="t-large multi" style={{ margin: 0 }}>
          {t(page.title)}
        </h1>
        <p className="t-body c2 multi" style={{ marginTop: 10, minHeight: 66 }}>
          {t(page.text)}
        </p>
      </div>

      <div style={{ marginTop: 18 }}>
        {step === 1 ? (
          <button
            type="button"
            className="btn btn-second btn-wide"
            style={{ marginBottom: 10 }}
            disabled={notif === 'on'}
            onClick={() => void allow()}
          >
            {notif === 'on' ? <Check size={18} /> : <BellRing size={18} />}
            {notif === 'on' ? t('ob2ok') : t('ob2btn')}
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-primary btn-wide"
          onClick={() => {
            haptic.tap()
            if (last) onDone()
            else setStep(step + 1)
          }}
        >
          {last ? t('obStart') : t('obNext')}
        </button>
        <div className="ob-dots" style={{ justifyContent: 'center', marginTop: 16 }}>
          {pages.map((p, i) => (
            <span key={p.title} className={cn(i === step && 'is-on')} />
          ))}
        </div>
      </div>
    </div>
  )
}
