import Konva from 'konva'
import type { CardDoc, CardNode, ColorOpts, ImageNode, ShadowOpts, TapeOpts, TextNode, TornOpts } from './types'
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

export const TORN_DEFAULT: TornOpts = { depth: 0.035, step: 0.025, seed: 0 }

/** jagged polygon around a w×h rect, deterministic per node */
export function tornPolygon(seedKey: string, w: number, h: number, o: TornOpts = TORN_DEFAULT): number[] {
  const r = rng(hashString(seedKey + (o.seed ? ':' + o.seed : '')))
  const short = Math.min(w, h)
  const depth = short * o.depth
  const step = Math.max(3, short * o.step)
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

export const SHADOW_DEFAULT: ShadowOpts = { dist: 1, angle: 45, blur: 0, color: INK, opacity: 1 }

/**
 * Konva shadow props for a shape that sits inside a group scaled by (scaleX, scaleY).
 * Konva multiplies offset and blur by the absolute scale, so both are divided out here.
 */
export function shadowProps(node: Pick<CardNode, 'shadow' | 'shadowOpts'>, dist: number, scaleX: number, scaleY: number) {
  if (!node.shadow) return { shadowEnabled: false }
  const o = { ...SHADOW_DEFAULT, ...node.shadowOpts }
  const a = (o.angle * Math.PI) / 180
  // the old default (dist 1, 45°) moved the shadow by `dist` on both axes
  const d = dist * o.dist * Math.SQRT2
  return {
    shadowEnabled: true,
    shadowColor: o.color,
    shadowBlur: (dist * o.blur) / Math.min(Math.abs(scaleX), Math.abs(scaleY)),
    shadowOpacity: o.opacity,
    shadowOffsetX: (d * Math.cos(a)) / scaleX,
    shadowOffsetY: (d * Math.sin(a)) / scaleY,
  }
}

export const TAPE_DEFAULT: TapeOpts = { x: 0.5, y: 0.03, rotation: -7, len: 1 }

/**
 * Tape strip in the element's un-scaled, un-rotated frame centred on the element
 * (i.e. card px around the element centre), so it never gets skewed by the element scale.
 */
export function tapeRect(node: ImageNode) {
  const o = { ...TAPE_DEFAULT, ...node.tapeOpts }
  const W = node.width * Math.abs(node.scaleX)
  const H = node.height * Math.abs(node.scaleY)
  const w = Math.min(W * 0.6, 320) * o.len
  const h = Math.min(H * 0.25, 80)
  return {
    x: (o.x - 0.5) * W,
    y: (o.y - 0.5) * H,
    width: w,
    height: h,
    offsetX: w / 2,
    offsetY: h / 2,
    rotation: o.rotation,
    opacity: 0.88,
    fillPatternImage: tapePattern(node.tape ?? 'mustard') as unknown as HTMLImageElement,
  }
}

/** Converts a tape centre in the element frame back to TapeOpts.x / y. */
export function tapePosFromPoint(node: ImageNode, px: number, py: number) {
  const W = node.width * Math.abs(node.scaleX)
  const H = node.height * Math.abs(node.scaleY)
  const clamp = (v: number) => Math.min(1.1, Math.max(-0.1, v))
  return { x: clamp(px / W + 0.5), y: clamp(py / H + 0.5) }
}

/* ---------------- colour adjustments ---------------- */

export const COLOR_DEFAULT: ColorOpts = { hue: 0, saturation: 0, brightness: 0, contrast: 0, grayscale: false, tint: null, tintAmount: 0.6 }

export const isNeutralColor = (c?: ColorOpts) =>
  !c || (!c.hue && !c.saturation && !c.brightness && !c.contrast && !c.grayscale && !(c.tint && c.tintAmount > 0))

type M = number[] // 3x4 row-major affine colour matrix

const mul = (a: M, b: M): M => {
  // a ∘ b (apply b, then a)
  const r: M = new Array(12)
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      let v = j === 3 ? a[i * 4 + 3] : 0
      for (let k = 0; k < 3; k++) v += a[i * 4 + k] * b[k * 4 + j]
      r[i * 4 + j] = v
    }
  }
  return r
}

function colorMatrix(c: ColorOpts): M {
  let m: M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]
  if (c.hue) {
    // CSS hue-rotate
    const a = (c.hue * Math.PI) / 180
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    m = mul(
      [
        0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928, 0,
        0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.14, 0.072 - cos * 0.072 - sin * 0.283, 0,
        0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072, 0,
      ],
      m,
    )
  }
  const sat = c.grayscale ? 0 : 1 + c.saturation / 100
  if (sat !== 1) {
    const s = sat
    m = mul(
      [
        0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0,
        0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0,
        0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0,
      ],
      m,
    )
  }
  if (c.brightness) {
    const b = 1 + c.brightness / 100
    m = mul([b, 0, 0, 0, 0, b, 0, 0, 0, 0, b, 0], m)
  }
  if (c.contrast) {
    const k = 1 + c.contrast / 100
    const o = 128 * (1 - k)
    m = mul([k, 0, 0, o, 0, k, 0, o, 0, 0, k, o], m)
  }
  return m
}

const hexRgb = (hex: string) => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const colorCache = new Map<string, HTMLCanvasElement>()

/** Returns the image with colour adjustments applied (cached), or the image itself when neutral. */
export function colorized(img: HTMLImageElement | HTMLCanvasElement, cacheKey: string, c?: ColorOpts): HTMLImageElement | HTMLCanvasElement {
  if (isNeutralColor(c)) return img
  const o = { ...COLOR_DEFAULT, ...c }
  const key = cacheKey + JSON.stringify(o)
  const hit = colorCache.get(key)
  if (hit) return hit
  const w = img instanceof HTMLImageElement ? img.naturalWidth : img.width
  const h = img instanceof HTMLImageElement ? img.naturalHeight : img.height
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const ctx = cv.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  const id = ctx.getImageData(0, 0, w, h)
  const d = id.data
  const m = colorMatrix(o)
  const t = o.tint && o.tintAmount > 0 ? hexRgb(o.tint) : null
  const ta = o.tintAmount
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue
    const r = d[i]
    const g = d[i + 1]
    const b = d[i + 2]
    let R = m[0] * r + m[1] * g + m[2] * b + m[3]
    let G = m[4] * r + m[5] * g + m[6] * b + m[7]
    let B = m[8] * r + m[9] * g + m[10] * b + m[11]
    if (t) {
      // gradient map through the tint colour: shadows stay dark, mid-tones take the colour,
      // highlights go towards white. Blended with the adjusted pixel by tintAmount.
      const L = Math.min(1, Math.max(0, (0.299 * R + 0.587 * G + 0.114 * B) / 255))
      let tr: number, tg: number, tb: number
      if (L < 0.5) {
        const k = L * 2
        tr = t[0] * k
        tg = t[1] * k
        tb = t[2] * k
      } else {
        const k = L * 2 - 1
        tr = t[0] + (255 - t[0]) * k
        tg = t[1] + (255 - t[1]) * k
        tb = t[2] + (255 - t[2]) * k
      }
      R += (tr - R) * ta
      G += (tg - G) * ta
      B += (tb - B) * ta
    }
    d[i] = R
    d[i + 1] = G
    d[i + 2] = B
  }
  ctx.putImageData(id, 0, 0)
  if (colorCache.size > 24) colorCache.delete(colorCache.keys().next().value!)
  colorCache.set(key, cv)
  return cv
}

export const imageSize = (img: HTMLImageElement | HTMLCanvasElement) =>
  img instanceof HTMLImageElement ? { w: img.naturalWidth, h: img.naturalHeight } : { w: img.width, h: img.height }

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
