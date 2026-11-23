/**
 * Mask = Uint8ClampedArray, one byte per pixel: 255 keeps the pixel, 0 cuts it away.
 * All operations work in image pixel coordinates.
 */
export type Mask = Uint8ClampedArray

export interface Img {
  w: number
  h: number
  /** RGBA pixels of the original image */
  data: Uint8ClampedArray
}

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export const fullRect = (img: Img): Rect => ({ x0: 0, y0: 0, x1: img.w, y1: img.h })
export const unionRect = (a: Rect | null, b: Rect): Rect =>
  a ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : b
const clampRect = (r: Rect, img: Img): Rect => ({
  x0: Math.max(0, Math.floor(r.x0)),
  y0: Math.max(0, Math.floor(r.y0)),
  x1: Math.min(img.w, Math.ceil(r.x1)),
  y1: Math.min(img.h, Math.ceil(r.y1)),
})

/* ---------------- brush ---------------- */

/** Stamps a round brush; returns the touched rect. hardness 0..1 */
export function stamp(mask: Mask, img: Img, cx: number, cy: number, radius: number, hardness: number, erase: boolean): Rect {
  const r = clampRect({ x0: cx - radius - 1, y0: cy - radius - 1, x1: cx + radius + 1, y1: cy + radius + 1 }, img)
  const inner = radius * hardness
  const soft = Math.max(0.5, radius - inner)
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (d > radius) continue
      const a = d <= inner ? 1 : 1 - (d - inner) / soft
      const i = y * img.w + x
      if (erase) mask[i] = Math.min(mask[i], 255 * (1 - a))
      else mask[i] = Math.max(mask[i], 255 * a)
    }
  }
  return r
}

/** Brush stroke segment with even spacing between stamps. */
export function strokeSegment(mask: Mask, img: Img, x0: number, y0: number, x1: number, y1: number, radius: number, hardness: number, erase: boolean): Rect {
  const dist = Math.hypot(x1 - x0, y1 - y0)
  const step = Math.max(1, radius * 0.25)
  const n = Math.max(1, Math.ceil(dist / step))
  let rect: Rect | null = null
  for (let i = 1; i <= n; i++) {
    const t = i / n
    rect = unionRect(rect, stamp(mask, img, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius, hardness, erase))
  }
  return rect!
}

/* ---------------- selections ---------------- */

/** Rasterizes a polygon into a 0..255 coverage array (antialiased by the canvas). */
export function polygonSelection(img: Img, pts: [number, number][]): Uint8ClampedArray {
  const c = document.createElement('canvas')
  c.width = img.w
  c.height = img.h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
  ctx.fill()
  const d = ctx.getImageData(0, 0, img.w, img.h).data
  const sel = new Uint8ClampedArray(img.w * img.h)
  for (let i = 0; i < sel.length; i++) sel[i] = d[i * 4 + 3]
  return sel
}

/** Contiguous region of similar colour starting at (sx, sy). */
export function magicWand(img: Img, sx: number, sy: number, tolerance: number, contiguous = true): Uint8ClampedArray {
  const { w, h, data } = img
  const sel = new Uint8ClampedArray(w * h)
  const x0 = Math.floor(sx)
  const y0 = Math.floor(sy)
  if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return sel
  const s = (y0 * w + x0) * 4
  const R = data[s]
  const G = data[s + 1]
  const B = data[s + 2]
  const tol2 = tolerance * tolerance * 3
  const near = (p: number) => {
    const i = p * 4
    const dr = data[i] - R
    const dg = data[i + 1] - G
    const db = data[i + 2] - B
    return dr * dr + dg * dg + db * db <= tol2
  }
  if (!contiguous) {
    for (let p = 0; p < w * h; p++) if (near(p)) sel[p] = 255
    return sel
  }
  const stack = [y0 * w + x0]
  sel[stack[0]] = 255
  while (stack.length) {
    const p = stack.pop()!
    const x = p % w
    const y = (p / w) | 0
    const visit = (q: number) => {
      if (!sel[q] && near(q)) {
        sel[q] = 255
        stack.push(q)
      }
    }
    if (x > 0) visit(p - 1)
    if (x < w - 1) visit(p + 1)
    if (y > 0) visit(p - w)
    if (y < h - 1) visit(p + w)
  }
  // grow by one pixel so anti-aliased edges are included
  return dilate(sel, w, h, 1)
}

export type SelectionOp = 'keep' | 'add' | 'erase'

/** Applies a selection to the mask. */
export function applySelection(mask: Mask, sel: Uint8ClampedArray, op: SelectionOp) {
  for (let i = 0; i < mask.length; i++) {
    const s = sel[i]
    if (op === 'keep') mask[i] = Math.min(mask[i], s)
    else if (op === 'add') mask[i] = Math.max(mask[i], s)
    else mask[i] = Math.min(mask[i], 255 - s)
  }
}

/* ---------------- helpers ---------------- */

export function dilate(src: Uint8ClampedArray, w: number, h: number, r: number) {
  let cur = src
  for (let k = 0; k < r; k++) {
    const out = new Uint8ClampedArray(cur)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = y * w + x
        if (cur[p]) continue
        let m = 0
        if (x > 0) m = Math.max(m, cur[p - 1])
        if (x < w - 1) m = Math.max(m, cur[p + 1])
        if (y > 0) m = Math.max(m, cur[p - w])
        if (y < h - 1) m = Math.max(m, cur[p + w])
        out[p] = m
      }
    cur = out
  }
  return cur
}

/** separable box blur on a single channel, radius r, in place-ish */
export function boxBlur(src: Uint8ClampedArray | Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  const size = r * 2 + 1
  for (let y = 0; y < h; y++) {
    let acc = 0
    const row = y * w
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))]
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / size
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)]
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / size
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
    }
  }
  return out
}

/** Softens the mask edge; radius in px. */
export function feather(mask: Mask, w: number, h: number, radius: number): Mask {
  if (radius <= 0) return mask
  const b = boxBlur(boxBlur(mask, w, h, Math.ceil(radius / 2)), w, h, Math.ceil(radius / 2))
  const out = new Uint8ClampedArray(w * h)
  for (let i = 0; i < out.length; i++) out[i] = b[i]
  return out
}

/** Expand (>0) or shrink (<0) the kept area by n px. */
export function grow(mask: Mask, w: number, h: number, n: number): Mask {
  if (!n) return mask
  if (n > 0) return dilate(mask, w, h, n)
  const inv = new Uint8ClampedArray(mask.length)
  for (let i = 0; i < mask.length; i++) inv[i] = 255 - mask[i]
  const d = dilate(inv, w, h, -n)
  for (let i = 0; i < d.length; i++) d[i] = 255 - d[i]
  return d
}

/** Background = similar to the border colour and connected to the border. */
export function autoBackground(img: Img, tolerance = 42): Mask {
  const { w, h, data } = img
  const border: number[] = []
  for (let x = 0; x < w; x += 3) border.push(x, (h - 1) * w + x)
  for (let y = 0; y < h; y += 3) border.push(y * w, y * w + w - 1)
  const med = (k: number) => border.map((p) => data[p * 4 + k]).sort((a, b) => a - b)[border.length >> 1]
  const ref = [med(0), med(1), med(2)]
  const tol2 = tolerance * tolerance * 3
  const near = (p: number) => {
    const i = p * 4
    const dr = data[i] - ref[0]
    const dg = data[i + 1] - ref[1]
    const db = data[i + 2] - ref[2]
    return dr * dr + dg * dg + db * db < tol2 || data[i + 3] < 20
  }
  const bg = new Uint8Array(w * h)
  const stack: number[] = []
  const push = (p: number) => {
    if (!bg[p] && near(p)) {
      bg[p] = 1
      stack.push(p)
    }
  }
  for (let x = 0; x < w; x++) push(x), push((h - 1) * w + x)
  for (let y = 0; y < h; y++) push(y * w), push(y * w + w - 1)
  while (stack.length) {
    const p = stack.pop()!
    const x = p % w
    const y = (p / w) | 0
    if (x > 0) push(p - 1)
    if (x < w - 1) push(p + 1)
    if (y > 0) push(p - w)
    if (y < h - 1) push(p + w)
  }
  const m = new Uint8ClampedArray(w * h)
  for (let i = 0; i < m.length; i++) m[i] = bg[i] ? 0 : 255
  return feather(m, w, h, 1)
}

/* ---------------- smart selection ---------------- */

export interface SmartStroke {
  kind: 'fg' | 'bg'
  radius: number
  pts: [number, number][]
}

function kmeans(samples: number[][], k: number) {
  if (samples.length <= k) return samples.slice()
  let centers = Array.from({ length: k }, (_, i) => samples[Math.floor((i / k) * samples.length)].slice())
  for (let it = 0; it < 8; it++) {
    const sum = centers.map(() => [0, 0, 0, 0])
    for (const s of samples) {
      let best = 0
      let bd = Infinity
      for (let c = 0; c < centers.length; c++) {
        const d = (s[0] - centers[c][0]) ** 2 + (s[1] - centers[c][1]) ** 2 + (s[2] - centers[c][2]) ** 2
        if (d < bd) {
          bd = d
          best = c
        }
      }
      sum[best][0] += s[0]
      sum[best][1] += s[1]
      sum[best][2] += s[2]
      sum[best][3]++
    }
    centers = sum.filter((s) => s[3]).map((s) => [s[0] / s[3], s[1] / s[3], s[2] / s[3]])
  }
  return centers
}

/**
 * "Smart brush": the user marks the object (fg) and optionally the background (bg).
 * Pixels are classified by colour against both palettes, smoothed, and only the regions
 * connected to the object strokes are kept. Works on a downscaled copy for speed.
 */
export function smartSegment(img: Img, strokes: SmartStroke[]): Mask | null {
  const fgStrokes = strokes.filter((s) => s.kind === 'fg')
  if (!fgStrokes.length) return null
  const k = Math.min(1, 520 / Math.max(img.w, img.h))
  const w = Math.max(1, Math.round(img.w * k))
  const h = Math.max(1, Math.round(img.h * k))
  // downscale image
  const src = document.createElement('canvas')
  src.width = img.w
  src.height = img.h
  src.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0)
  const sm = document.createElement('canvas')
  sm.width = w
  sm.height = h
  const sctx = sm.getContext('2d', { willReadFrequently: true })!
  sctx.drawImage(src, 0, 0, w, h)
  const px = sctx.getImageData(0, 0, w, h).data

  // rasterize strokes into a label map
  const lab = document.createElement('canvas')
  lab.width = w
  lab.height = h
  const lctx = lab.getContext('2d', { willReadFrequently: true })!
  lctx.lineCap = 'round'
  lctx.lineJoin = 'round'
  for (const s of strokes) {
    lctx.strokeStyle = s.kind === 'fg' ? '#f00' : '#00f'
    lctx.fillStyle = lctx.strokeStyle
    lctx.lineWidth = Math.max(1, s.radius * 2 * k)
    lctx.beginPath()
    s.pts.forEach(([x, y], i) => (i ? lctx.lineTo(x * k, y * k) : lctx.moveTo(x * k, y * k)))
    if (s.pts.length === 1) {
      lctx.arc(s.pts[0][0] * k, s.pts[0][1] * k, Math.max(1, s.radius * k), 0, Math.PI * 2)
      lctx.fill()
    } else lctx.stroke()
  }
  const ld = lctx.getImageData(0, 0, w, h).data
  const label = new Uint8Array(w * h) // 1 fg, 2 bg
  const fgS: number[][] = []
  const bgS: number[][] = []
  for (let p = 0; p < w * h; p++) {
    if (ld[p * 4 + 3] < 128) continue
    label[p] = ld[p * 4] > ld[p * 4 + 2] ? 1 : 2
    ;(label[p] === 1 ? fgS : bgS).push([px[p * 4], px[p * 4 + 1], px[p * 4 + 2]])
  }
  // no background marks: sample the border, but not where the object strokes are
  if (bgS.length < 20) {
    for (let x = 0; x < w; x += 2)
      for (const y of [0, h - 1]) {
        const p = y * w + x
        if (label[p] !== 1) bgS.push([px[p * 4], px[p * 4 + 1], px[p * 4 + 2]])
      }
    for (let y = 0; y < h; y += 2)
      for (const x of [0, w - 1]) {
        const p = y * w + x
        if (label[p] !== 1) bgS.push([px[p * 4], px[p * 4 + 1], px[p * 4 + 2]])
      }
  }
  const sub = (a: number[][]) => (a.length > 3000 ? a.filter((_, i) => i % Math.ceil(a.length / 3000) === 0) : a)
  const F = kmeans(sub(fgS), 8)
  const Bc = kmeans(sub(bgS), 8)
  const nearest = (r: number, g: number, b: number, C: number[][]) => {
    let m = Infinity
    for (const c of C) m = Math.min(m, (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2)
    return Math.sqrt(m)
  }
  const prob = new Float32Array(w * h)
  for (let p = 0; p < w * h; p++) {
    if (label[p]) {
      prob[p] = label[p] === 1 ? 1 : 0
      continue
    }
    const r = px[p * 4]
    const g = px[p * 4 + 1]
    const b = px[p * 4 + 2]
    const dF = nearest(r, g, b, F)
    const dB = nearest(r, g, b, Bc)
    prob[p] = dB / (dF + dB + 1e-6)
  }
  const smooth = boxBlur(boxBlur(prob, w, h, 1), w, h, 1)
  const fg = new Uint8Array(w * h)
  for (let p = 0; p < w * h; p++) fg[p] = label[p] === 1 || (label[p] !== 2 && smooth[p] > 0.5) ? 1 : 0

  // keep only regions connected to object strokes
  const keep = new Uint8Array(w * h)
  const stack: number[] = []
  for (let p = 0; p < w * h; p++)
    if (label[p] === 1 && fg[p]) {
      keep[p] = 1
      stack.push(p)
    }
  while (stack.length) {
    const p = stack.pop()!
    const x = p % w
    const y = (p / w) | 0
    const visit = (q: number) => {
      if (!keep[q] && fg[q]) {
        keep[q] = 1
        stack.push(q)
      }
    }
    if (x > 0) visit(p - 1)
    if (x < w - 1) visit(p + 1)
    if (y > 0) visit(p - w)
    if (y < h - 1) visit(p + w)
  }
  // fill holes that don't touch the border and weren't marked as background
  const outside = new Uint8Array(w * h)
  const st2: number[] = []
  const seed = (p: number) => {
    if (!keep[p] && !outside[p]) {
      outside[p] = 1
      st2.push(p)
    }
  }
  for (let x = 0; x < w; x++) seed(x), seed((h - 1) * w + x)
  for (let y = 0; y < h; y++) seed(y * w), seed(y * w + w - 1)
  for (let p = 0; p < w * h; p++) if (label[p] === 2) seed(p)
  while (st2.length) {
    const p = st2.pop()!
    const x = p % w
    const y = (p / w) | 0
    if (x > 0) seed(p - 1)
    if (x < w - 1) seed(p + 1)
    if (y > 0) seed(p - w)
    if (y < h - 1) seed(p + w)
  }

  // upscale with smoothing for soft edges
  const small = new ImageData(w, h)
  for (let p = 0; p < w * h; p++) small.data[p * 4 + 3] = outside[p] ? 0 : 255
  const mc = document.createElement('canvas')
  mc.width = w
  mc.height = h
  mc.getContext('2d')!.putImageData(small, 0, 0)
  const big = document.createElement('canvas')
  big.width = img.w
  big.height = img.h
  const bctx = big.getContext('2d', { willReadFrequently: true })!
  bctx.imageSmoothingQuality = 'high'
  bctx.drawImage(mc, 0, 0, img.w, img.h)
  const bd = bctx.getImageData(0, 0, img.w, img.h).data
  const mask = new Uint8ClampedArray(img.w * img.h)
  // sharpen the blurry upscaled edge a little
  for (let i = 0; i < mask.length; i++) mask[i] = Math.max(0, Math.min(255, (bd[i * 4 + 3] - 128) * 2.2 + 128))
  return mask
}
