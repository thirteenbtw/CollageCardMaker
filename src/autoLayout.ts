import type { Asset, CardDoc, CardNode, ImageNode } from './types'
import { getFormat, PAPER_COLORS } from './formats'
import { makeImageNode, makeTextNode } from './editor'
import { TAPES } from './effects'
import { pick, rand, shuffle } from './util'

export type LayoutStyle = 'scatter' | 'hero' | 'corners' | 'frame'

export const STYLE_LABELS: Record<LayoutStyle, string> = {
  scatter: 'Россыпь по кругу',
  hero: 'Большое фото + мелочи',
  corners: 'Углы и центр',
  frame: 'Рамка из элементов',
}

export interface AutoOptions {
  /** limit to assets with this tag; null = whole library */
  tag: string | null
  text: string | null
  style?: LayoutStyle
  withFrame?: boolean
}

interface Box {
  x: number
  y: number
  r: number
}

/** Free zone in the middle, kept for the greeting. */
const textZone = (W: number, H: number) => ({ x0: W * 0.2, x1: W * 0.8, y0: H * 0.32, y1: H * 0.68 })

/** candidate anchor points per style, in 0..1 card coordinates */
function anchors(style: LayoutStyle, n: number): [number, number][] {
  switch (style) {
    case 'corners':
      return shuffle([
        [0.12, 0.15], [0.88, 0.15], [0.12, 0.85], [0.88, 0.85], [0.5, 0.1], [0.5, 0.92], [0.06, 0.5], [0.94, 0.5],
      ] as [number, number][]).slice(0, n)
    case 'frame': {
      const pts: [number, number][] = []
      for (let i = 0; i < n; i++) {
        const t = i / n
        // walk around the edge
        const p = t * 4
        if (p < 1) pts.push([0.08 + p * 0.84, 0.1])
        else if (p < 2) pts.push([0.92, 0.1 + (p - 1) * 0.8])
        else if (p < 3) pts.push([0.92 - (p - 2) * 0.84, 0.9])
        else pts.push([0.08, 0.9 - (p - 3) * 0.8])
      }
      return pts
    }
    default: {
      const pts: [number, number][] = []
      const off = Math.random() * Math.PI * 2
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2 + rand(-0.4, 0.4)
        const d = rand(0.32, 0.46)
        pts.push([0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d])
      }
      return pts
    }
  }
}

function place(nodes: ImageNode[], assets: Map<string, Asset>, style: LayoutStyle, W: number, H: number, keepCentre: boolean) {
  const zone = textZone(W, H)
  const placed: Box[] = []
  const pts = anchors(style, nodes.length)
  nodes.forEach((node, i) => {
    const a = assets.get(node.assetId)
    const big = style === 'hero' && i === 0
    let ratio = a?.category === 'sticker' ? rand(0.14, 0.22) : a?.category === 'photo' ? rand(0.34, 0.46) : rand(0.3, 0.42)
    if (big) ratio = keepCentre ? 0.5 : 0.62
    if (style === 'frame') ratio *= 0.75
    const k = (Math.min(W, H) * ratio) / Math.max(node.width, node.height)
    node.scaleX = node.scaleY = k
    const r = (Math.max(node.width, node.height) * k) / 2
    let best = { x: W / 2, y: H / 2, score: -Infinity }
    const [ax, ay] = big ? [keepCentre ? 0.27 : 0.4, 0.5] : pts[i % pts.length]
    for (let t = 0; t < 50; t++) {
      const jitter = t === 0 ? 0 : 0.08
      const x = (ax + rand(-jitter, jitter)) * W
      const y = (ay + rand(-jitter, jitter)) * H
      let score = -Math.hypot(x - ax * W, y - ay * H) * 0.2
      if (keepCentre && !big) {
        const ox = Math.max(0, Math.min(x + r * 0.6, zone.x1) - Math.max(x - r * 0.6, zone.x0))
        const oy = Math.max(0, Math.min(y + r * 0.6, zone.y1) - Math.max(y - r * 0.6, zone.y0))
        score -= ox * oy * 0.02
      }
      for (const p of placed) score -= Math.max(0, (p.r + r) * 0.65 - Math.hypot(p.x - x, p.y - y)) * 2
      if (score > best.score) best = { x, y, score }
    }
    node.x = best.x
    node.y = best.y
    node.rotation = big ? rand(-4, 4) : rand(-14, 14)
    placed.push({ x: best.x, y: best.y, r })
  })
}

/**
 * Builds a collage from the library:
 * a background, 3–7 photos / cut-outs / stickers, optional frame and greeting.
 */
export function autoLayout(all: Asset[], formatId: string, opts: AutoOptions): CardDoc {
  const { width: W, height: H } = getFormat(formatId)
  const style = opts.style ?? 'scatter'
  const pool = opts.tag ? all.filter((a) => a.tags.includes(opts.tag!)) : all
  const of = (...cats: Asset['category'][]) => {
    const inTag = pool.filter((a) => cats.includes(a.category))
    return inTag.length ? inTag : all.filter((a) => cats.includes(a.category))
  }
  const byId = new Map(all.map((a) => [a.id, a]))
  const nodes: CardNode[] = []

  const bgs = of('background')
  if (bgs.length) nodes.push(makeImageNode(pick(bgs), W, H))

  const big = shuffle(of('photo', 'cutout'))
  const small = shuffle(of('sticker'))
  const total = Math.round(rand(3, 7))
  let nBig = Math.min(big.length, Math.max(1, Math.round(total * 0.6)))
  let nSmall = Math.min(small.length, total - nBig)
  if (nBig + nSmall < total) nBig = Math.min(big.length, total - nSmall)
  if (style === 'hero' && big.length) nBig = Math.max(1, nBig)
  nSmall = Math.min(small.length, Math.max(nSmall, total - nBig))
  // photos first so they end up underneath stickers
  const chosen = [...big.slice(0, nBig), ...small.slice(0, nSmall)]
  const items = chosen.map((a) => makeImageNode(a, W, H))
  place(items, byId, style, W, H, !!opts.text)
  items.forEach((n) => {
    const a = byId.get(n.assetId)
    if (a?.category === 'photo') {
      n.shadow = true
      if (Math.random() < 0.5) n.tape = pick(TAPES).id
      if (Math.random() < 0.3) n.torn = true
    } else if (a?.category === 'cutout' && Math.random() < 0.35) n.shadow = true
  })
  nodes.push(...items)

  if (opts.withFrame) {
    const frames = of('frame')
    if (frames.length) nodes.push(makeImageNode(pick(frames), W, H))
  }
  if (opts.text) {
    const t = makeTextNode(W, H, opts.text, 'hand')
    t.rotation = rand(-4, 4)
    if (style === 'hero') {
      t.x = W * 0.72
      t.width = W * 0.45
    }
    nodes.push(t)
  }
  return { formatId, background: pick(PAPER_COLORS.slice(0, 7)), nodes }
}

/** Re-arranges the loose elements of an existing card, keeping background, frame and text. */
export function reshuffle(doc: CardDoc, all: Asset[]): CardDoc {
  const { width: W, height: H } = getFormat(doc.formatId)
  const byId = new Map(all.map((a) => [a.id, a]))
  const next = structuredClone(doc)
  const loose = next.nodes.filter((n): n is ImageNode => n.type === 'image' && !n.role && !n.locked)
  const hasText = next.nodes.some((n) => n.type === 'text')
  place(loose, byId, pick(['scatter', 'corners', 'scatter', 'frame'] as LayoutStyle[]), W, H, hasText)
  return next
}

export const OCCASIONS: Record<string, string[]> = {
  'День рождения': ['С днём рождения!', 'Загадай желание!', 'Ещё один круг вокруг солнца', 'Ура, праздник!'],
  'Спасибо': ['Спасибо!', 'Спасибо тебе от всего сердца', 'Ты чудо', 'Очень ценю'],
  'Новый год': ['С Новым годом!', 'Тёплой зимы', 'Пусть сбудется', 'Чудес в новом году'],
  'Праздник': ['С праздником!', 'Тёплых дней', 'Уютных вечеров', 'Пусть будет светло'],
  'Свадьба': ['Совет да любовь!', 'Счастья вам двоим', 'Долго и счастливо', 'Любовь побеждает'],
  'Просто так': ['Думаю о тебе', 'Привет!', 'Скучаю', 'Маленький привет'],
}
