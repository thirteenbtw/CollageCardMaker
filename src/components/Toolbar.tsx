import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../editor'
import { getFormat } from '../formats'
import { exportCard } from '../exporters'
import { stageRef } from '../stageRef'
import { saveCurrentDraft } from '../drafts'
import { runAutoLayout } from './Inspector'

export function Toolbar({ onOpenDrafts }: { onOpenDrafts: () => void }) {
  const { draftName, setName, undo, redo, addText, past, future, dirty, draftId, doc } = useEditor()
  const [menu, setMenu] = useState(false)
  const [saving, setSaving] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  const doExport = (kind: 'png' | 'jpg' | 'pdf') => {
    setMenu(false)
    useEditor.getState().select(null)
    // wait one frame so the selection frame disappears
    requestAnimationFrame(() => stageRef.current && exportCard(stageRef.current, getFormat(doc.formatId), kind, draftName))
  }

  const save = async () => {
    setSaving(true)
    useEditor.getState().select(null)
    await new Promise((r) => requestAnimationFrame(r))
    await saveCurrentDraft()
    setSaving(false)
  }

  return (
    <header className="toolbar">
      <div className="brand" onClick={onOpenDrafts} title="Мои открытки">
        <span className="brand-mark">✉</span> Открыточная
      </div>
      <input className="draft-name" value={draftName} onChange={(e) => setName(e.target.value)} />
      <span className="save-state muted small">{saving ? 'Сохраняю…' : dirty ? (draftId ? 'Есть изменения' : 'Не сохранено') : 'Сохранено'}</span>
      <span className="grow" />
      <button className="btn icon" onClick={undo} disabled={!past.length} title="Отменить (Ctrl+Z)">
        ↶
      </button>
      <button className="btn icon" onClick={redo} disabled={!future.length} title="Повторить (Ctrl+Shift+Z)">
        ↷
      </button>
      <button className="btn" onClick={() => addText()}>
        T&nbsp;Текст
      </button>
      <button className="btn" onClick={runAutoLayout} title="Собрать коллаж из библиотеки">
        ✦ Автоколлаж
      </button>
      <button className="btn" onClick={onOpenDrafts}>
        Мои открытки
      </button>
      <button className="btn" onClick={save} disabled={saving}>
        Сохранить
      </button>
      <div className="menu-anchor" ref={menuRef}>
        <button className="btn primary" onClick={() => setMenu(!menu)}>
          Скачать ▾
        </button>
        {menu && (
          <div className="menu">
            <button onClick={() => doExport('png')}>PNG — с лучшим качеством</button>
            <button onClick={() => doExport('jpg')}>JPG — файл поменьше</button>
            <button onClick={() => doExport('pdf')}>PDF — для печати</button>
          </div>
        )}
      </div>
    </header>
  )
}
