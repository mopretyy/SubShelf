import { Capacitor } from '@capacitor/core'
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications'
import { addDays, fmtDate, fmtMoney, localYmd, upcomingCharges, type Sub } from './dates'
import type { I18n } from './i18n'

const CHANNEL = 'charges'
/** How many future charges of an active subscription get reminders, so they fire even if the app stays closed. */
const OCCURRENCES = 2

export type NotifState = 'granted' | 'denied' | 'prompt' | 'unsupported'

export const isNative = () => Capacitor.isNativePlatform()

export async function notifState(): Promise<NotifState> {
  if (!isNative()) return 'unsupported'
  const { display } = await LocalNotifications.checkPermissions()
  return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt'
}

export async function requestNotifs(): Promise<NotifState> {
  if (!isNative()) return 'unsupported'
  const { display } = await LocalNotifications.requestPermissions()
  return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt'
}

/** Android needs a channel for importance and sound; iOS has no channels (the call would reject). */
export async function ensureChannel(i18n: I18n): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return
  await LocalNotifications.createChannel({
    id: CHANNEL,
    name: i18n.t('channelName'),
    importance: 4,
    visibility: 1,
  })
}

function atLocal(ymd: string, hour: number): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d, hour, 0, 0, 0)
}

/** One reminder `remind` days before each upcoming charge plus one on the day itself. */
export function buildReminders(subs: Sub[], i18n: I18n, hour: number, now = new Date()) {
  const today = localYmd(now)
  const list: LocalNotificationSchema[] = []
  for (const s of subs) {
    if (s.remind === null) continue
    const offsets = s.remind === 0 ? [0] : [-s.remind, 0]
    upcomingCharges(s, today, s.status === 'trial' ? 1 : OCCURRENCES).forEach((date, occ) => {
      offsets.forEach((offset, k) => {
        const at = atLocal(addDays(date, offset), hour)
        if (at.getTime() <= now.getTime()) return
        const price = s.price != null ? fmtMoney(s.price, s.currency, i18n.locale) : ''
        const when =
          offset === 0
            ? i18n.t('whenToday')
            : offset === -1
              ? i18n.t('whenTomorrow')
              : i18n.t('whenIn', { n: -offset })
        const title =
          s.status === 'trial'
            ? i18n.t('nTrialTitle', { name: s.name, when })
            : i18n.t('nActiveTitle', { name: s.name, when })
        const body = i18n.t(s.status === 'trial' ? 'nTrialBody' : 'nActiveBody', {
          date: fmtDate(date, i18n.locale, true),
          price: price || '—',
        })
        list.push({
          id: s.id * 10 + occ * 2 + k,
          title,
          body,
          channelId: CHANNEL,
          schedule: { at, allowWhileIdle: true },
          extra: { subId: s.id },
        })
      })
    })
  }
  return list
}

/** Replace every pending reminder with a fresh set built from the current list. */
export async function reschedule(subs: Sub[], i18n: I18n, hour: number): Promise<void> {
  if ((await notifState()) !== 'granted') return
  const pending = await LocalNotifications.getPending()
  if (pending.notifications.length) {
    await LocalNotifications.cancel({
      notifications: pending.notifications.map((n) => ({ id: n.id })),
    })
  }
  const list = buildReminders(subs, i18n, hour)
  if (list.length) await LocalNotifications.schedule({ notifications: list })
}

export async function sendTest(i18n: I18n): Promise<void> {
  await LocalNotifications.schedule({
    notifications: [
      {
        id: 9,
        title: i18n.t('notifTestTitle'),
        body: i18n.t('notifTestBody'),
        channelId: CHANNEL,
        schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true },
      },
    ],
  })
}
