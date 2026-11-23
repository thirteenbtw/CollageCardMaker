import type { Asset, CardDoc, CardNode } from './types'
import { getFormat } from './formats'
import { makeImageNode, makeTextNode } from './editor'

export interface AutoOptions {
  withText: boolean
  text: string
  tag: string | null
  withFrame: boolean
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]
const shuffle = <T,>(arr: T[]) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const SOFT_COLORS = ['#f6efe3', '#efe2cf', '#e9d8c4', '#f3e6d8', '#e6ddd0', '#f2e9dc']

/**
 * Builds a random collage:
 *  - a random background (or a paper colour if there are no backgrounds)
 *  - 3–7 cut-outs / stickers scattered over the canvas with slight rotations
 *  - when text is on, elements avoid the central zone, which is kept for the text
 */
export function autoLayout(assets: Asset[], formatId: string, opts: AutoOptions): CardDoc {
  const f = getFormat(formatId)
  const { width: W, height: H } = f
  const pool = opts.tag ? assets.filter((a) => a.tags.includes(opts.tag!)) : assets
  // fall back to the whole library if the tag filter leaves a category empty
  const of = (c: Asset['category']) => {
    const inTag = pool.filter((a) => a.category === c)
    return inTag.length ? inTag : assets.filter((a) => a.category === c)
  }

  const nodes: CardNode[] = []
  const bgs = of('background')
  if (bgs.length) nodes.push(makeImageNode(pick(bgs), W, H))

  const items = [...of('cutout'), ...of('sticker')]
  const count = Math.min(items.length, Math.round(rand(3, 7)))
  // reuse elements only if the library is tiny
  const chosen = items.length >= count ? shuffle(items).slice(0, count) : items

  // central free zone for text
  const free = { x0: W * 0.22, x1: W * 0.78, y0: H * 0.3, y1: H * 0.7 }
  const placed: { x: number; y: number; r: number }[] = []

  chosen.forEach((asset, i) => {
    // cut-outs bigger, stickers smaller
    const ratio = asset.category === 'cutout' ? rand(0.3, 0.45) : rand(0.14, 0.24)
    const node = makeImageNode(asset, W, H, undefined, ratio)
    const r = (Math.max(asset.width, asset.height) * node.scaleX) / 2

    let best = { x: W / 2, y: H / 2, score: -Infinity }
    for (let t = 0; t < 40; t++) {
      // spread around the canvas: start from a ring of angles so elements don't clump
      const angle = (i / chosen.length) * Math.PI * 2 + rand(-0.6, 0.6)
      const dist = rand(0.25, 0.55)
      const x = W / 2 + Math.cos(angle) * W * dist + rand(-W * 0.05, W * 0.05)
      const y = H / 2 + Math.sin(angle) * H * dist + rand(-H * 0.05, H * 0.05)
      if (x < -r * 0.2 || x > W + r * 0.2 || y < -r * 0.2 || y > H + r * 0.2) continue
      let score = 0
      if (opts.withText) {
        const inside = x + r * 0.5 > free.x0 && x - r * 0.5 < free.x1 && y + r * 0.5 > free.y0 && y - r * 0.5 < free.y1
        if (inside) score -= 1000
      }
      // keep some overlap (collage), but punish heavy stacking
      for (const p of placed) {
        const d = Math.hypot(p.x - x, p.y - y)
        score -= Math.max(0, (p.r + r) * 0.7 - d)
      }
      if (score > best.score) best = { x, y, score }
    }
    node.x = best.x
    node.y = best.y
    node.rotation = rand(-14, 14)
    placed.push({ x: best.x, y: best.y, r })
    nodes.push(node)
  })

  if (opts.withFrame) {
    const frames = of('frame')
    if (frames.length) nodes.push(makeImageNode(pick(frames), W, H))
  }

  if (opts.withText) {
    const t = makeTextNode(W, H, opts.text || 'С праздником!')
    t.rotation = rand(-4, 4)
    nodes.push(t)
  }

  return { formatId, background: pick(SOFT_COLORS), nodes }
}
