/** Named colours used for library colour tags and filters. */
export interface NamedColor {
  id: string
  label: string
  hex: string
}

export const NAMED_COLORS: NamedColor[] = [
  { id: 'terracotta', label: 'терракота', hex: '#D2694B' },
  { id: 'blush', label: 'розовый', hex: '#EBA48D' },
  { id: 'red', label: 'красный', hex: '#C0392B' },
  { id: 'mustard', label: 'горчица', hex: '#E4B011' },
  { id: 'sand', label: 'песочный', hex: '#E6C98A' },
  { id: 'sage', label: 'шалфей', hex: '#8A9A6B' },
  { id: 'green', label: 'зелёный', hex: '#4E8A4A' },
  { id: 'slate', label: 'синий', hex: '#5D798E' },
  { id: 'sky', label: 'голубой', hex: '#A9C8DE' },
  { id: 'violet', label: 'сиреневый', hex: '#9A86B8' },
  { id: 'cream', label: 'кремовый', hex: '#F1E6D0' },
  { id: 'kraft', label: 'крафт', hex: '#C9A27A' },
  { id: 'ink', label: 'тёмный', hex: '#2A1712' },
]

export const colorById = (id: string) => NAMED_COLORS.find((c) => c.id === id)

const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

// convert to a rough perceptual space (Lab-ish via weighted RGB) for nearest-match
const RGB = NAMED_COLORS.map((c) => toRgb(c.hex))
function nearest(r: number, g: number, b: number) {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < RGB.length; i++) {
    const [R, G, B] = RGB[i]
    const rm = (r + R) / 2
    const d = (2 + rm / 256) * (r - R) ** 2 + 4 * (g - G) ** 2 + (2 + (255 - rm) / 256) * (b - B) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/** Returns up to 3 named colours that cover a noticeable share of the visible pixels. */
export function detectColors(source: CanvasImageSource, w: number, h: number): string[] {
  const size = 48
  const k = size / Math.max(w, h)
  const cw = Math.max(1, Math.round(w * k))
  const ch = Math.max(1, Math.round(h * k))
  const c = document.createElement('canvas')
  c.width = cw
  c.height = ch
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, cw, ch)
  const data = ctx.getImageData(0, 0, cw, ch).data
  const counts = new Array(NAMED_COLORS.length).fill(0)
  let total = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    counts[nearest(data[i], data[i + 1], data[i + 2])]++
    total++
  }
  if (!total) return []
  return counts
    .map((n, i) => ({ n, i }))
    .filter((x) => x.n / total > 0.1)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((x) => NAMED_COLORS[x.i].id)
}
