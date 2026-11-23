import { useEffect, useState } from 'react'
import { nanoid } from 'nanoid'
import { db } from '../db'
import { emptyDoc, useEditor } from '../editor'
import { FORMATS, getFormat } from '../formats'
import type { Draft } from '../types'

export function Drafts({ onOpen }: { onOpen: () => void }) {
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [formatId, setFormatId] = useState('a6-h')
  const loadDoc = useEditor((s) => s.loadDoc)
  const reload = () => db.allDrafts().then(setDrafts)
  useEffect(() => {
    reload()
  }, [])

  return (
    <main className="drafts">
      <div className="drafts-head">
        <h1>Мои открытки</h1>
        <span className="grow" />
        <button className="btn" onClick={onOpen}>
          ← К редактору
        </button>
        <select value={formatId} onChange={(e) => setFormatId(e.target.value)}>
          {FORMATS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          className="btn primary"
          onClick={() => {
            loadDoc(emptyDoc(formatId), null, 'Новая открытка')
            onOpen()
          }}
        >
          + Новая открытка
        </button>
      </div>
      <div className="draft-grid">
        {drafts?.map((d) => {
          const f = getFormat(d.doc.formatId)
          return (
            <div key={d.id} className="draft-card">
              <div
                className="draft-thumb"
                style={{ aspectRatio: `${f.width} / ${f.height}` }}
                onClick={() => {
                  loadDoc(d.doc, d.id, d.name)
                  onOpen()
                }}
              >
                {d.thumbnail ? <img src={d.thumbnail} alt="" /> : null}
              </div>
              <div className="draft-meta">
                <div className="draft-title">{d.name}</div>
                <div className="muted small">
                  {f.label} · {new Date(d.updatedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="row">
                  <button
                    className="btn small"
                    onClick={async () => {
                      await db.putDraft({ ...structuredClone(d), id: nanoid(), name: d.name + ' (копия)', updatedAt: Date.now() })
                      reload()
                    }}
                  >
                    Копия
                  </button>
                  <button
                    className="btn small danger"
                    onClick={async () => {
                      if (confirm(`Удалить «${d.name}»?`)) {
                        await db.deleteDraft(d.id)
                        reload()
                      }
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          )
        })}
        {drafts && drafts.length === 0 && <div className="empty muted">Пока нет сохранённых открыток. Создайте первую!</div>}
      </div>
    </main>
  )
}
