import { useCallback, useEffect, useState } from 'react'
import { useEditor, emptyDoc } from '../editor'
import { useLibrary } from '../library'
import { saveCurrent } from '../drafts'
import { db } from '../db'
import { go } from '../router'
import { FORMATS, getFormat } from '../formats'
import { reshuffle } from '../autoLayout'
import { Icon } from '../ui/Icon'
import { useUI } from '../ui/store'
import { useOutsideClose } from '../ui/common'
import { Canvas } from './Canvas'
import { ElementsPanel, EL_TABS, type ElTab } from './ElementsPanel'
import { PropertiesPanel, kindOf, useNodeName } from './PropertiesPanel'

function useLoadCard(id: string) {
  const [ready, setReady] = useState(useEditor.getState().draftId === id)
  useEffect(() => {
    if (useEditor.getState().draftId === id) {
      setReady(true)
      return
    }
    let alive = true
    setReady(false)
    db.getDraft(id).then((d) => {
      if (!alive) return
      const ed = useEditor.getState()
      if (d) ed.open({ doc: d.doc, id: d.id, name: d.name, createdAt: d.createdAt, exported: d.exported, persisted: true })
      else ed.open({ doc: emptyDoc(), id, name: 'Новая открытка', createdAt: Date.now(), persisted: false })
      setReady(true)
    })
    return () => {
      alive = false
    }
  }, [id])
  return ready
}

function useAutosave() {
  const doc = useEditor((s) => s.doc)
  const name = useEditor((s) => s.name)
  const saveState = useEditor((s) => s.saveState)
  const liveBase = useEditor((s) => s.liveBase)
  useEffect(() => {
    if (saveState !== 'dirty' || liveBase) return
    const t = setTimeout(() => saveCurrent(), 900)
    return () => clearTimeout(t)
  }, [doc, name, saveState, liveBase])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().saveState !== 'saved') {
        saveCurrent()
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])
}

function useShortcuts(setZoom: (fn: (z: number) => number) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return
      const ed = useEditor.getState()
      const mod = e.ctrlKey || e.metaKey
      const code = e.code
      if (mod && code === 'KeyZ') {
        e.preventDefault()
        if (e.shiftKey) ed.redo()
        else ed.undo()
      } else if (mod && code === 'KeyY') {
        e.preventDefault()
        ed.redo()
      } else if (mod && code === 'KeyD') {
        e.preventDefault()
        ed.duplicateSelected()
      } else if (mod && code === 'KeyS') {
        e.preventDefault()
        saveCurrent()
      } else if (mod && (code === 'Equal' || code === 'NumpadAdd')) {
        e.preventDefault()
        setZoom((z) => Math.min(4, z * 1.2))
      } else if (mod && (code === 'Minus' || code === 'NumpadSubtract')) {
        e.preventDefault()
        setZoom((z) => Math.max(0.25, z / 1.2))
      } else if (mod && code === 'Digit0') {
        e.preventDefault()
        setZoom(() => 1)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && ed.selectedId) {
        e.preventDefault()
        ed.removeSelected()
      } else if (e.key === 'Escape') {
        ed.select(null)
      } else if (e.key.startsWith('Arrow') && ed.selectedId) {
        const n = ed.doc.nodes.find((x) => x.id === ed.selectedId)
        if (!n || n.locked) return
        e.preventDefault()
        const step = getFormat(ed.doc.formatId).width * (e.shiftKey ? 0.02 : 0.002)
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        ed.updateNode(n.id, { x: n.x + dx, y: n.y + dy })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setZoom])
}

function SaveStatus() {
  const s = useEditor((x) => x.saveState)
  const at = useEditor((x) => x.savedAt)
  const persisted = useEditor((x) => x.persisted)
  const nodes = useEditor((x) => x.doc.nodes.length)
  let text = 'Сохранено'
  if (s === 'saving') text = 'Сохраняю…'
  else if (s === 'dirty') text = 'Есть изменения'
  else if (!persisted) text = nodes ? 'Не сохранено' : 'Пустая открытка'
  else if (at) text = `Сохранено · ${new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
  return (
    <span className={'saved' + (s !== 'saved' ? ' dirty' : '')} aria-live="polite">
      <b>●</b> {text}
    </span>
  )
}

function FormatMenu() {
  const formatId = useEditor((s) => s.doc.formatId)
  const setFormat = useEditor((s) => s.setFormat)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useOutsideClose(open, close)
  const f = getFormat(formatId)
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button type="button" className="fmt-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        {f.label} <span className="mono">{f.spec}</span>
        <Icon name="chevron" size={16} />
      </button>
      {open && (
        <div className="menu fmt-menu" role="menu">
          {FORMATS.map((x) => (
            <button
              key={x.id}
              type="button"
              role="menuitemradio"
              aria-checked={x.id === formatId}
              onClick={() => {
                setFormat(x.id)
                setOpen(false)
              }}
            >
              {x.label} <span className="mono">{x.spec}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SelectionBar() {
  const node = useEditor((s) => s.doc.nodes.find((n) => n.id === s.selectedId))
  const { duplicateSelected, removeSelected, updateNode } = useEditor()
  const name = useNodeName(node)
  const openCutout = useUI((s) => s.openCutout)
  if (!node) return null
  const isBg = node.type === 'image' && node.role === 'background'
  return (
    <div className="selbar" role="toolbar" aria-label="Выбранный элемент">
      <span className="mono">{kindOf(node)}</span>
      <span className="name">{name}</span>
      {node.type === 'image' && !isBg && (
        <button type="button" className="ib sm flat" aria-label="Вырезать вручную" title="Вырезать вручную" onClick={() => openCutout(node.assetId)}>
          <Icon name="scissors" size={16} />
        </button>
      )}
      {!isBg && (
        <button type="button" className="ib sm flat" aria-label="Дублировать" title="Дублировать (Ctrl+D)" onClick={duplicateSelected}>
          <Icon name="copy" size={16} />
        </button>
      )}
      <button type="button" className={'ib sm flat' + (node.locked ? ' on' : '')} aria-pressed={!!node.locked} aria-label={node.locked ? 'Разблокировать' : 'Заблокировать'} title={node.locked ? 'Разблокировать' : 'Заблокировать'} onClick={() => updateNode(node.id, { locked: !node.locked })}>
        <Icon name={node.locked ? 'lock' : 'unlock'} size={16} />
      </button>
      <button type="button" className="ib sm flat" aria-label="Удалить" title="Удалить (Del)" onClick={removeSelected}>
        <Icon name="trash" size={16} />
      </button>
    </div>
  )
}

function EmptyCanvas({ onPickBg }: { onPickBg: () => void }) {
  const n = useEditor((s) => s.doc.nodes.length)
  const openAutoGen = useUI((s) => s.openAutoGen)
  if (n) return null
  return (
    <div className="canvas-empty">
      <div>
        <b>Начните с фона</b>
        <span className="muted" style={{ fontSize: 14 }}>
          Перетащите его слева или доверьте раскладку автосборке.
        </span>
        <span className="row">
          <button type="button" className="btn sm" onClick={onPickBg}>
            Выбрать фон
          </button>
          <button type="button" className="btn sm primary" onClick={() => openAutoGen('current')}>
            <Icon name="sparkle" size={16} /> Собрать коллаж
          </button>
        </span>
      </div>
    </div>
  )
}

export function EditorPage({ id }: { id: string }) {
  const ready = useLoadCard(id)
  useLibrary((s) => s.loaded)
  const { name, setName, undo, redo, past, future, doc, apply } = useEditor()
  const openExport = useUI((s) => s.openExport)
  const assets = useLibrary((s) => s.assets)
  const [zoom, setZoomState] = useState(1)
  const [fit, setFit] = useState(1)
  const setZoom = useCallback((fn: (z: number) => number) => setZoomState((z) => fn(z)), [])
  const [tab, setTab] = useState<ElTab>('cut')
  const [drawer, setDrawer] = useState(false)
  const [propsOpen, setPropsOpen] = useState(false)
  useAutosave()
  useShortcuts(setZoom)
  useEffect(() => {
    useLibrary.getState().load()
  }, [])

  const back = async () => {
    await saveCurrent()
    go('/')
  }
  const loose = doc.nodes.filter((n) => n.type === 'image' && !n.role && !n.locked).length
  if (!ready) return <div className="ed grid-paper" />

  return (
    <div className="ed">
      <header className="ed-head">
        <div className="ed-title">
          <button type="button" className="ib" aria-label="Назад к открыткам" onClick={back}>
            <Icon name="back" />
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <label className="ed-name">
              <span className="sr-only">Название открытки</span>
              <input value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} />
              <Icon name="pencil" size={16} />
            </label>
            <SaveStatus />
          </div>
        </div>
        <div className="ed-tools">
          <button type="button" className="ib" aria-label="Отменить" title="Отменить (Ctrl+Z)" disabled={!past.length} onClick={undo}>
            <Icon name="undo" />
          </button>
          <button type="button" className="ib" aria-label="Повторить" title="Повторить (Ctrl+Shift+Z)" disabled={!future.length} onClick={redo}>
            <Icon name="redo" />
          </button>
          <span className="sep" aria-hidden="true" />
          <FormatMenu />
        </div>
        <div className="ed-actions">
          <span className="magic">
            <button type="button" className="btn" disabled={loose < 2} onClick={() => apply((d) => reshuffle(d, assets))} title="Разложить элементы по-новому">
              <Icon name="shuffle" /> Перемешать
            </button>
            {loose >= 2 && (
              <span className="note" aria-hidden="true">
                магия
              </span>
            )}
          </span>
          <button type="button" className="btn primary" onClick={() => openExport({ draftId: useEditor.getState().draftId, name, doc: useEditor.getState().doc })}>
            <Icon name="download" /> Скачать
          </button>
        </div>
      </header>
      <div className="ed-body">
        <nav className="rail" aria-label="Типы элементов">
          {EL_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={drawer && tab === t.id}
              onClick={() => {
                if (drawer && tab === t.id) setDrawer(false)
                else {
                  setTab(t.id)
                  setDrawer(true)
                }
              }}
            >
              <Icon name={t.icon} size={22} />
              {t.label}
            </button>
          ))}
          <button type="button" aria-pressed={propsOpen} onClick={() => setPropsOpen(!propsOpen)} style={{ marginTop: 'auto' }}>
            <Icon name="layers" size={22} />
            Свойства
          </button>
        </nav>
        <ElementsPanel tab={tab} setTab={setTab} open={drawer} />
        <main className="ed-main" onMouseDown={() => drawer && setDrawer(false)}>
          <SelectionBar />
          <Canvas zoom={zoom} setZoom={setZoomState} onFit={setFit} />
          <EmptyCanvas
            onPickBg={() => {
              setTab('bg')
              setDrawer(true)
            }}
          />
          <div className="ed-bottom">
            <div className="zoom">
              <button type="button" className="ib" aria-label="Уменьшить" onClick={() => setZoomState((z) => Math.max(0.25, z / 1.2))}>
                −
              </button>
              <span className="pct">{Math.round(zoom * fit * 100)}%</span>
              <button type="button" className="ib" aria-label="Увеличить" onClick={() => setZoomState((z) => Math.min(4, z * 1.2))}>
                +
              </button>
              <button type="button" className="ib fit" onClick={() => setZoomState(1)}>
                Вписать
              </button>
            </div>
            <span className="mono" style={{ textTransform: 'none' }}>
              Shift + поворот — шаг 15° · Ctrl+Z — отмена · двойной клик по тексту — правка
            </span>
          </div>
        </main>
        <PropertiesPanel open={propsOpen} />
      </div>
    </div>
  )
}
