import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { useUI } from './store'

export function Logo() {
  return (
    <a href="#/" className="logo" aria-label="Collage Card Maker — на главную">
      <span className="logo-badge">Collage</span>
      <span className="logo-sub">
        Card
        <br />
        Maker
      </span>
    </a>
  )
}

export function TopBar({ current, search, onSearch, placeholder }: { current: 'home' | 'library'; search?: string; onSearch?: (s: string) => void; placeholder?: string }) {
  return (
    <header className="topbar">
      <Logo />
      <nav className="nav" aria-label="Разделы">
        <a href="#/" aria-current={current === 'home' ? 'page' : undefined}>
          Мои открытки
        </a>
        <a href="#/library" aria-current={current === 'library' ? 'page' : undefined}>
          Библиотека элементов
        </a>
      </nav>
      {onSearch ? (
        <label className="search">
          <Icon name="search" />
          <span className="sr-only">{placeholder}</span>
          <input type="search" value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} />
        </label>
      ) : (
        <span style={{ width: 260 }} />
      )}
    </header>
  )
}

export function PageTitle({ children, tapes = true }: { children: ReactNode; tapes?: boolean }) {
  return (
    <div className="page-title">
      {tapes && <div className="tape mustard" style={{ left: -14, top: -10, width: 64, height: 20, transform: 'rotate(-24deg)' }} />}
      {tapes && <div className="tape clay" style={{ right: -16, top: -8, width: 56, height: 20, transform: 'rotate(18deg)' }} />}
      <h1>{children}</h1>
    </div>
  )
}

export function Modal({ children, onClose, width, label }: { children: ReactNode; onClose: () => void; width: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('button, input, textarea, select')?.focus()
    return () => {
      window.removeEventListener('keydown', k)
      prev?.focus?.()
    }
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={label} style={{ maxWidth: width }}>
        {children}
      </section>
    </div>
  )
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="ib" aria-label="Закрыть" onClick={onClick}>
      <Icon name="close" />
    </button>
  )
}

/** promise-based confirmation dialog */
let confirmResolver: ((v: string | null) => void) | null = null
const confirmListeners = new Set<(s: ConfirmState | null) => void>()
interface ConfirmState {
  title: string
  text: string
  ok: string
  input?: string
}
export function confirmDialog(title: string, text: string, ok = 'Удалить') {
  return new Promise<boolean>((res) => {
    confirmResolver = (v) => res(v !== null)
    confirmListeners.forEach((l) => l({ title, text, ok }))
  })
}
export function promptDialog(title: string, value: string, ok = 'Сохранить') {
  return new Promise<string | null>((res) => {
    confirmResolver = res
    confirmListeners.forEach((l) => l({ title, text: '', ok, input: value }))
  })
}
export function ConfirmHost() {
  const [s, setS] = useState<ConfirmState | null>(null)
  const [val, setVal] = useState('')
  useEffect(() => {
    const l = (x: ConfirmState | null) => {
      setS(x)
      setVal(x?.input ?? '')
    }
    confirmListeners.add(l)
    return () => {
      confirmListeners.delete(l)
    }
  }, [])
  if (!s) return null
  const done = (ok: boolean) => {
    confirmResolver?.(ok ? (s.input !== undefined ? val : '') : null)
    confirmResolver = null
    setS(null)
  }
  return (
    <Modal onClose={() => done(false)} width={460} label={s.title}>
      <div className="confirm">
        <h2>{s.title}</h2>
        {s.text && <p style={{ margin: 0 }}>{s.text}</p>}
        {s.input !== undefined && (
          <input className="field" value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && done(true)} aria-label={s.title} />
        )}
        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={() => done(false)}>
            Отмена
          </button>
          <button type="button" className="btn primary" onClick={() => done(true)}>
            {s.ok}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function Toast() {
  const t = useUI((s) => s.toast)
  if (!t) return null
  return (
    <div className="toast" role="status">
      {t.text}
    </div>
  )
}

/** small popup menu anchored to a relatively positioned parent */
export function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const f = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close()
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('mousedown', f)
    window.addEventListener('keydown', k)
    return () => {
      window.removeEventListener('mousedown', f)
      window.removeEventListener('keydown', k)
    }
  }, [open, close])
  return ref
}

export const TAPE_CLASSES = ['mustard', 'clay', 'slate', 'sage']

/** burst badge, used for "picked!" */
export function Burst({ label }: { label: string }) {
  const pts: string[] = []
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2
    const r = i % 2 ? 42 : 50
    pts.push(`${50 + Math.cos(a) * r},${50 + Math.sin(a) * r}`)
  }
  return (
    <span className="picked" aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <polygon points={pts.join(' ')} fill="#D2694B" stroke="#F6F1E7" strokeWidth="4" />
      </svg>
      <span>{label}</span>
    </span>
  )
}
