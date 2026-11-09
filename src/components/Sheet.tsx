import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { useBack } from '@/lib/back'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/native'

const DURATION = 320

/** Mount/unmount with a CSS transition: `shown` flips one frame after mount and before unmount. */
function useTransition(open: boolean) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (open) {
      setMounted(true)
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(id)
    }
    setShown(false)
    const tm = setTimeout(() => setMounted(false), DURATION)
    return () => clearTimeout(tm)
  }, [open])
  return { mounted, shown }
}

/**
 * Pull the grabber or the header down to close, as on iOS. The body keeps its own scroll,
 * so dragging starts only from the top area and never from buttons or fields.
 */
function useDragToClose(onClose: () => void) {
  const ref = useRef<HTMLElement>(null)
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null)

  const onPointerDown = (e: PointerEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest('.grab-zone, .sheet-head')) return
    if (target.closest('button, input, textarea, a')) return
    drag.current = { y: e.clientY, t: performance.now(), dy: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
    ref.current?.classList.add('is-dragging')
  }
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current
    if (!d || !ref.current) return
    // Resist upward pulls, follow downward ones.
    const raw = e.clientY - d.y
    d.dy = raw > 0 ? raw : raw / 6
    ref.current.style.transform = `translate3d(0, ${d.dy}px, 0)`
  }
  const end = () => {
    const d = drag.current
    drag.current = null
    const el = ref.current
    if (!d || !el) return
    el.classList.remove('is-dragging')
    el.style.transform = ''
    const speed = d.dy / Math.max(1, performance.now() - d.t)
    if (d.dy > 120 || (d.dy > 40 && speed > 0.5)) {
      haptic.tap()
      onClose()
    }
  }
  return { ref, onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end }
}

/**
 * Bottom sheet. Compositor-only transform transition, solid surface.
 * `onOpened` fires after the slide-in finishes: focus inputs there so the keyboard never
 * resizes the page mid-animation. `cover` makes it a full-screen page (paywall).
 */
export function Sheet({
  open,
  onClose,
  full,
  cover,
  onOpened,
  children,
  label,
  className,
}: {
  open: boolean
  onClose: () => void
  full?: boolean
  cover?: boolean
  onOpened?: () => void
  children: ReactNode
  label: string
  className?: string
}) {
  const { mounted, shown } = useTransition(open)
  const opened = useRef(onOpened)
  opened.current = onOpened
  useBack(open, onClose)
  const { ref, ...dragHandlers } = useDragToClose(onClose)
  if (!mounted) return null
  return (
    <div className="layer">
      <div className={cn('scrim', shown && 'is-open')} onClick={onClose} />
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cn(
          'sheet',
          full && 'sheet-full',
          cover && 'sheet-cover',
          shown && 'is-open',
          className,
        )}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && shown) opened.current?.()
        }}
        {...(cover ? {} : dragHandlers)}
      >
        {cover ? null : (
          <div className="grab-zone" aria-hidden="true">
            <div className="grab" />
          </div>
        )}
        {children}
      </section>
    </div>
  )
}

export interface Choice<T> {
  value: T
  label: string
  hint?: string
}

export function ChoiceSheet<T>({
  open,
  title,
  options,
  value,
  onPick,
  onClose,
}: {
  open: boolean
  title: string
  options: Choice<T>[]
  value: T | undefined
  onPick: (v: T) => void
  onClose: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} label={title}>
      <div className="sheet-head">
        <span className="t-head line grow">{title}</span>
      </div>
      <div className="sheet-body">
        <div className="group">
          {options.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              className="row row-form row-plain"
              onClick={() => {
                haptic.select()
                onPick(o.value)
                onClose()
              }}
            >
              <span className="t-body line grow">{o.label}</span>
              {o.hint ? <span className="t-num c3 none">{o.hint}</span> : null}
              {o.value === value ? <Check className="none" size={20} strokeWidth={2.2} /> : null}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  )
}

export interface ConfirmState {
  title: string
  body: string
  yes: string
  danger?: boolean
  onYes: () => void
}

export function ConfirmDialog({
  state,
  onClose,
  noLabel,
}: {
  state: ConfirmState | null
  onClose: () => void
  noLabel: string
}) {
  const { mounted, shown } = useTransition(state !== null)
  const last = useRef<ConfirmState | null>(state)
  if (state) last.current = state
  useBack(state !== null, onClose)
  const s = last.current
  if (!mounted || !s) return null
  return (
    <div className="layer">
      <div className={cn('scrim', shown && 'is-open')} onClick={onClose} />
      <div role="alertdialog" aria-modal="true" className={cn('dialog', shown && 'is-open')}>
        <div className="t-title multi">{s.title}</div>
        <p className="t-body c2 multi">{s.body}</p>
        <button
          type="button"
          className={cn('btn btn-wide', s.danger ? 'btn-second dng' : 'btn-primary')}
          onClick={() => {
            haptic.tap()
            onClose()
            s.onYes()
          }}
        >
          {s.yes}
        </button>
        <button type="button" className="btn btn-ghost btn-wide" onClick={onClose}>
          {noLabel}
        </button>
      </div>
    </div>
  )
}

export interface ToastState {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

export function Toast({ toast, onDone }: { toast: ToastState | null; onDone: () => void }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!toast) return
    const a = requestAnimationFrame(() => setShown(true))
    const hide = setTimeout(() => setShown(false), 3800)
    const done = setTimeout(onDone, 4000)
    return () => {
      cancelAnimationFrame(a)
      clearTimeout(hide)
      clearTimeout(done)
      setShown(false)
    }
  }, [toast, onDone])
  if (!toast) return null
  return (
    <div className={cn('toast', shown && 'is-open')} role="status">
      <span className="t-sub line grow">{toast.text}</span>
      {toast.action ? (
        <button
          type="button"
          className="toast-btn none"
          onClick={() => {
            toast.action?.run()
            onDone()
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
    </div>
  )
}
