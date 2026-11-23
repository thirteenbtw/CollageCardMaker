import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { db } from './db'
import type { Asset, AssetCategory } from './types'

const MAX_SIDE = 2400

/** object URLs and decoded images, keyed by asset id */
const urlCache = new Map<string, string>()
const imgCache = new Map<string, HTMLImageElement>()

export function assetUrl(asset: Asset) {
  let url = urlCache.get(asset.id)
  if (!url) {
    url = URL.createObjectURL(asset.blob)
    urlCache.set(asset.id, url)
  }
  return url
}

export function loadAssetImage(asset: Asset): Promise<HTMLImageElement> {
  const cached = imgCache.get(asset.id)
  if (cached?.complete) return Promise.resolve(cached)
  return new Promise((resolve, reject) => {
    const img = cached ?? new Image()
    imgCache.set(asset.id, img)
    img.onload = () => resolve(img)
    img.onerror = reject
    if (!img.src) img.src = assetUrl(asset)
  })
}

async function decode(file: Blob) {
  const bmp = await createImageBitmap(file)
  return bmp
}

/** Shrinks huge photos so the editor stays fast; keeps transparency for png/webp/gif. */
async function prepareFile(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await decode(file)
  const { width, height } = bmp
  const k = Math.min(1, MAX_SIDE / Math.max(width, height))
  if (k === 1) {
    bmp.close()
    return { blob: file, width, height }
  }
  const w = Math.round(width * k)
  const h = Math.round(height * k)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
  const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), type, 0.92))
  return { blob, width: w, height: h }
}

export const parseTags = (s: string) =>
  Array.from(new Set(s.split(/[,#;]+/).map((t) => t.trim().toLowerCase()).filter(Boolean)))

interface LibraryState {
  assets: Asset[]
  loaded: boolean
  load: () => Promise<void>
  upload: (files: FileList | File[], category: AssetCategory, tags: string[]) => Promise<void>
  update: (id: string, patch: Partial<Pick<Asset, 'name' | 'category' | 'tags'>>) => Promise<void>
  remove: (id: string) => Promise<void>
  byId: (id: string) => Asset | undefined
}

export const useLibrary = create<LibraryState>((set, get) => ({
  assets: [],
  loaded: false,
  async load() {
    set({ assets: await db.allAssets(), loaded: true })
  },
  async upload(files, category, tags) {
    const added: Asset[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      try {
        const { blob, width, height } = await prepareFile(file)
        const asset: Asset = {
          id: nanoid(),
          name: file.name.replace(/\.[^.]+$/, ''),
          category,
          tags,
          blob,
          width,
          height,
          createdAt: Date.now() + added.length,
        }
        await db.putAsset(asset)
        added.push(asset)
      } catch (e) {
        console.error('Не удалось загрузить', file.name, e)
      }
    }
    set({ assets: [...added.reverse(), ...get().assets] })
  },
  async update(id, patch) {
    const a = get().assets.find((x) => x.id === id)
    if (!a) return
    const next = { ...a, ...patch }
    await db.putAsset(next)
    set({ assets: get().assets.map((x) => (x.id === id ? next : x)) })
  },
  async remove(id) {
    await db.deleteAsset(id)
    const url = urlCache.get(id)
    if (url) URL.revokeObjectURL(url)
    urlCache.delete(id)
    imgCache.delete(id)
    set({ assets: get().assets.filter((x) => x.id !== id) })
  },
  byId: (id) => get().assets.find((a) => a.id === id),
}))
