import Konva from 'konva'
import type { CardDoc, ImageNode, TextNode } from './types'
import { getFormat, INK } from './formats'
import { hashString, rng } from './util'

export const TAPES: { id: string; label: string; a: string; b: string }[] = [
  { id: 'mustard', label: 'Горчичная', a: '#E4B011', b: '#F3D46A' },
  { id: 'clay', label: 'Терракотовая', a: '#D2694B', b: '#EBA48D' },
  { id: 'slate', label: 'Синяя', a: '#5D798E', b: '#A9BBC8' },
  { id: 'sage', label: 'Шалфей', a: '#8A9A6B', b: '#C3CCAE' },
]

const tapeCache = new Map<string, HTMLCanvasElement>()
/** a small striped tile used as fill pattern for washi tape */
export function tapePattern(id: string) {
  let c = tapeCache.get(id)
  if (c) return c
  const t = TAPES.find((x) => x.id === id) ?? TAPES[0]
  c = document.createElement('canvas')
  c.width = c.height = 24
  const ctx = c.getContext('2d')!
  ctx.fillStyle = t.b
  ctx.fillRect(0, 0, 24, 24)
  ctx.strokeStyle = t.a
  ctx.lineWidth = 6
  for (let i = -24; i <= 48; i += 12) {
    ctx.beginPath()
    ctx.moveTo(i, 24)
    ctx.lineTo(i + 24, 0)
    ctx.stroke()
  }
  tapeCache.set(id, c)
  return c
}

/** jagged polygon around a w×h rect, deterministic per node */
export function tornPolygon(seedKey: string, w: number, h: number): number[] {
  const r = rng(hashString(seedKey))
  const depth = Math.min(w, h) * 0.035
  const step = Math.max(6, Math.min(w, h) * 0.025)
  const pts: number[] = []
  const edge = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0)
    const n = Math.max(2, Math.round(len / step))
    for (let i = 0; i < n; i++) {
      const t = i / n
      const j = r() * depth * (r() < 0.15 ? 1.6 : 1)
      pts.push(x0 + (x1 - x0) * t + nx * j, y0 + (y1 - y0) * t + ny * j)
    }
  }
  edge(0, 0, w, 0, 0, 1)
  edge(w, 0, w, h, -1, 0)
  edge(w, h, 0, h, 0, -1)
  edge(0, h, 0, 0, 1, 0)
  return pts
}

/** shadow offset in card px, independent of element scale */
export const shadowDistance = (doc: CardDoc) => {
  const f = getFormat(doc.formatId)
  return Math.round(Math.min(f.width, f.height) * 0.012)
}

export function shadowProps(on: boolean | undefined, dist: number, scaleX: number, scaleY: number) {
  if (!on) return { shadowEnabled: false }
  return {
    shadowEnabled: true,
    shadowColor: INK,
    shadowBlur: 0,
    shadowOpacity: 1,
    // Konva multiplies the offset by the absolute scale, so divide it out (sign included)
    shadowOffsetX: dist / scaleX,
    shadowOffsetY: dist / scaleY,
  }
}

/** tape strip geometry in the element's local (unscaled) coordinates */
export function tapeRect(node: ImageNode) {
  // keep the tape a sensible physical size regardless of how the element is scaled
  const s = Math.abs(node.scaleX)
  const w = Math.min(node.width * 0.6, 320 / s)
  const h = Math.min(node.height * 0.25, 80 / s)
  return {
    x: node.width / 2,
    y: Math.max(h * 0.2, 0),
    width: w,
    height: h,
    offsetX: w / 2,
    offsetY: h / 2,
    rotation: -7,
    opacity: 0.88,
    fillPatternImage: tapePattern(node.tape ?? 'mustard') as unknown as HTMLImageElement,
    fillPatternScaleX: 1 / s,
    fillPatternScaleY: 1 / s,
  }
}

const measureCache = new Map<string, { height: number; textWidth: number }>()
/** rendered size of a text node (unscaled): block height and width of the longest line */
export function measureText(n: TextNode) {
  const key = [n.text, n.fontFamily, n.fontSize, n.fontStyle, n.width, n.letterSpacing ?? 0].join('|')
  let m = measureCache.get(key)
  if (!m) {
    const t = new Konva.Text(textConfig(n))
    m = { height: t.height(), textWidth: Math.min(n.width, t.getTextWidth()) }
    t.destroy()
    // fonts may still be loading: only cache once they are ready
    if (document.fonts.check(`${Math.round(n.fontSize)}px "${n.fontFamily}"`)) measureCache.set(key, m)
  }
  return m
}

/** geometry of a text node: group offset and the label rect */
export function textLayout(n: TextNode) {
  const { height, textWidth } = measureText(n)
  const pad = labelPad(n)
  const rectX = n.align === 'left' ? -pad : n.align === 'right' ? n.width - textWidth - pad : (n.width - textWidth) / 2 - pad
  return {
    height,
    pad,
    offsetX: n.width / 2,
    offsetY: height / 2,
    rect: { x: rectX, y: -pad, width: textWidth + pad * 2, height: height + pad * 2, cornerRadius: pad * 0.25 },
  }
}

export function textConfig(n: TextNode) {
  return {
    text: n.text,
    fontFamily: n.fontFamily,
    fontSize: n.fontSize,
    fontStyle: n.fontStyle,
    fill: n.fill,
    align: n.align,
    width: n.width,
    lineHeight: 1.1,
    letterSpacing: n.letterSpacing ?? 0,
  }
}

/** padding of the label-maker tape behind text */
export const labelPad = (n: TextNode) => (n.bg ? n.fontSize * 0.35 : 0)
