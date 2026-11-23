import { nanoid } from 'nanoid'
import { db } from '../db'
import { useLibrary } from '../library'
import { useEditor } from '../editor'
import { useDrafts } from '../drafts'
import { canvasToBlob, trimTransparent, type CropRect } from '../imageTools'
import { detectColors } from '../colors'
import type { Asset, CardDoc, ImageNode } from '../types'
import { feather, grow, type Img, type Mask } from './maskOps'

/** Re-positions card elements that use an asset whose crop inside the original changed. */
function remapDoc(doc: CardDoc, assetId: string, from: CropRect, to: CropRect): CardDoc | null {
  let changed = false
  const nodes = doc.nodes.map((n) => {
    if (n.type !== 'image' || n.assetId !== assetId) return n
    changed = true
    // shift of the crop centre, in original-image pixels
    const dx = to.x + to.w / 2 - (from.x + from.w / 2)
    const dy = to.y + to.h / 2 - (from.y + from.h / 2)
    const a = (n.rotation * Math.PI) / 180
    const sx = dx * n.scaleX
    const sy = dy * n.scaleY
    // scale stays in original pixels when the node was sized to the old crop
    const kx = n.width ? from.w / n.width : 1
    const ky = n.height ? from.h / n.height : 1
    const next: ImageNode = {
      ...n,
      width: to.w,
      height: to.h,
      scaleX: n.scaleX / kx,
      scaleY: n.scaleY / ky,
      x: n.x + (sx * Math.cos(a) - sy * Math.sin(a)) / kx,
      y: n.y + (sx * Math.sin(a) + sy * Math.cos(a)) / ky,
    }
    return next
  })
  return changed ? { ...doc, nodes } : null
}

export interface CutResult {
  img: Img
  mask: Mask
  featherPx: number
  growPx: number
  originalBlob: Blob
}

/** Builds the transparent cut-out from the original image and the mask. */
export async function buildCut(r: CutResult) {
  const { img } = r
  let m = grow(r.mask, img.w, img.h, r.growPx)
  m = feather(m, img.w, img.h, r.featherPx)
  const out = new ImageData(img.w, img.h)
  const d = out.data
  for (let p = 0; p < img.w * img.h; p++) {
    d[p * 4] = img.data[p * 4]
    d[p * 4 + 1] = img.data[p * 4 + 1]
    d[p * 4 + 2] = img.data[p * 4 + 2]
    d[p * 4 + 3] = (img.data[p * 4 + 3] * m[p]) / 255
  }
  const c = document.createElement('canvas')
  c.width = img.w
  c.height = img.h
  c.getContext('2d')!.putImageData(out, 0, 0)
  const t = trimTransparent(c)
  const empty = !m.some((v) => v > 16)
  return { canvas: t.canvas, crop: t.rect, empty }
}

export async function saveCut(asset: Asset, r: CutResult, asNew: boolean) {
  const { canvas, crop, empty } = await buildCut(r)
  if (empty) throw new Error('empty')
  const blob = await canvasToBlob(canvas, 'image/png')
  const colors = detectColors(canvas, canvas.width, canvas.height)
  const lib = useLibrary.getState()
  if (asNew) {
    const a: Asset = {
      id: nanoid(),
      name: `${asset.name} — вырезка`.slice(0, 60),
      category: 'cutout',
      tags: asset.tags,
      colors,
      blob,
      mime: 'image/png',
      width: canvas.width,
      height: canvas.height,
      createdAt: Date.now(),
      original: r.originalBlob,
      crop,
    }
    await lib.addAssets([a])
    return a
  }
  const oldCrop = asset.crop ?? { x: 0, y: 0, w: asset.width, h: asset.height }
  await lib.replaceAsset({ ...asset, blob, mime: 'image/png', width: canvas.width, height: canvas.height, colors, original: r.originalBlob, crop })

  // keep elements already placed on cards in the same spot
  const ed = useEditor.getState()
  const fix = (doc: CardDoc) => remapDoc(doc, asset.id, oldCrop, crop) ?? doc
  if (remapDoc(ed.doc, asset.id, oldCrop, crop)) useEditor.setState({ saveState: 'dirty', doc: fix(ed.doc), past: ed.past.map(fix), future: ed.future.map(fix) })
  const drafts = useDrafts.getState()
  for (const d of drafts.drafts) {
    if (d.id === ed.draftId) continue
    const doc = remapDoc(d.doc, asset.id, oldCrop, crop)
    if (doc) await db.putDraft({ ...d, doc })
  }
  await drafts.load()
  return useLibrary.getState().byId(asset.id)!
}
