import { addDays, fmtDate, fmtMoney } from '@/lib/dates'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/cn'
import { ServiceIcon } from './ServiceIcon'

/** A few example rows for the empty state and the welcome screens, in the device's formats. */
export function SampleStack({
  online,
  today,
  count,
}: {
  online: boolean
  today: string
  count: number
}) {
  const { t, locale } = useI18n()
  const rows: [string, string, number, string, string][] = [
    ['Netflix', 'netflix.com', 15.49, 'pill-solid', t('whenTomorrow')],
    ['ChatGPT Plus', 'chatgpt.com', 20, 'pill-out', t('whenIn', { n: 4 })],
    ['Spotify Premium', 'spotify.com', 11.99, 'pill-plain', fmtDate(addDays(today, 19), locale)],
    ['iCloud+', 'icloud.com', 2.99, 'pill-plain', fmtDate(addDays(today, 24), locale)],
  ]
  return (
    <div className="mini-stack" aria-hidden="true">
      {rows.slice(0, count).map(([name, domain, price, kind, when]) => (
        <div key={name} className="mini">
          <ServiceIcon name={name} icon={{ kind: 'catalog', domain }} size={34} online={online} />
          <span className="col grow">
            <span className="t-head line">{name}</span>
            <span className="t-sub c3 line">
              {fmtMoney(price, 'USD', locale)}
              {t('shortmonthly')}
            </span>
          </span>
          <span className={cn('pill', kind)}>{when}</span>
        </div>
      ))}
    </div>
  )
}
