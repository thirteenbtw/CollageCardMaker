import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Asset, CardDoc, CardNode, ImageNode, TextNode } from './types'
import { getFormat } from './formats'

const HISTORY_LIMIT = 100

interface EditorState {
  doc: CardDoc
  draftId: string | null
  draftName: string
  selectedId: string | null
  past: CardDoc[]
  future: CardDoc[]
  dirty: boolean

  /** replace the doc, pushing the previous one to history */
  apply: (fn: (doc: CardDoc) => CardDoc) => void
  undo: () => void
  redo: () => void
  select: (id: string | null) => void
  updateNode: (id: string, patch: Partial<CardNode>) => void
  addAsset: (asset: Asset, at?: { x: number; y: number }) => void
  addText: (text?: string) => void
  removeSelected: () => void
  duplicateSelected: () => void
  reorder: (dir: 'up' | 'down' | 'top' | 'bottom') => void
  setFormat: (formatId: string) => void
  setBackground: (color: string) => void
  loadDoc: (doc: CardDoc, draftId: string | null, name: string) => void
  markSaved: (draftId: string, name: string) => void
  setName: (name: string) => void
}

export const emptyDoc = (formatId = 'a6-h'): CardDoc => ({ formatId, background: '#f6efe3', nodes: [] })

const clone = (d: CardDoc): CardDoc => structuredClone(d)

/** cover-fit an asset to the canvas */
function coverNode(asset: Asset, cw: number, ch: number, stretch = false): ImageNode {
  const k = Math.max(cw / asset.width, ch / asset.height)
  const sx = stretch ? cw / asset.width : k
  const sy = stretch ? ch / asset.height : k
  return {
    id: nanoid(),
    type: 'image',
    role: stretch ? 'frame' : 'background',
    assetId: asset.id,
    width: asset.width,
    height: asset.height,
    x: cw / 2,
    y: ch / 2,
    rotation: 0,
    scaleX: sx,
    scaleY: sy,
    opacity: 1,
  }
}

export function makeImageNode(asset: Asset, cw: number, ch: number, at?: { x: number; y: number }, sizeRatio = 0.35): ImageNode {
  if (asset.category === 'background') return coverNode(asset, cw, ch)
  if (asset.category === 'frame') return coverNode(asset, cw, ch, true)
  const target = Math.min(cw, ch) * sizeRatio
  const k = target / Math.max(asset.width, asset.height)
  return {
    id: nanoid(),
    type: 'image',
    assetId: asset.id,
    width: asset.width,
    height: asset.height,
    x: at?.x ?? cw / 2,
    y: at?.y ?? ch / 2,
    rotation: 0,
    scaleX: k,
    scaleY: k,
    opacity: 1,
  }
}

export function makeTextNode(cw: number, ch: number, text = 'С праздником!'): TextNode {
  const fontSize = Math.round(Math.min(cw, ch) * 0.11)
  return {
    id: nanoid(),
    type: 'text',
    text,
    fontFamily: 'Caveat',
    fontSize,
    fill: '#3b2a20',
    align: 'center',
    fontStyle: 'bold',
    width: cw * 0.7,
    x: cw / 2,
    y: ch / 2,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
  }
}

export const useEditor = create<EditorState>((set, get) => ({
  doc: emptyDoc(),
  draftId: null,
  draftName: 'Новая открытка',
  selectedId: null,
  past: [],
  future: [],
  dirty: false,

  apply(fn) {
    const { doc, past } = get()
    const next = fn(clone(doc))
    set({ doc: next, past: [...past, doc].slice(-HISTORY_LIMIT), future: [], dirty: true })
  },
  undo() {
    const { past, doc, future, selectedId } = get()
    if (!past.length) return
    const prev = past[past.length - 1]
    set({
      doc: prev,
      past: past.slice(0, -1),
      future: [doc, ...future],
      dirty: true,
      selectedId: prev.nodes.some((n) => n.id === selectedId) ? selectedId : null,
    })
  },
  redo() {
    const { past, doc, future, selectedId } = get()
    if (!future.length) return
    const next = future[0]
    set({
      doc: next,
      past: [...past, doc],
      future: future.slice(1),
      dirty: true,
      selectedId: next.nodes.some((n) => n.id === selectedId) ? selectedId : null,
    })
  },
  select: (id) => set({ selectedId: id }),
  updateNode(id, patch) {
    get().apply((d) => ({
      ...d,
      nodes: d.nodes.map((n) => (n.id === id ? ({ ...n, ...patch } as CardNode) : n)),
    }))
  },
  addAsset(asset, at) {
    const f = getFormat(get().doc.formatId)
    const node = makeImageNode(asset, f.width, f.height, at)
    get().apply((d) => {
      if (asset.category === 'background') {
        // one background per card: replace the old one, always at the bottom
        return { ...d, nodes: [node, ...d.nodes.filter((n) => !(n.type === 'image' && n.role === 'background'))] }
      }
      return { ...d, nodes: [...d.nodes, node] }
    })
    set({ selectedId: node.id })
  },
  addText(text) {
    const f = getFormat(get().doc.formatId)
    const node = makeTextNode(f.width, f.height, text)
    get().apply((d) => ({ ...d, nodes: [...d.nodes, node] }))
    set({ selectedId: node.id })
  },
  removeSelected() {
    const id = get().selectedId
    if (!id) return
    get().apply((d) => ({ ...d, nodes: d.nodes.filter((n) => n.id !== id) }))
    set({ selectedId: null })
  },
  duplicateSelected() {
    const { selectedId, doc } = get()
    const src = doc.nodes.find((n) => n.id === selectedId)
    if (!src) return
    const off = getFormat(doc.formatId).width * 0.03
    const copy = { ...structuredClone(src), id: nanoid(), x: src.x + off, y: src.y + off }
    get().apply((d) => {
      const i = d.nodes.findIndex((n) => n.id === src.id)
      const nodes = [...d.nodes]
      nodes.splice(i + 1, 0, copy)
      return { ...d, nodes }
    })
    set({ selectedId: copy.id })
  },
  reorder(dir) {
    const id = get().selectedId
    if (!id) return
    get().apply((d) => {
      const nodes = [...d.nodes]
      const i = nodes.findIndex((n) => n.id === id)
      if (i < 0) return d
      const [n] = nodes.splice(i, 1)
      const j =
        dir === 'top' ? nodes.length : dir === 'bottom' ? 0 : dir === 'up' ? Math.min(nodes.length, i + 1) : Math.max(0, i - 1)
      nodes.splice(j, 0, n)
      return { ...d, nodes }
    })
  },
  setFormat(formatId) {
    const { doc } = get()
    const from = getFormat(doc.formatId)
    const to = getFormat(formatId)
    if (from.id === to.id) return
    // keep the composition: scale positions proportionally, sizes by the smaller ratio
    const rx = to.width / from.width
    const ry = to.height / from.height
    const rs = Math.min(rx, ry)
    get().apply((d) => ({
      ...d,
      formatId,
      nodes: d.nodes.map((n) => {
        const moved = { ...n, x: n.x * rx, y: n.y * ry }
        if (n.type === 'text') return { ...moved, fontSize: (n as TextNode).fontSize * rs, width: (n as TextNode).width * rs }
        return { ...moved, scaleX: n.scaleX * rs, scaleY: n.scaleY * rs }
      }),
    }))
  },
  setBackground(color) {
    get().apply((d) => ({ ...d, background: color }))
  },
  loadDoc(doc, draftId, name) {
    set({ doc: clone(doc), draftId, draftName: name, selectedId: null, past: [], future: [], dirty: false })
  },
  markSaved(draftId, name) {
    set({ draftId, draftName: name, dirty: false })
  },
  setName(name) {
    set({ draftName: name, dirty: true })
  },
}))
