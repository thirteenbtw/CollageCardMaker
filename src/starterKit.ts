import { nanoid } from 'nanoid'
import type { Asset, AssetCategory } from './types'
import { canvasToBlob } from './imageTools'
import { detectColors } from './colors'
import { rng } from './util'

/**
 * A small built-in set of elements drawn procedurally, so the app is usable
 * (and auto-generate works) before the user uploads anything.
 */

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void
interface Spec {
  name: string
  category: AssetCategory
  tags: string[]
  w: number
  h: number
  draw: Draw
}

const INK = '#2A1712'

function burst(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, spikes: number, inner = 0.84) {
  ctx.beginPath()
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2
    const rr = i % 2 ? r * inner : r
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
  }
  ctx.closePath()
}

const sticker = (word: string, fill: string, tags: string[], size = 96): Spec => ({
  name: `Стикер «${word}»`,
  category: 'sticker',
  tags: ['надписи', ...tags],
  w: 420,
  h: 420,
  draw(ctx, w, h) {
    ctx.lineWidth = 7
    ctx.lineJoin = 'round'
    burst(ctx, w / 2, h / 2, w * 0.46, 16)
    ctx.fillStyle = INK
    ctx.save()
    ctx.translate(8, 8)
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = fill
    ctx.fill()
    ctx.strokeStyle = INK
    ctx.stroke()
    ctx.fillStyle = INK
    ctx.font = `700 ${size}px Caveat`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(word, w / 2, h / 2 + 6)
  },
})

const flower = (name: string, petal: string, centre: string, petals: number, tags: string[]): Spec => ({
  name,
  category: 'cutout',
  tags: ['цветы', 'ботаника', ...tags],
  w: 640,
  h: 760,
  draw(ctx, w) {
    const cx = w / 2
    const cy = 280
    // stem and leaves
    ctx.strokeStyle = '#6E7F52'
    ctx.lineWidth = 14
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(cx, cy + 60)
    ctx.quadraticCurveTo(cx - 30, 520, cx + 10, 740)
    ctx.stroke()
    ctx.fillStyle = '#8A9A6B'
    for (const [x, y, rot] of [[cx - 70, 520, -0.7], [cx + 60, 600, 0.6]] as const) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rot)
      ctx.beginPath()
      ctx.ellipse(0, 0, 70, 26, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    ctx.fillStyle = petal
    ctx.strokeStyle = 'rgba(42,23,18,.35)'
    ctx.lineWidth = 4
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2
      ctx.save()
      ctx.translate(cx + Math.cos(a) * 120, cy + Math.sin(a) * 120)
      ctx.rotate(a)
      ctx.beginPath()
      ctx.ellipse(0, 0, 130, 78, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
    ctx.fillStyle = centre
    ctx.beginPath()
    ctx.arc(cx, cy, 82, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(42,23,18,.25)'
    const r = rng(petals * 99)
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2
      const d = r() * 64
      ctx.beginPath()
      ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 5, 0, Math.PI * 2)
      ctx.fill()
    }
  },
})

/** torn piece of paper */
const scrap = (name: string, fill: string, tags: string[], lines: 'ruled' | 'grid' | 'none'): Spec => ({
  name,
  category: 'cutout',
  tags: ['бумага', ...tags],
  w: 760,
  h: 560,
  draw(ctx, w, h) {
    const r = rng(name.length * 31)
    ctx.beginPath()
    const pts: [number, number][] = []
    const m = 20
    for (let x = m; x < w - m; x += 18) pts.push([x, m + r() * 24])
    for (let y = m; y < h - m; y += 18) pts.push([w - m - r() * 24, y])
    for (let x = w - m; x > m; x -= 18) pts.push([x, h - m - r() * 24])
    for (let y = h - m; y > m; y -= 18) pts.push([m + r() * 24, y])
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
    ctx.save()
    ctx.clip()
    ctx.lineWidth = 2
    if (lines === 'ruled') {
      ctx.strokeStyle = 'rgba(93,121,142,.45)'
      for (let y = 90; y < h; y += 44) (ctx.beginPath(), ctx.moveTo(0, y), ctx.lineTo(w, y), ctx.stroke())
      ctx.strokeStyle = 'rgba(210,105,75,.6)'
      ctx.beginPath()
      ctx.moveTo(110, 0)
      ctx.lineTo(110, h)
      ctx.stroke()
    } else if (lines === 'grid') {
      ctx.strokeStyle = 'rgba(93,121,142,.35)'
      for (let y = 0; y < h; y += 28) (ctx.beginPath(), ctx.moveTo(0, y), ctx.lineTo(w, y), ctx.stroke())
      for (let x = 0; x < w; x += 28) (ctx.beginPath(), ctx.moveTo(x, 0), ctx.lineTo(x, h), ctx.stroke())
    } else {
      ctx.fillStyle = 'rgba(42,23,18,.06)'
      for (let i = 0; i < 1500; i++) ctx.fillRect(r() * w, r() * h, 2, 2)
    }
    ctx.restore()
  },
})

const bg = (name: string, tags: string[], draw: Draw): Spec => ({ name, category: 'background', tags: ['бумага', ...tags], w: 1800, h: 1300, draw })

const SPECS: Spec[] = [
  bg('Крафт в точку', ['нейтральный', 'осень'], (ctx, w, h) => {
    ctx.fillStyle = '#E9D3B4'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(42,23,18,.18)'
    for (let y = 18; y < h; y += 36) for (let x = 18; x < w; x += 36) (ctx.beginPath(), ctx.arc(x, y, 4, 0, Math.PI * 2), ctx.fill())
  }),
  bg('Миллиметровка', ['нейтральный', 'школа'], (ctx, w, h) => {
    ctx.fillStyle = '#F6F1E7'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < w; i += 18) {
      ctx.fillStyle = i % 90 === 0 ? 'rgba(93,121,142,.45)' : 'rgba(93,121,142,.2)'
      ctx.fillRect(i, 0, i % 90 === 0 ? 2 : 1, h)
    }
    for (let j = 0; j < h; j += 18) {
      ctx.fillStyle = j % 90 === 0 ? 'rgba(93,121,142,.45)' : 'rgba(93,121,142,.2)'
      ctx.fillRect(0, j, w, j % 90 === 0 ? 2 : 1)
    }
  }),
  bg('Билетные полосы', ['ретро', 'праздник', 'день рождения'], (ctx, w, h) => {
    ctx.fillStyle = '#F6F1E7'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#D2694B'
    for (let x = 0; x < w; x += 84) ctx.fillRect(x, 0, 42, h)
  }),
  bg('Морская синь', ['море', 'лето'], (ctx, w, h) => {
    ctx.fillStyle = '#DCE4E8'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = 'rgba(93,121,142,.35)'
    ctx.lineWidth = 5
    for (let y = 40; y < h; y += 70) {
      ctx.beginPath()
      for (let x = 0; x <= w; x += 20) ctx.lineTo(x, y + Math.sin(x / 60 + y) * 10)
      ctx.stroke()
    }
  }),
  bg('Клетка', ['ретро', 'день рождения'], (ctx, w, h) => {
    ctx.fillStyle = '#FBE3D9'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(210,105,75,.55)'
    for (let y = 0; y < h; y += 100) for (let x = (y / 100) % 2 ? 50 : 0; x < w; x += 100) ctx.fillRect(x, y, 50, 50)
  }),
  bg('Льняной шалфей', ['ботаника', 'весна', 'нейтральный'], (ctx, w, h) => {
    ctx.fillStyle = '#C3CCAE'
    ctx.fillRect(0, 0, w, h)
    const r = rng(7)
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = r() < 0.5 ? 'rgba(255,253,248,.18)' : 'rgba(42,23,18,.07)'
      ctx.fillRect(r() * w, r() * h, r() < 0.5 ? 14 : 2, r() < 0.5 ? 2 : 14)
    }
  }),
  flower('Засушенный цветок', '#D2694B', '#E4B011', 6, ['осень', 'день рождения']),
  flower('Розовый бутон', '#EBA48D', '#D2694B', 7, ['весна', 'свадьба']),
  flower('Синий мак', '#5D798E', '#2A1712', 5, ['море', 'лето']),
  flower('Бархатцы', '#E4B011', '#A8472D', 9, ['осень', 'праздник']),
  flower('Ромашка', '#FFFDF8', '#E4B011', 12, ['весна', 'лето', 'свадьба']),
  scrap('Тетрадный лист', '#FFFDF8', ['школа', 'нейтральный'], 'ruled'),
  scrap('Клочок миллиметровки', '#F6F1E7', ['школа'], 'grid'),
  scrap('Крафтовый обрывок', '#C9A27A', ['осень', 'нейтральный'], 'none'),
  {
    name: 'Почтовая марка',
    category: 'cutout',
    tags: ['почта', 'ретро'],
    w: 420,
    h: 520,
    draw(ctx, w, h) {
      ctx.fillStyle = '#FFFDF8'
      ctx.fillRect(16, 16, w - 32, h - 32)
      ctx.globalCompositeOperation = 'destination-out'
      for (let x = 16; x <= w - 16; x += 32) for (const y of [16, h - 16]) (ctx.beginPath(), ctx.arc(x, y, 12, 0, Math.PI * 2), ctx.fill())
      for (let y = 16; y <= h - 16; y += 32) for (const x of [16, w - 16]) (ctx.beginPath(), ctx.arc(x, y, 12, 0, Math.PI * 2), ctx.fill())
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = '#D2694B'
      ctx.fillRect(56, 56, w - 112, h - 170)
      ctx.fillStyle = '#E4B011'
      ctx.beginPath()
      ctx.arc(w / 2, 200, 70, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = INK
      ctx.font = '600 34px "IBM Plex Mono"'
      ctx.textAlign = 'center'
      ctx.fillText('ПОЧТА · 25', w / 2, h - 72)
    },
  },
  {
    name: 'Васи-лента',
    category: 'sticker',
    tags: ['лента', 'нейтральный'],
    w: 640,
    h: 150,
    draw(ctx, w, h) {
      ctx.beginPath()
      ctx.moveTo(0, 10)
      for (let y = 10; y <= h - 10; y += 14) ctx.lineTo(y % 28 ? 10 : 0, y)
      ctx.lineTo(w, h - 10)
      for (let y = h - 10; y >= 10; y -= 14) ctx.lineTo(y % 28 ? w - 10 : w, y)
      ctx.closePath()
      ctx.save()
      ctx.clip()
      ctx.fillStyle = '#F3D46A'
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = '#E4B011'
      ctx.lineWidth = 16
      for (let x = -h; x < w + h; x += 34) (ctx.beginPath(), ctx.moveTo(x, h), ctx.lineTo(x + h, 0), ctx.stroke())
      ctx.restore()
    },
  },
  sticker('ура!', '#E4B011', ['праздник', 'день рождения']),
  sticker('привет!', '#F3D46A', ['привет'], 78),
  sticker('xo', '#D2694B', ['любовь', 'свадьба'], 120),
  sticker('спасибо', '#C3CCAE', ['спасибо'], 70),
  sticker('вау', '#A9BBC8', ['праздник', 'море']),
  sticker('♥', '#EBA48D', ['любовь', 'свадьба'], 150),
  {
    name: 'Пунктирная рамка',
    category: 'frame',
    tags: ['рамка', 'нейтральный'],
    w: 1748,
    h: 1240,
    draw(ctx, w, h) {
      ctx.strokeStyle = '#FFFDF8'
      ctx.lineWidth = 70
      ctx.strokeRect(0, 0, w, h)
      ctx.strokeStyle = INK
      ctx.lineWidth = 5
      ctx.setLineDash([22, 16])
      ctx.strokeRect(58, 58, w - 116, h - 116)
    },
  },
  {
    name: 'Фестончатая рамка',
    category: 'frame',
    tags: ['рамка', 'праздник', 'свадьба'],
    w: 1748,
    h: 1240,
    draw(ctx, w, h) {
      ctx.fillStyle = '#FFFDF8'
      const r = 34
      ctx.beginPath()
      ctx.rect(0, 0, w, h)
      ctx.fill()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.rect(90, 90, w - 180, h - 180)
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = '#FFFDF8'
      for (let x = 90 + r; x < w - 90; x += r * 2) for (const y of [90, h - 90]) (ctx.beginPath(), ctx.arc(x, y, r, 0, Math.PI * 2), ctx.fill())
      for (let y = 90 + r; y < h - 90; y += r * 2) for (const x of [90, w - 90]) (ctx.beginPath(), ctx.arc(x, y, r, 0, Math.PI * 2), ctx.fill())
    },
  },
]

export async function buildStarterKit(): Promise<Asset[]> {
  await Promise.all([document.fonts.load('700 80px Caveat'), document.fonts.load('600 30px "IBM Plex Mono"')]).catch(() => {})
  const now = Date.now()
  const out: Asset[] = []
  for (let i = 0; i < SPECS.length; i++) {
    const s = SPECS[i]
    const c = document.createElement('canvas')
    c.width = s.w
    c.height = s.h
    s.draw(c.getContext('2d')!, s.w, s.h)
    const opaque = s.category === 'background'
    const mime = opaque ? 'image/jpeg' : 'image/png'
    const blob = await canvasToBlob(c, mime, 0.9)
    out.push({
      id: nanoid(),
      name: s.name,
      category: s.category,
      tags: s.tags,
      colors: detectColors(c, s.w, s.h),
      blob,
      mime,
      width: s.w,
      height: s.h,
      createdAt: now - i,
      starter: true,
    })
  }
  return out
}
