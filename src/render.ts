import Konva from 'konva'
import type { Asset, CardDoc, CardNode, ImageNode, TextNode } from './types'
import { getFormat } from './formats'
import { loadAssetImage, useLibrary } from './library'
import { colorized, imageSize, shadowDistance, shadowProps, tapeRect, textConfig, textLayout, tornPolygon } from './effects'

export function tornSceneFunc(points: number[]) {
  return (ctx: Konva.Context, shape: Konva.Shape) => {
    ctx.beginPath()
    ctx.moveTo(points[0], points[1])
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1])
    ctx.closePath()
    ctx.fillStrokeShape(shape)
  }
}

export function buildImage(node: ImageNode, source: HTMLImageElement, dist: number) {
  const img = colorized(source, node.assetId, node.color)
  const size = imageSize(img)
  // outer group: position + rotation; inner group: scale. The tape lives in the outer
  // group so a non-uniform scale never skews it.
  const g = new Konva.Group({ x: node.x, y: node.y, rotation: node.rotation, opacity: node.opacity })
  const inner = new Konva.Group({ scaleX: node.scaleX, scaleY: node.scaleY, offsetX: node.width / 2, offsetY: node.height / 2 })
  g.add(inner)
  const sh = shadowProps(node, dist, node.scaleX, node.scaleY)
  if (node.torn) {
    inner.add(
      new Konva.Shape({
        width: node.width,
        height: node.height,
        sceneFunc: tornSceneFunc(tornPolygon(node.id, node.width, node.height, node.tornOpts)),
        fillPatternImage: img as HTMLImageElement,
        fillPatternRepeat: 'no-repeat',
        fillPatternScaleX: node.width / size.w,
        fillPatternScaleY: node.height / size.h,
        ...sh,
      }),
    )
  } else inner.add(new Konva.Image({ image: img, width: node.width, height: node.height, ...sh }))
  if (node.tape) g.add(new Konva.Rect(tapeRect(node)))
  return g
}

export function buildText(node: TextNode, dist: number) {
  const L = textLayout(node)
  const g = new Konva.Group({
    x: node.x,
    y: node.y,
    rotation: node.rotation,
    scaleX: node.scaleX,
    scaleY: node.scaleY,
    opacity: node.opacity,
    offsetX: L.offsetX,
    offsetY: L.offsetY,
  })
  const sh = shadowProps(node, dist, node.scaleX, node.scaleY)
  if (node.bg) g.add(new Konva.Rect({ ...L.rect, fill: node.bg, ...sh }))
  g.add(new Konva.Text({ ...textConfig(node), ...(node.bg ? {} : sh) }))
  return g
}

async function preload(doc: CardDoc) {
  const lib = useLibrary.getState()
  const imgs = new Map<string, HTMLImageElement>()
  await Promise.all(
    doc.nodes.map(async (n) => {
      if (n.type === 'image') {
        const a = lib.byId(n.assetId)
        if (a) imgs.set(a.id, await loadAssetImage(a).catch(() => null as unknown as HTMLImageElement))
      } else await document.fonts.load(`${n.fontStyle === 'normal' ? '' : n.fontStyle} 40px "${n.fontFamily}"`).catch(() => {})
    }),
  )
  return imgs
}

export interface RenderOptions {
  /** output size of the long side, px (without bleed) */
  longSide?: number
  transparent?: boolean
  bleedMm?: number
}

/** Renders a card into a canvas, independent of the editor. */
export async function renderDocToCanvas(doc: CardDoc, opts: RenderOptions = {}) {
  const f = getFormat(doc.formatId)
  const imgs = await preload(doc)
  const bleed = opts.bleedMm && f.mm ? (opts.bleedMm * f.width) / f.mm[0] : 0
  const W = f.width + bleed * 2
  const H = f.height + bleed * 2
  const container = document.createElement('div')
  const stage = new Konva.Stage({ container, width: W, height: H })
  const layer = new Konva.Layer()
  stage.add(layer)
  if (!opts.transparent) layer.add(new Konva.Rect({ x: 0, y: 0, width: W, height: H, fill: doc.background }))
  const root = new Konva.Group({ x: bleed, y: bleed })
  layer.add(root)
  const dist = shadowDistance(doc)
  for (const n of doc.nodes) {
    let node: CardNode = n
    if (n.type === 'image') {
      if (opts.transparent && n.role === 'background') continue
      const img = imgs.get(n.assetId)
      if (!img) continue
      // stretch background / frame into the bleed area
      if (bleed && n.role) {
        const k = n.role === 'frame' ? [W / f.width, H / f.height] : [Math.max(W / f.width, H / f.height), Math.max(W / f.width, H / f.height)]
        node = { ...n, scaleX: n.scaleX * k[0], scaleY: n.scaleY * k[1] }
      }
      root.add(buildImage(node as ImageNode, img, dist))
    } else root.add(buildText(n, dist))
  }
  const ratio = (opts.longSide ?? Math.max(f.width, f.height)) / Math.max(f.width, f.height)
  const canvas = stage.toCanvas({ pixelRatio: ratio })
  stage.destroy()
  return canvas
}

export async function renderDoc(doc: CardDoc, opts: RenderOptions & { mime?: 'image/png' | 'image/jpeg'; quality?: number } = {}) {
  const c = await renderDocToCanvas(doc, opts)
  return c.toDataURL(opts.mime ?? 'image/png', opts.quality ?? 0.92)
}

export const thumbnail = (doc: CardDoc) => renderDoc(doc, { longSide: 640, mime: 'image/jpeg', quality: 0.85 })

export function assetsUsed(doc: CardDoc, assets: Asset[]) {
  const ids = new Set(doc.nodes.flatMap((n) => (n.type === 'image' ? [n.assetId] : [])))
  return assets.filter((a) => ids.has(a.id))
}
