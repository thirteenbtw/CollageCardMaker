import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Asset, CardDoc, CardNode, ImageNode, TextNode } from './types'
import { getFormat, INK } from './formats'

const HISTORY_LIMIT = 120

export const emptyDoc = (formatId = 'a6-h'): CardDoc => ({ formatId, background: '#F6F1E7', nodes: [] })

const clone = (d: CardDoc): CardDoc => structuredClone(d)

function coverNode(asset: Asset, cw: number, ch: number, stretch: boolean): ImageNode {
  const k = Math.max(cw / asset.width, ch / asset.height)
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
    scaleX: stretch ? cw / asset.width : k,
    scaleY: stretch ? ch / asset.height : k,
    opacity: 1,
    locked: !stretch,
  }
}

export function makeImageNode(asset: Asset, cw: number, ch: number, at?: { x: number; y: number }, sizeRatio?: number): ImageNode {
  if (asset.category === 'background') return coverNode(asset, cw, ch, false)
  if (asset.category === 'frame') return coverNode(asset, cw, ch, true)
  const ratio = sizeRatio ?? (asset.category === 'sticker' ? 0.22 : 0.38)
  const target = Math.min(cw, ch) * ratio
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
    // photos look best stuck on with a hard shadow
    shadow: asset.category === 'photo',
  }
}

export interface TextPreset {
  id: string
  label: string
  sample: string
  make: (cw: number, ch: number) => Partial<TextNode>
}

export const TEXT_PRESETS: TextPreset[] = [
  {
    id: 'hand',
    label: 'Рукописный заголовок',
    sample: 'С праздником!',
    make: (cw, ch) => ({ fontFamily: 'Caveat', fontStyle: 'bold', fontSize: Math.min(cw, ch) * 0.13, fill: INK, width: cw * 0.7 }),
  },
  {
    id: 'sans',
    label: 'Чистый текст',
    sample: 'Тёплых дней и уютных вечеров',
    make: (cw, ch) => ({ fontFamily: 'Onest', fontStyle: 'normal', fontSize: Math.min(cw, ch) * 0.05, fill: INK, width: cw * 0.55 }),
  },
  {
    id: 'mono',
    label: 'Машинописная подпись',
    sample: 'ИЗ ОСЕННЕЙ ПРОГУЛКИ',
    make: (cw, ch) => ({ fontFamily: 'IBM Plex Mono', fontStyle: 'normal', fontSize: Math.min(cw, ch) * 0.035, fill: '#6B5448', width: cw * 0.6, letterSpacing: 2 }),
  },
  {
    id: 'label',
    label: 'Лента-наклейка',
    sample: 'ПРИВЕТ',
    make: (cw, ch) => ({ fontFamily: 'IBM Plex Mono', fontStyle: 'bold', fontSize: Math.min(cw, ch) * 0.045, fill: '#FFFDF8', bg: INK, width: cw * 0.5, letterSpacing: 3 }),
  },
]

export function makeTextNode(cw: number, ch: number, text?: string, presetId = 'hand'): TextNode {
  const preset = TEXT_PRESETS.find((p) => p.id === presetId) ?? TEXT_PRESETS[0]
  return {
    id: nanoid(),
    type: 'text',
    text: text ?? preset.sample,
    fontFamily: 'Caveat',
    fontSize: 100,
    fontStyle: 'bold',
    fill: INK,
    align: 'center',
    width: cw * 0.7,
    x: cw / 2,
    y: ch / 2,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    preset: preset.id,
    ...preset.make(cw, ch),
  }
}

export type SaveState = 'saved' | 'dirty' | 'saving'

interface EditorState {
  doc: CardDoc
  draftId: string
  name: string
  createdAt: number
  exported: boolean
  selectedId: string | null
  past: CardDoc[]
  future: CardDoc[]
  saveState: SaveState
  savedAt: number | null
  persisted: boolean

  liveBase: CardDoc | null
  apply: (fn: (doc: CardDoc) => CardDoc) => void
  /** change without a history step (slider drags); call commitLive() when done */
  livePatch: (id: string, patch: Partial<CardNode>) => void
  commitLive: () => void
  undo: () => void
  redo: () => void
  select: (id: string | null) => void
  updateNode: (id: string, patch: Partial<CardNode>) => void
  addAsset: (asset: Asset, at?: { x: number; y: number }) => void
  addText: (presetId?: string, text?: string) => void
  removeSelected: () => void
  duplicateSelected: () => void
  reorder: (dir: 'up' | 'down' | 'top' | 'bottom') => void
  setFormat: (formatId: string) => void
  setBackground: (color: string) => void
  open: (p: { doc: CardDoc; id: string; name: string; createdAt: number; exported?: boolean; persisted: boolean }) => void
  setName: (name: string) => void
  setSaveState: (s: SaveState, at?: number) => void
  markExported: () => void
}

export const useEditor = create<EditorState>((set, get) => ({
  doc: emptyDoc(),
  draftId: nanoid(),
  name: 'Новая открытка',
  createdAt: Date.now(),
  exported: false,
  selectedId: null,
  past: [],
  future: [],
  saveState: 'saved',
  savedAt: null,
  persisted: false,
  liveBase: null,

  livePatch(id, patch) {
    const { doc, liveBase } = get()
    set({
      liveBase: liveBase ?? doc,
      doc: { ...doc, nodes: doc.nodes.map((n) => (n.id === id ? ({ ...n, ...patch } as CardNode) : n)) },
      saveState: 'dirty',
    })
  },
  commitLive() {
    const { liveBase, past } = get()
    if (!liveBase) return
    set({ past: [...past, liveBase].slice(-HISTORY_LIMIT), future: [], liveBase: null })
  },
  apply(fn) {
    const { doc, past } = get()
    const next = fn(clone(doc))
    set({ doc: next, past: [...past, doc].slice(-HISTORY_LIMIT), future: [], saveState: 'dirty' })
  },
  undo() {
    const { past, doc, future, selectedId } = get()
    if (!past.length) return
    const prev = past[past.length - 1]
    set({
      doc: prev,
      past: past.slice(0, -1),
      future: [doc, ...future],
      saveState: 'dirty',
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
      saveState: 'dirty',
      selectedId: next.nodes.some((n) => n.id === selectedId) ? selectedId : null,
    })
  },
  select: (id) => set({ selectedId: id }),
  updateNode(id, patch) {
    get().apply((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? ({ ...n, ...patch } as CardNode) : n)) }))
  },
  addAsset(asset, at) {
    const f = getFormat(get().doc.formatId)
    const node = makeImageNode(asset, f.width, f.height, at)
    get().apply((d) => {
      if (asset.category === 'background') {
        // one background per card: it replaces the old one and always sits at the bottom
        return { ...d, nodes: [node, ...d.nodes.filter((n) => !(n.type === 'image' && n.role === 'background'))] }
      }
      return { ...d, nodes: [...d.nodes, node] }
    })
    set({ selectedId: node.id })
  },
  addText(presetId, text) {
    const f = getFormat(get().doc.formatId)
    const node = makeTextNode(f.width, f.height, text, presetId)
    // don't stack new text exactly on top of existing text
    const busy = get().doc.nodes.filter((n) => n.type === 'text').length
    node.y += busy * f.height * 0.12
    get().apply((d) => ({ ...d, nodes: [...d.nodes, node] }))
    set({ selectedId: node.id })
  },
  removeSelected() {
    const { selectedId, doc } = get()
    const n = doc.nodes.find((x) => x.id === selectedId)
    if (!n) return
    get().apply((d) => ({ ...d, nodes: d.nodes.filter((x) => x.id !== n.id) }))
    set({ selectedId: null })
  },
  duplicateSelected() {
    const { selectedId, doc } = get()
    const src = doc.nodes.find((n) => n.id === selectedId)
    if (!src || (src.type === 'image' && src.role === 'background')) return
    const off = getFormat(doc.formatId).width * 0.03
    const copy = { ...structuredClone(src), id: nanoid(), x: src.x + off, y: src.y + off, locked: false }
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
      const j = dir === 'top' ? nodes.length : dir === 'bottom' ? 0 : dir === 'up' ? Math.min(nodes.length, i + 1) : Math.max(0, i - 1)
      nodes.splice(j, 0, n)
      return { ...d, nodes }
    })
  },
  setFormat(formatId) {
    const { doc } = get()
    const from = getFormat(doc.formatId)
    const to = getFormat(formatId)
    if (from.id === to.id) return
    const rx = to.width / from.width
    const ry = to.height / from.height
    const rs = Math.min(rx, ry)
    get().apply((d) => ({
      ...d,
      formatId,
      nodes: d.nodes.map((n) => {
        const moved = { ...n, x: n.x * rx, y: n.y * ry }
        if (n.type === 'text') return { ...moved, fontSize: n.fontSize * rs, width: n.width * rs } as TextNode
        if (n.role === 'background') {
          const k = Math.max(to.width / n.width, to.height / n.height)
          return { ...moved, scaleX: k, scaleY: k }
        }
        if (n.role === 'frame') return { ...moved, scaleX: to.width / n.width, scaleY: to.height / n.height }
        return { ...moved, scaleX: n.scaleX * rs, scaleY: n.scaleY * rs }
      }),
    }))
  },
  setBackground(color) {
    get().apply((d) => ({ ...d, background: color }))
  },
  open(p) {
    set({
      doc: clone(p.doc),
      draftId: p.id,
      name: p.name,
      createdAt: p.createdAt,
      exported: !!p.exported,
      selectedId: null,
      past: [],
      future: [],
      liveBase: null,
      saveState: 'saved',
      savedAt: p.persisted ? Date.now() : null,
      persisted: p.persisted,
    })
  },
  setName(name) {
    set({ name, saveState: 'dirty' })
  },
  setSaveState(s, at) {
    set({ saveState: s, ...(at ? { savedAt: at, persisted: true } : {}) })
  },
  markExported() {
    set({ exported: true, saveState: 'dirty' })
  },
}))

export function nodeLabel(n: CardNode, assetName?: string) {
  if (n.type === 'text') return n.text.split('\n')[0].slice(0, 28) || 'Текст'
  return assetName ?? 'Элемент'
}
