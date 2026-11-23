import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { db } from './db'
import { useEditor } from './editor'
import { thumbnail } from './render'
import type { CardDoc, Draft } from './types'

interface DraftsState {
  drafts: Draft[]
  loaded: boolean
  load: () => Promise<void>
  put: (d: Draft) => Promise<void>
  remove: (id: string) => Promise<void>
  duplicate: (id: string) => Promise<Draft | undefined>
  create: (doc: CardDoc, name: string) => Promise<Draft>
}

export const useDrafts = create<DraftsState>((set, get) => ({
  drafts: [],
  loaded: false,
  async load() {
    set({ drafts: await db.allDrafts(), loaded: true })
  },
  async put(d) {
    await db.putDraft(d)
    const rest = get().drafts.filter((x) => x.id !== d.id)
    set({ drafts: [d, ...rest].sort((a, b) => b.updatedAt - a.updatedAt) })
  },
  async remove(id) {
    await db.deleteDraft(id)
    set({ drafts: get().drafts.filter((x) => x.id !== id) })
  },
  async duplicate(id) {
    const src = get().drafts.find((d) => d.id === id)
    if (!src) return
    const now = Date.now()
    const copy: Draft = { ...structuredClone(src), id: nanoid(), name: src.name + ' (копия)', createdAt: now, updatedAt: now, exported: false }
    await get().put(copy)
    return copy
  },
  async create(doc, name) {
    const now = Date.now()
    const d: Draft = { id: nanoid(), name, doc, thumbnail: await thumbnail(doc), createdAt: now, updatedAt: now }
    await get().put(d)
    return d
  },
}))

let saving: Promise<void> | null = null

/** Persists the card open in the editor (with a fresh thumbnail). */
export async function saveCurrent() {
  if (saving) await saving
  const ed = useEditor.getState()
  // nothing to keep yet
  if (!ed.persisted && ed.doc.nodes.length === 0) return
  const snapshot = { doc: structuredClone(ed.doc), id: ed.draftId, name: ed.name.trim() || 'Без названия', createdAt: ed.createdAt, exported: ed.exported }
  ed.setSaveState('saving')
  saving = (async () => {
    const thumb = await thumbnail(snapshot.doc)
    const now = Date.now()
    await useDrafts.getState().put({ ...snapshot, thumbnail: thumb, updatedAt: now })
    const cur = useEditor.getState()
    // only mark clean if nothing changed meanwhile
    cur.setSaveState(cur.doc === ed.doc || JSON.stringify(cur.doc) === JSON.stringify(snapshot.doc) ? 'saved' : 'dirty', now)
  })()
  try {
    await saving
  } finally {
    saving = null
  }
}

export async function markDraftExported(id: string) {
  const ed = useEditor.getState()
  if (ed.draftId === id) {
    ed.markExported()
    await saveCurrent()
    return
  }
  const d = useDrafts.getState().drafts.find((x) => x.id === id)
  if (d && !d.exported) await useDrafts.getState().put({ ...d, exported: true })
}
