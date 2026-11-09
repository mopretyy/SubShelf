import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { Device } from '@capacitor/device'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

const native = () => Capacitor.isNativePlatform()

/** Light tactile ticks, as in Apple's own apps. Silent in the browser. */
export const haptic = {
  tap: () => {
    if (native()) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
  },
  select: () => {
    if (native()) void Haptics.selectionChanged().catch(() => {})
  },
  success: () => {
    if (native()) void Haptics.notification({ type: NotificationType.Success }).catch(() => {})
  },
  warn: () => {
    if (native()) void Haptics.notification({ type: NotificationType.Warning }).catch(() => {})
  },
}

/** Opens a link in the in-app browser (Custom Tabs / Safari view) or a new tab on the web. */
export async function openUrl(url: string): Promise<void> {
  if (!url) return
  if (native() && /^https?:/.test(url)) {
    await Browser.open({ url, presentationStyle: 'popover' }).catch(() =>
      window.open(url, '_blank'),
    )
  } else {
    window.open(url, '_blank', 'noopener')
  }
}

/** Phone brands with aggressive battery savers that silence scheduled reminders. */
export type Vendor = 'xiaomi' | 'huawei' | 'samsung' | 'oppo' | 'vivo' | 'other'

export async function vendor(): Promise<Vendor> {
  if (Capacitor.getPlatform() !== 'android') return 'other'
  try {
    const { manufacturer } = await Device.getInfo()
    const m = manufacturer.toLowerCase()
    if (/xiaomi|redmi|poco/.test(m)) return 'xiaomi'
    if (/huawei|honor/.test(m)) return 'huawei'
    if (/samsung/.test(m)) return 'samsung'
    if (/oppo|realme|oneplus/.test(m)) return 'oppo'
    if (/vivo|iqoo/.test(m)) return 'vivo'
  } catch {
    // Unknown device: show every brand.
  }
  return 'other'
}
