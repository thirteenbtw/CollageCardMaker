const MAX_SIDE = 2400

export function hasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const d = ctx.getImageData(0, 0, w, h).data
  for (let i = 3; i < d.length; i += 4 * 7) if (d[i] < 250) return true
  return false
}

export const canvasToBlob = (c: HTMLCanvasElement, type = 'image/png', q = 0.92) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), type, q))

/** Decode any image file (incl. SVG) to a canvas, downscaled to MAX_SIDE. */
export async function fileToCanvas(file: Blob): Promise<HTMLCanvasElement> {
  let source: CanvasImageSource
  let w: number
  let h: number
  if (file.type === 'image/svg+xml') {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.src = url
    await img.decode()
    URL.revokeObjectURL(url)
    w = img.naturalWidth || 800
    h = img.naturalHeight || 800
    // vector: render crisp at a comfortable size
    const k = 1200 / Math.max(w, h)
    w *= k
    h *= k
    source = img
  } else {
    const bmp = await createImageBitmap(file)
    source = bmp
    w = bmp.width
    h = bmp.height
  }
  const k = Math.min(1, MAX_SIDE / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.round(w * k)
  c.height = Math.round(h * k)
  c.getContext('2d')!.drawImage(source, 0, 0, c.width, c.height)
  if ('close' in source) (source as ImageBitmap).close()
  return c
}

/**
 * Simple background removal for cut-outs shot on a plain backdrop:
 * flood-fills from the borders over pixels close to the border colour,
 * then feathers the edge a little. Works well for objects on white / paper / a single colour.
 */
export function removeBackground(c: HTMLCanvasElement, tolerance = 42) {
  const w = c.width
  const h = c.height
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  // reference colour = median of border pixels
  const border: number[][] = []
  for (let x = 0; x < w; x += 4) border.push([x, 0], [x, h - 1])
  for (let y = 0; y < h; y += 4) border.push([0, y], [w - 1, y])
  const ch = (k: number) => border.map(([x, y]) => d[(y * w + x) * 4 + k]).sort((a, b) => a - b)[border.length >> 1]
  const ref = [ch(0), ch(1), ch(2)]
  const tol2 = tolerance * tolerance * 3
  const close = (i: number) => {
    const dr = d[i] - ref[0]
    const dg = d[i + 1] - ref[1]
    const db = d[i + 2] - ref[2]
    return dr * dr + dg * dg + db * db < tol2
  }
  const mask = new Uint8Array(w * h) // 1 = background
  const stack: number[] = []
  const push = (p: number) => {
    if (!mask[p] && close(p * 4)) {
      mask[p] = 1
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
  let removed = 0
  for (let p = 0; p < w * h; p++) {
    if (mask[p]) {
      d[p * 4 + 3] = 0
      removed++
      continue
    }
    // soften pixels touching the background
    const x = p % w
    const y = (p / w) | 0
    let n = 0
    if (x > 0 && mask[p - 1]) n++
    if (x < w - 1 && mask[p + 1]) n++
    if (y > 0 && mask[p - w]) n++
    if (y < h - 1 && mask[p + w]) n++
    if (n) d[p * 4 + 3] = Math.min(d[p * 4 + 3], 255 - n * 45)
  }
  ctx.putImageData(img, 0, 0)
  return removed / (w * h)
}

/** Crop transparent margins so the cut-out's box hugs the object. */
export function trimTransparent(c: HTMLCanvasElement): HTMLCanvasElement {
  const w = c.width
  const h = c.height
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (d[(y * w + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  if (x1 < 0) return c
  const pad = 4
  x0 = Math.max(0, x0 - pad)
  y0 = Math.max(0, y0 - pad)
  x1 = Math.min(w - 1, x1 + pad)
  y1 = Math.min(h - 1, y1 + pad)
  if (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1) return c
  const out = document.createElement('canvas')
  out.width = x1 - x0 + 1
  out.height = y1 - y0 + 1
  out.getContext('2d')!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
  return out
}
