import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { db } from './db'
import type { Asset, AssetCategory } from './types'
import { canvasToBlob, fileToCanvas, hasAlpha, removeBackground, trimTransparent } from './imageTools'
import { detectColors } from './colors'

/** object URLs and decoded images, keyed by asset id */
const urlCache = new Map<string, string>()
const imgCache = new Map<string, Promise<HTMLImageElement>>()

export function assetUrl(asset: Asset) {
  let url = urlCache.get(asset.id)
  if (!url) {
    url = URL.createObjectURL(asset.blob)
    urlCache.set(asset.id, url)
  }
  return url
}

export function loadAssetImage(asset: Asset): Promise<HTMLImageElement> {
  let p = imgCache.get(asset.id)
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = assetUrl(asset)
    })
    imgCache.set(asset.id, p)
  }
  return p
}

function forget(id: string) {
  const url = urlCache.get(id)
  if (url) URL.revokeObjectURL(url)
  urlCache.delete(id)
  imgCache.delete(id)
}

export const parseTags = (s: string) =>
  Array.from(new Set(s.split(/[,#;]+/).map((t) => t.trim().toLowerCase()).filter(Boolean)))

export interface UploadOptions {
  category: AssetCategory | 'auto'
  tags: string[]
  removeBg: boolean
}

export interface PendingUpload {
  id: string
  name: string
  progress: number
}

/** Turns a file into an Asset: decode, optional background removal, colour detection. */
export async function prepareAsset(file: File, opts: UploadOptions, extra: Partial<Asset> = {}): Promise<Asset> {
  let canvas = await fileToCanvas(file)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const alpha = hasAlpha(ctx, canvas.width, canvas.height)
  let category: AssetCategory
  if (opts.category !== 'auto') category = opts.category
  else if (alpha) category = Math.max(canvas.width, canvas.height) <= 700 ? 'sticker' : 'cutout'
  else category = 'photo'

  let transparent = alpha
  if (opts.removeBg && category === 'cutout' && !alpha) {
    const share = removeBackground(canvas)
    transparent = share > 0.02
  }
  if (transparent && (category === 'cutout' || category === 'sticker')) canvas = trimTransparent(canvas)

  const mime = transparent || file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const blob = await canvasToBlob(canvas, mime, 0.92)
  return {
    id: nanoid(),
    name: file.name.replace(/\.[^.]+$/, '').slice(0, 60),
    category,
    tags: opts.tags,
    colors: detectColors(canvas, canvas.width, canvas.height),
    blob,
    mime,
    width: canvas.width,
    height: canvas.height,
    createdAt: Date.now(),
    ...extra,
  }
}

interface LibraryState {
  assets: Asset[]
  loaded: boolean
  uploads: PendingUpload[]
  load: () => Promise<void>
  upload: (files: FileList | File[], opts: UploadOptions) => Promise<Asset[]>
  addAssets: (assets: Asset[]) => Promise<void>
  update: (id: string, patch: Partial<Pick<Asset, 'name' | 'category' | 'tags' | 'colors'>>) => Promise<void>
  replaceImage: (id: string, canvas: HTMLCanvasElement) => Promise<void>
  remove: (id: string) => Promise<void>
  byId: (id: string) => Asset | undefined
}

export const useLibrary = create<LibraryState>((set, get) => ({
  assets: [],
  loaded: false,
  uploads: [],
  async load() {
    if (get().loaded) return
    set({ assets: await db.allAssets(), loaded: true })
  },
  async upload(files, opts) {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/') && f.size <= 20 * 1024 * 1024)
    const pending = list.map((f) => ({ id: nanoid(), name: f.name, progress: 0 }))
    set({ uploads: [...get().uploads, ...pending] })
    const added: Asset[] = []
    for (let i = 0; i < list.length; i++) {
      const p = pending[i]
      const tick = (progress: number) => set({ uploads: get().uploads.map((u) => (u.id === p.id ? { ...u, progress } : u)) })
      try {
        tick(0.3)
        const asset = await prepareAsset(list[i], opts, { createdAt: Date.now() + i })
        tick(0.85)
        await db.putAsset(asset)
        added.push(asset)
        set({ assets: [asset, ...get().assets] })
      } catch (e) {
        console.error('Не удалось загрузить', list[i].name, e)
      } finally {
        set({ uploads: get().uploads.filter((u) => u.id !== p.id) })
      }
    }
    return added
  },
  async addAssets(assets) {
    for (const a of assets) await db.putAsset(a)
    set({ assets: [...assets, ...get().assets].sort((a, b) => b.createdAt - a.createdAt) })
  },
  async update(id, patch) {
    const a = get().assets.find((x) => x.id === id)
    if (!a) return
    const next = { ...a, ...patch }
    await db.putAsset(next)
    set({ assets: get().assets.map((x) => (x.id === id ? next : x)) })
  },
  async replaceImage(id, canvas) {
    const a = get().assets.find((x) => x.id === id)
    if (!a) return
    const blob = await canvasToBlob(canvas, 'image/png')
    const next: Asset = { ...a, blob, mime: 'image/png', width: canvas.width, height: canvas.height, colors: detectColors(canvas, canvas.width, canvas.height) }
    await db.putAsset(next)
    forget(id)
    set({ assets: get().assets.map((x) => (x.id === id ? next : x)) })
  },
  async remove(id) {
    await db.deleteAsset(id)
    forget(id)
    set({ assets: get().assets.filter((x) => x.id !== id) })
  },
  byId: (id) => get().assets.find((a) => a.id === id),
}))
