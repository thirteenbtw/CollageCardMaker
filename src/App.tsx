import { useEffect, useState } from 'react'
import { Toolbar } from './components/Toolbar'
import { Library } from './components/Library'
import { CardCanvas } from './components/CardCanvas'
import { Inspector } from './components/Inspector'
import { Drafts } from './components/Drafts'
import { useEditor } from './editor'
import { useLibrary } from './library'
import { saveCurrentDraft } from './drafts'
import { getFormat } from './formats'

function useShortcuts(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable]')) return
      const ed = useEditor.getState()
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) ed.redo()
        else ed.undo()
      } else if (mod && (key === 'y' || key === 'я')) {
        e.preventDefault()
        ed.redo()
      } else if (mod && (key === 'd' || key === 'в')) {
        e.preventDefault()
        ed.duplicateSelected()
      } else if (mod && (key === 's' || key === 'ы')) {
        e.preventDefault()
        saveCurrentDraft()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && ed.selectedId) {
        e.preventDefault()
        ed.removeSelected()
      } else if (e.key === 'Escape') {
        ed.select(null)
      } else if (e.key.startsWith('Arrow') && ed.selectedId) {
        e.preventDefault()
        const n = ed.doc.nodes.find((x) => x.id === ed.selectedId)
        if (!n) return
        const step = getFormat(ed.doc.formatId).width * (e.shiftKey ? 0.02 : 0.002)
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        ed.updateNode(n.id, { x: n.x + dx, y: n.y + dy })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}

/** once a card has been saved, keep it saved */
function useAutosave() {
  const doc = useEditor((s) => s.doc)
  const name = useEditor((s) => s.draftName)
  const draftId = useEditor((s) => s.draftId)
  useEffect(() => {
    if (!draftId || !useEditor.getState().dirty) return
    const t = setTimeout(() => saveCurrentDraft(), 2000)
    return () => clearTimeout(t)
  }, [doc, name, draftId])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      const s = useEditor.getState()
      if (s.dirty && s.doc.nodes.length) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])
}

export default function App() {
  const [view, setView] = useState<'editor' | 'drafts'>('editor')
  const load = useLibrary((s) => s.load)
  useEffect(() => {
    load()
  }, [load])
  useShortcuts(view === 'editor')
  useAutosave()

  if (view === 'drafts') return <Drafts onOpen={() => setView('editor')} />
  return (
    <div className="app">
      <Toolbar onOpenDrafts={() => setView('drafts')} />
      <div className="workspace">
        <Library />
        <CardCanvas />
        <Inspector />
      </div>
    </div>
  )
}
