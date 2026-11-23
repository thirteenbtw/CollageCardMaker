import { useCallback, useEffect, useRef, useState } from 'react'
import { useLibrary } from '../library'
import { useUI } from '../ui/store'
import { Icon, type IconName } from '../ui/Icon'
import { confirmDialog } from '../ui/common'
import type { Asset } from '../types'
import { applySelection, autoBackground, magicWand, polygonSelection, smartSegment, strokeSegment, fullRect, type Img, type Mask, type Rect, type SelectionOp, type SmartStroke } from './maskOps'
import { buildCut, saveCut } from './saveCut'

type Tool = 'brush' | 'lasso' | 'poly' | 'wand' | 'smart' | 'hand'
type View = 'result' | 'ghost' | 'mask'

const TOOLS: { id: Tool; label: string; short: string; key: string; icon: IconName; hint: string }[] = [
  { id: 'smart', label: 'Умная кисть', short: 'Умная', key: 'S', icon: 'smart', hint: 'Проведите по объекту зелёным, по фону красным (Alt или X). Маска пересчитается сама.' },
  { id: 'lasso', label: 'Лассо', short: 'Лассо', key: 'L', icon: 'lasso', hint: 'Обведите мышью то, что нужно оставить. Shift добавляет, Alt вычитает.' },
  { id: 'poly', label: 'Многоугольное лассо', short: 'Полигон', key: 'P', icon: 'polygon', hint: 'Кликайте по точкам контура. Замкните кликом по первой точке, двойным кликом или Enter. Backspace убирает точку, Esc отменяет.' },
  { id: 'wand', label: 'Волшебная палочка', short: 'Палочка', key: 'W', icon: 'wand', hint: 'Клик выделяет область похожего цвета. По умолчанию стирает её: удобно для фона.' },
  { id: 'brush', label: 'Кисть', short: 'Кисть', key: 'B', icon: 'brush', hint: 'Стирайте лишнее или возвращайте нужное. X переключает режим, [ и ] меняют размер.' },
  { id: 'hand', label: 'Рука', short: 'Рука', key: 'H', icon: 'hand', hint: 'Двигайте картинку. Пробел + мышь работает с любым инструментом, колесо мыши меняет масштаб.' },
]

const OPS: { id: SelectionOp; label: string }[] = [
  { id: 'keep', label: 'Оставить' },
  { id: 'add', label: 'Добавить' },
  { id: 'erase', label: 'Стереть' },
]

const HISTORY = 15

function copy(m: Mask) {
  return new Uint8ClampedArray(m)
}

async function decode(blob: Blob) {
  const bmp = await createImageBitmap(blob)
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0)
  bmp.close?.()
  return { canvas: c, ctx }
}

interface Loaded {
  img: Img
  original: HTMLCanvasElement
  originalBlob: Blob
  mask: Mask
}

async function loadAsset(asset: Asset): Promise<Loaded> {
  const originalBlob = asset.original ?? asset.blob
  const { canvas, ctx } = await decode(originalBlob)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const img: Img = { w: canvas.width, h: canvas.height, data }
  const mask = new Uint8ClampedArray(img.w * img.h)
  if (asset.original) {
    // the current cut-out lives inside the original at `crop`: its alpha is the starting mask
    const crop = asset.crop ?? { x: 0, y: 0, w: img.w, h: img.h }
    const cur = await decode(asset.blob)
    const m = document.createElement('canvas')
    m.width = img.w
    m.height = img.h
    const mctx = m.getContext('2d', { willReadFrequently: true })!
    mctx.drawImage(cur.canvas, crop.x, crop.y, crop.w, crop.h)
    const md = mctx.getImageData(0, 0, img.w, img.h).data
    for (let i = 0; i < mask.length; i++) mask[i] = md[i * 4 + 3]
  } else mask.fill(255)
  return { img, original: canvas, originalBlob, mask }
}

export function CutoutHost() {
  const id = useUI((s) => s.cutoutAssetId)
  const asset = useLibrary((s) => (id ? s.assets.find((a) => a.id === id) : undefined))
  if (!id || !asset) return null
  return <CutoutEditor key={id} asset={asset} />
}

function CutoutEditor({ asset }: { asset: Asset }) {
  const close = useUI((s) => s.closeCutout)
  const notify = useUI((s) => s.notify)
  const wrapRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<HTMLCanvasElement>(null)
  const data = useRef<Loaded | null>(null)
  const res = useRef<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; id: ImageData; tint: HTMLCanvasElement; tctx: CanvasRenderingContext2D; tid: ImageData } | null>(null)
  const xf = useRef({ s: 1, tx: 0, ty: 0 })
  const undoStack = useRef<Mask[]>([])
  const redoStack = useRef<Mask[]>([])
  const strokes = useRef<SmartStroke[]>([])
  const drag = useRef<null | { kind: 'pan' | 'brush' | 'lasso' | 'smart'; lx: number; ly: number; pts: [number, number][]; erase?: boolean; bg?: boolean; op?: SelectionOp }>(null)
  const poly = useRef<[number, number][]>([])
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const space = useRef(false)
  const raf = useRef(0)

  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [tool, setTool] = useState<Tool>('smart')
  const [view, setView] = useState<View>('ghost')
  const [brush, setBrush] = useState(40)
  const [hardness, setHardness] = useState(0.7)
  const [erase, setErase] = useState(true)
  const [smartBg, setSmartBg] = useState(false)
  const [op, setOp] = useState<SelectionOp>('keep')
  const [wandOp, setWandOp] = useState<SelectionOp>('erase')
  const [tolerance, setTolerance] = useState(32)
  const [contiguous, setContiguous] = useState(true)
  const [featherPx, setFeather] = useState(1)
  const [growPx, setGrow] = useState(0)
  const [zoomPct, setZoomPct] = useState(100)
  const [hist, setHist] = useState({ u: 0, r: 0 })
  const [smartCount, setSmartCount] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [polyLen, setPolyLen] = useState(0)

  // keep latest settings readable from imperative handlers
  const opts = useRef({ tool, view, brush, hardness, erase, smartBg, op, wandOp, tolerance, contiguous })
  opts.current = { tool, view, brush, hardness, erase, smartBg, op, wandOp, tolerance, contiguous }

  /* ---------- drawing ---------- */

  const draw = useCallback(() => {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      const cv = viewRef.current
      const d = data.current
      const r = res.current
      if (!cv || !d || !r) return
      const dpr = window.devicePixelRatio || 1
      const ctx = cv.getContext('2d')!
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, cv.width, cv.height)
      const { s, tx, ty } = xf.current
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * tx, dpr * ty)
      ctx.imageSmoothingEnabled = s < 2
      const v = opts.current.view
      if (v === 'mask') {
        ctx.drawImage(d.original, 0, 0)
        ctx.drawImage(r.tint, 0, 0)
      } else {
        if (v === 'ghost') {
          ctx.globalAlpha = 0.22
          ctx.drawImage(d.original, 0, 0)
          ctx.globalAlpha = 1
        }
        ctx.drawImage(r.canvas, 0, 0)
      }
      // image frame
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.strokeStyle = 'rgba(42,23,18,.35)'
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1
      ctx.strokeRect(tx - 0.5, ty - 0.5, d.img.w * s + 1, d.img.h * s + 1)
      ctx.setLineDash([])
      const toS = (p: [number, number]) => [p[0] * s + tx, p[1] * s + ty] as const
      // smart strokes
      for (const st of strokes.current) {
        ctx.strokeStyle = st.kind === 'fg' ? 'rgba(46,160,67,.75)' : 'rgba(210,60,40,.75)'
        ctx.lineWidth = Math.max(2, st.radius * 2 * s)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        st.pts.forEach((p, i) => {
          const [x, y] = toS(p)
          if (i) ctx.lineTo(x, y)
          else ctx.moveTo(x, y)
        })
        if (st.pts.length === 1) {
          const [x, y] = toS(st.pts[0])
          ctx.lineTo(x + 0.1, y)
        }
        ctx.stroke()
      }
      // lasso / polygon outline (marching ants style)
      const dr = drag.current
      const path: [number, number][] | null = dr && (dr.kind === 'lasso' || dr.kind === 'smart') ? dr.pts : poly.current.length ? [...poly.current] : null
      if (path && path.length) {
        const pts = path.map(toS)
        if (dr?.kind === 'smart') {
          ctx.strokeStyle = dr.bg ? 'rgba(210,60,40,.75)' : 'rgba(46,160,67,.75)'
          ctx.lineWidth = Math.max(2, opts.current.brush * 2 * s)
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.beginPath()
          pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
          ctx.stroke()
        } else {
          const live = !dr && pointer.current ? [pointer.current.x, pointer.current.y] : null
          for (const [color, dash] of [['#fffdf8', []], ['#2a1712', [5, 5]]] as const) {
            ctx.strokeStyle = color
            ctx.setLineDash([...dash])
            ctx.lineWidth = 1.5
            ctx.beginPath()
            pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
            if (live) ctx.lineTo(live[0], live[1])
            if (dr) ctx.closePath()
            ctx.stroke()
          }
          ctx.setLineDash([])
          if (!dr) {
            pts.forEach(([x, y], i) => {
              ctx.fillStyle = i === 0 ? '#d2694b' : '#fffdf8'
              ctx.strokeStyle = '#2a1712'
              ctx.beginPath()
              ctx.arc(x, y, i === 0 ? 5 : 3.5, 0, Math.PI * 2)
              ctx.fill()
              ctx.stroke()
            })
          }
        }
      }
      // brush cursor
      const t = opts.current.tool
      const pt = pointer.current
      if (pt && (t === 'brush' || t === 'smart') && !space.current) {
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, Math.max(1, opts.current.brush * s), 0, Math.PI * 2)
        ctx.strokeStyle = '#fffdf8'
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.strokeStyle = t === 'smart' ? (opts.current.smartBg ? '#c83c28' : '#2ea043') : opts.current.erase ? '#2a1712' : '#d2694b'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    })
  }, [])

  /** Recomputes result/tint pixels inside rect from mask. */
  const refresh = useCallback(
    (rect: Rect | null) => {
      const d = data.current
      const r = res.current
      if (!d || !r) return
      const { x0, y0, x1, y1 } = rect ?? fullRect(d.img)
      const w = d.img.w
      const src = d.img.data
      const out = r.id.data
      const tint = r.tid.data
      const m = d.mask
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const p = y * w + x
          out[p * 4 + 3] = (src[p * 4 + 3] * m[p]) / 255
          tint[p * 4 + 3] = ((255 - m[p]) * 0.55 * src[p * 4 + 3]) / 255
        }
      }
      if (x1 > x0 && y1 > y0) {
        r.ctx.putImageData(r.id, 0, 0, x0, y0, x1 - x0, y1 - y0)
        r.tctx.putImageData(r.tid, 0, 0, x0, y0, x1 - x0, y1 - y0)
      }
      draw()
    },
    [draw],
  )

  const fit = useCallback(() => {
    const wrap = wrapRef.current
    const d = data.current
    if (!wrap || !d) return
    const W = wrap.clientWidth
    const H = wrap.clientHeight
    const s = Math.min((W - 48) / d.img.w, (H - 48) / d.img.h, 4)
    xf.current = { s, tx: (W - d.img.w * s) / 2, ty: (H - d.img.h * s) / 2 }
    setZoomPct(Math.round(s * 100))
    draw()
  }, [draw])

  const zoomAt = useCallback(
    (k: number, cx?: number, cy?: number) => {
      const wrap = wrapRef.current
      if (!wrap) return
      const { s, tx, ty } = xf.current
      const ns = Math.min(16, Math.max(0.05, s * k))
      const px = cx ?? wrap.clientWidth / 2
      const py = cy ?? wrap.clientHeight / 2
      xf.current = { s: ns, tx: px - ((px - tx) * ns) / s, ty: py - ((py - ty) * ns) / s }
      setZoomPct(Math.round(ns * 100))
      draw()
    },
    [draw],
  )

  /* ---------- history ---------- */

  const pushUndo = useCallback(() => {
    const d = data.current
    if (!d) return
    undoStack.current.push(copy(d.mask))
    if (undoStack.current.length > HISTORY) undoStack.current.shift()
    redoStack.current = []
    setHist({ u: undoStack.current.length, r: 0 })
    setDirty(true)
  }, [])

  const restore = useCallback(
    (from: Mask[], to: Mask[]) => {
      const d = data.current
      const m = from.pop()
      if (!d || !m) return
      to.push(copy(d.mask))
      d.mask.set(m)
      setHist({ u: undoStack.current.length, r: redoStack.current.length })
      setDirty(true)
      refresh(null)
    },
    [refresh],
  )
  const undo = useCallback(() => restore(undoStack.current, redoStack.current), [restore])
  const redo = useCallback(() => restore(redoStack.current, undoStack.current), [restore])

  /* ---------- operations ---------- */

  const select = useCallback(
    (sel: Uint8ClampedArray, how: SelectionOp) => {
      const d = data.current
      if (!d) return
      pushUndo()
      applySelection(d.mask, sel, how)
      refresh(null)
    },
    [pushUndo, refresh],
  )

  const runSmart = useCallback(async () => {
    const d = data.current
    if (!d) return
    if (!strokes.current.some((s) => s.kind === 'fg')) {
      draw()
      return
    }
    setBusy('Считаю маску…')
    await new Promise((r) => setTimeout(r, 16))
    const m = smartSegment(d.img, strokes.current)
    setBusy(null)
    if (!m) return
    pushUndo()
    d.mask.set(m)
    refresh(null)
  }, [draw, pushUndo, refresh])

  const closePoly = useCallback(() => {
    const pts = poly.current
    poly.current = []
    setPolyLen(0)
    const d = data.current
    if (d && pts.length >= 3) select(polygonSelection(d.img, pts), opts.current.op)
    else draw()
  }, [draw, select])

  const autoBg = () => {
    const d = data.current
    if (!d) return
    const bg = autoBackground(d.img, 42)
    let share = 0
    for (let i = 0; i < bg.length; i++) if (bg[i] > 127) share++
    if (share / bg.length < 0.02) {
      notify('Не нашёл однотонный фон по краям. Попробуйте умную кисть.')
      return
    }
    select(bg, 'erase')
  }

  const invert = () => {
    const d = data.current
    if (!d) return
    pushUndo()
    for (let i = 0; i < d.mask.length; i++) d.mask[i] = 255 - d.mask[i]
    refresh(null)
  }

  const resetAll = () => {
    const d = data.current
    if (!d) return
    pushUndo()
    d.mask.fill(255)
    strokes.current = []
    setSmartCount(0)
    refresh(null)
  }

  const clearStrokes = () => {
    strokes.current = []
    setSmartCount(0)
    draw()
  }

  /* ---------- load ---------- */

  useEffect(() => {
    let alive = true
    loadAsset(asset)
      .then((d) => {
        if (!alive) return
        data.current = d
        const mk = () => {
          const c = document.createElement('canvas')
          c.width = d.img.w
          c.height = d.img.h
          return c
        }
        const canvas = mk()
        const ctx = canvas.getContext('2d')!
        const id = new ImageData(new Uint8ClampedArray(d.img.data), d.img.w, d.img.h)
        const tint = mk()
        const tctx = tint.getContext('2d')!
        const tid = new ImageData(d.img.w, d.img.h)
        for (let p = 0; p < d.img.w * d.img.h; p++) {
          tid.data[p * 4] = 226
          tid.data[p * 4 + 1] = 52
          tid.data[p * 4 + 2] = 38
        }
        res.current = { canvas, ctx, id, tint, tctx, tid }
        setReady(true)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [asset])

  useEffect(() => {
    if (!ready) return
    refresh(null)
    const wrap = wrapRef.current!
    const cv = viewRef.current!
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      cv.width = Math.round(wrap.clientWidth * dpr)
      cv.height = Math.round(wrap.clientHeight * dpr)
      cv.style.width = wrap.clientWidth + 'px'
      cv.style.height = wrap.clientHeight + 'px'
      draw()
    }
    resize()
    fit()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [ready, refresh, draw, fit])

  useEffect(() => {
    draw()
  }, [view, tool, brush, erase, smartBg, draw])

  /* ---------- pointer ---------- */

  const toImg = (e: { clientX: number; clientY: number }) => {
    const r = viewRef.current!.getBoundingClientRect()
    const sx = e.clientX - r.left
    const sy = e.clientY - r.top
    const { s, tx, ty } = xf.current
    return { sx, sy, x: (sx - tx) / s, y: (sy - ty) / s }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = data.current
    if (!d || busy) return
    const p = toImg(e)
    const t = opts.current.tool
    e.currentTarget.setPointerCapture(e.pointerId)
    if (e.button === 1 || space.current || t === 'hand') {
      drag.current = { kind: 'pan', lx: p.sx, ly: p.sy, pts: [] }
      return
    }
    if (e.button !== 0) return
    if (t === 'brush') {
      pushUndo()
      const er = e.altKey ? !opts.current.erase : opts.current.erase
      drag.current = { kind: 'brush', lx: p.x, ly: p.y, pts: [], erase: er }
      refresh(strokeSegment(d.mask, d.img, p.x, p.y, p.x, p.y, opts.current.brush, opts.current.hardness, er))
    } else if (t === 'lasso') {
      const how: SelectionOp = e.shiftKey ? 'add' : e.altKey ? 'erase' : opts.current.op
      drag.current = { kind: 'lasso', lx: p.x, ly: p.y, pts: [[p.x, p.y]], op: how }
    } else if (t === 'smart') {
      drag.current = { kind: 'smart', lx: p.x, ly: p.y, pts: [[p.x, p.y]], bg: e.altKey ? !opts.current.smartBg : opts.current.smartBg }
      draw()
    } else if (t === 'wand') {
      const how: SelectionOp = e.shiftKey ? 'add' : e.altKey ? 'keep' : opts.current.wandOp
      select(magicWand(d.img, p.x, p.y, opts.current.tolerance, opts.current.contiguous), how)
    } else if (t === 'poly') {
      const pts = poly.current
      if (pts.length >= 3) {
        const [fx, fy] = pts[0]
        const { s } = xf.current
        if (Math.hypot((fx - p.x) * s, (fy - p.y) * s) < 9) {
          closePoly()
          return
        }
      }
      pts.push([p.x, p.y])
      setPolyLen(pts.length)
      draw()
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = data.current
    if (!d) return
    const p = toImg(e)
    pointer.current = { x: p.sx, y: p.sy }
    const dr = drag.current
    if (!dr) {
      draw()
      return
    }
    if (dr.kind === 'pan') {
      xf.current.tx += p.sx - dr.lx
      xf.current.ty += p.sy - dr.ly
      dr.lx = p.sx
      dr.ly = p.sy
      draw()
    } else if (dr.kind === 'brush') {
      const rect = strokeSegment(d.mask, d.img, dr.lx, dr.ly, p.x, p.y, opts.current.brush, opts.current.hardness, !!dr.erase)
      dr.lx = p.x
      dr.ly = p.y
      refresh(rect)
    } else {
      const [lx, ly] = dr.pts[dr.pts.length - 1]
      if (Math.hypot(lx - p.x, ly - p.y) * xf.current.s > 2) dr.pts.push([p.x, p.y])
      draw()
    }
  }

  const onPointerUp = () => {
    const dr = drag.current
    drag.current = null
    const d = data.current
    if (!dr || !d) return
    if (dr.kind === 'lasso') {
      if (dr.pts.length >= 3) select(polygonSelection(d.img, dr.pts), dr.op ?? 'keep')
      else draw()
    } else if (dr.kind === 'smart') {
      strokes.current.push({ kind: dr.bg ? 'bg' : 'fg', radius: opts.current.brush, pts: dr.pts })
      setSmartCount(strokes.current.length)
      runSmart()
    } else draw()
  }

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      const r = viewRef.current!.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - r.left, e.clientY - r.top)
      else {
        xf.current.tx -= e.deltaX
        draw()
      }
    },
    [zoomAt, draw],
  )

  useEffect(() => {
    const cv = viewRef.current
    if (!cv || !ready) return
    cv.addEventListener('wheel', onWheel, { passive: false })
    return () => cv.removeEventListener('wheel', onWheel)
  }, [onWheel, ready])

  /* ---------- save / close ---------- */

  const tryClose = useCallback(async () => {
    if (busy) return
    if (dirty && !(await confirmDialog('Закрыть без сохранения?', 'Изменения вырезки пропадут.', 'Закрыть'))) return
    close()
  }, [busy, dirty, close])

  const save = async (asNew: boolean) => {
    const d = data.current
    if (!d || busy) return
    setBusy('Сохраняю…')
    try {
      const probe = await buildCut({ img: d.img, mask: d.mask, featherPx, growPx, originalBlob: d.originalBlob })
      if (probe.empty) {
        notify('Ничего не осталось: верните часть картинки')
        setBusy(null)
        return
      }
      await saveCut(asset, { img: d.img, mask: d.mask, featherPx, growPx, originalBlob: d.originalBlob }, asNew)
      notify(asNew ? 'Новая вырезка добавлена в библиотеку' : 'Вырезка сохранена')
      close()
    } catch {
      notify('Не получилось сохранить')
      setBusy(null)
    }
  }

  /* ---------- keyboard ---------- */

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' && (e.target as HTMLInputElement).type === 'text') return
      if (document.querySelector('.confirm-backdrop, [data-confirm]')) return
      const k = e.key.toLowerCase()
      const mod = e.ctrlKey || e.metaKey
      if (mod && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && k === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (mod && k === 'i') {
        e.preventDefault()
        invert()
        return
      }
      if (mod) return
      if (e.key === ' ') {
        if (!space.current) {
          space.current = true
          if (wrapRef.current) wrapRef.current.style.cursor = 'grab'
          draw()
        }
        e.preventDefault()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (poly.current.length) {
          poly.current = []
          setPolyLen(0)
          draw()
        } else tryClose()
        return
      }
      if (e.key === 'Enter' && poly.current.length) {
        e.preventDefault()
        closePoly()
        return
      }
      if (e.key === 'Backspace' && poly.current.length) {
        e.preventDefault()
        poly.current.pop()
        setPolyLen(poly.current.length)
        draw()
        return
      }
      if (e.key === '[') setBrush((b) => Math.max(2, Math.round(b / 1.2)))
      else if (e.key === ']') setBrush((b) => Math.min(400, Math.round(b * 1.2)))
      else if (k === 'x') {
        if (opts.current.tool === 'smart') setSmartBg((v) => !v)
        else setErase((v) => !v)
      } else {
        const t = TOOLS.find((t) => t.key.toLowerCase() === k)
        if (t) setTool(t.id)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        space.current = false
        if (wrapRef.current) wrapRef.current.style.cursor = ''
        draw()
      }
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up)
    }
  })

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
      cancelAnimationFrame(raf.current)
    }
  }, [])

  const info = TOOLS.find((t) => t.id === tool)!
  const cursor = tool === 'hand' ? 'grab' : tool === 'brush' || tool === 'smart' ? 'none' : 'crosshair'

  return (
    <div className="cut" role="dialog" aria-modal="true" aria-label="Ручная вырезка">
      <header className="cut-head">
        <div className="cut-title">
          <span className="mono">Вырезка</span>
          <b>{asset.name}</b>
        </div>
        <div className="row cut-hist">
          <button type="button" className="ib" aria-label="Отменить" title="Отменить (Ctrl+Z)" disabled={!hist.u} onClick={undo}>
            <Icon name="undo" />
          </button>
          <button type="button" className="ib" aria-label="Повторить" title="Повторить (Ctrl+Shift+Z)" disabled={!hist.r} onClick={redo}>
            <Icon name="redo" />
          </button>
        </div>
        <div className="seg cut-view" role="radiogroup" aria-label="Вид">
          {(
            [
              ['result', 'Результат'],
              ['ghost', 'С удалённым'],
              ['mask', 'Маска'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={view === id} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
          <button type="button" className="btn ghost" onClick={tryClose} disabled={!!busy}>
            Отмена
          </button>
          <button type="button" className="btn" onClick={() => save(true)} disabled={!ready || !!busy}>
            Сохранить как новую
          </button>
          <button type="button" className="btn primary" onClick={() => save(false)} disabled={!ready || !!busy}>
            <Icon name="check" size={18} /> Сохранить
          </button>
        </div>
      </header>

      <div className="cut-body">
        <nav className="cut-tools" aria-label="Инструменты">
          {TOOLS.map((t) => (
            <button key={t.id} type="button" className={'cut-tool' + (tool === t.id ? ' on' : '')} aria-pressed={tool === t.id} title={`${t.label} (${t.key})`} onClick={() => setTool(t.id)}>
              <Icon name={t.icon} size={22} />
              <span>{t.short}</span>
            </button>
          ))}
        </nav>

        <div className="cut-stage checker" ref={wrapRef} style={{ cursor: space.current ? 'grab' : cursor }}>
          <canvas
            ref={viewRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => {
              pointer.current = null
              draw()
            }}
            onDoubleClick={() => opts.current.tool === 'poly' && closePoly()}
            onContextMenu={(e) => e.preventDefault()}
          />
          {!ready && <div className="cut-msg">{failed ? 'Не удалось открыть картинку' : 'Открываю…'}</div>}
          {busy && <div className="cut-busy mono">{busy}</div>}
          <div className="cut-zoom">
            <button type="button" className="ib sm" aria-label="Уменьшить" onClick={() => zoomAt(1 / 1.25)}>
              −
            </button>
            <span className="mono">{zoomPct}%</span>
            <button type="button" className="ib sm" aria-label="Увеличить" onClick={() => zoomAt(1.25)}>
              +
            </button>
            <button type="button" className="btn sm ghost" onClick={fit}>
              Вписать
            </button>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => {
                zoomAt(1 / xf.current.s)
              }}
            >
              100%
            </button>
          </div>
        </div>

        <aside className="cut-side" aria-label="Настройки инструмента">
          <section>
            <span className="mono">{info.label}</span>
            <p className="cut-hint">{info.hint}</p>

            {tool === 'smart' && (
              <>
                <div className="seg" role="radiogroup" aria-label="Что отмечаем">
                  <button type="button" role="radio" aria-checked={!smartBg} onClick={() => setSmartBg(false)}>
                    <i className="cut-dot fg" /> Объект
                  </button>
                  <button type="button" role="radio" aria-checked={smartBg} onClick={() => setSmartBg(true)}>
                    <i className="cut-dot bg" /> Фон
                  </button>
                </div>
                <Range label="Толщина штриха" value={brush} min={2} max={200} unit="px" onChange={setBrush} />
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted" style={{ fontSize: 13 }}>
                    Штрихов: {smartCount}
                  </span>
                  <button type="button" className="btn sm ghost" disabled={!smartCount} onClick={clearStrokes}>
                    Очистить штрихи
                  </button>
                </div>
              </>
            )}

            {tool === 'brush' && (
              <>
                <div className="seg" role="radiogroup" aria-label="Режим кисти">
                  <button type="button" role="radio" aria-checked={erase} onClick={() => setErase(true)}>
                    Стереть
                  </button>
                  <button type="button" role="radio" aria-checked={!erase} onClick={() => setErase(false)}>
                    Вернуть
                  </button>
                </div>
                <Range label="Размер" value={brush} min={2} max={400} unit="px" onChange={setBrush} />
                <Range label="Жёсткость" value={Math.round(hardness * 100)} min={0} max={100} unit="%" onChange={(v) => setHardness(v / 100)} />
              </>
            )}

            {(tool === 'lasso' || tool === 'poly') && (
              <>
                <div className="lbl">Что сделать с выделением</div>
                <div className="seg" role="radiogroup" aria-label="Действие">
                  {OPS.map((o) => (
                    <button key={o.id} type="button" role="radio" aria-checked={op === o.id} onClick={() => setOp(o.id)}>
                      {o.label}
                    </button>
                  ))}
                </div>
                <p className="cut-hint small">
                  {op === 'keep' ? 'Всё вне контура будет удалено.' : op === 'add' ? 'Область внутри вернётся в вырезку.' : 'Область внутри будет удалена.'}
                </p>
                {tool === 'poly' && polyLen > 0 && (
                  <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn sm" disabled={polyLen < 3} onClick={closePoly}>
                      Замкнуть ({polyLen})
                    </button>
                    <button
                      type="button"
                      className="btn sm ghost"
                      onClick={() => {
                        poly.current = []
                        setPolyLen(0)
                        draw()
                      }}
                    >
                      Сбросить
                    </button>
                  </div>
                )}
              </>
            )}

            {tool === 'wand' && (
              <>
                <div className="seg" role="radiogroup" aria-label="Действие">
                  {OPS.map((o) => (
                    <button key={o.id} type="button" role="radio" aria-checked={wandOp === o.id} onClick={() => setWandOp(o.id)}>
                      {o.label}
                    </button>
                  ))}
                </div>
                <Range label="Допуск" value={tolerance} min={1} max={120} onChange={setTolerance} />
                <label className="row cut-check">
                  <input type="checkbox" checked={contiguous} onChange={(e) => setContiguous(e.target.checked)} /> Только смежные пиксели
                </label>
              </>
            )}
          </section>

          <section>
            <span className="mono">Быстрые действия</span>
            <button type="button" className="btn sm" onClick={autoBg} disabled={!ready || !!busy}>
              <Icon name="sparkle" size={16} /> Убрать фон автоматически
            </button>
            <div className="cut-pair">
              <button type="button" className="btn sm" onClick={invert} disabled={!ready} title="Ctrl+I">
                <Icon name="invert" size={16} /> Инвертировать
              </button>
              <button type="button" className="btn sm" onClick={resetAll} disabled={!ready}>
                <Icon name="undo" size={16} /> Вернуть всё
              </button>
            </div>
          </section>

          <section>
            <span className="mono">Край при сохранении</span>
            <Range label="Растушёвка" value={featherPx} min={0} max={12} unit="px" onChange={setFeather} />
            <Range label="Сдвиг края" value={growPx} min={-10} max={10} unit="px" onChange={setGrow} />
          </section>

          {!asset.original && asset.mime === 'image/png' && (
            <p className="cut-hint small">У этого файла нет исходника без прозрачности, поэтому «Вернуть» восстановит только то, что было в загруженном PNG.</p>
          )}
        </aside>
      </div>
    </div>
  )
}

function Range({ label, value, min, max, unit = '', onChange }: { label: string; value: number; min: number; max: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      <span>
        {label}
        <span className="mono">
          {value > 0 && min < 0 ? '+' : ''}
          {value}
          {unit}
        </span>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

