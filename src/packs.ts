import { nanoid } from 'nanoid'
import type { Asset, AssetCategory } from './types'
import { detectColors } from './colors'

/**
 * Picture packs shipped in public/packs: public-domain / CC0 images plus the
 * owner's own cut-outs, already cut out and compressed at build time.
 * Sources and licenses for every file are listed in public/packs/SOURCES.md.
 */

export interface PackItem {
  file: string
  name: string
  category: AssetCategory
  tags: string[]
  width: number
  height: number
}

export interface Pack {
  id: string
  name: string
  items: PackItem[]
}

let manifest: Promise<Pack[]> | null = null

export function loadPacks(): Promise<Pack[]> {
  manifest ??= fetch(`${import.meta.env.BASE_URL}packs/manifest.json`)
    .then((r) => (r.ok ? r.json() : { packs: [] }))
    .then((j: { packs: Pack[] }) => j.packs)
    .catch(() => {
      manifest = null
      return []
    })
  return manifest
}

const mimeOf = (file: string) => (file.endsWith('.jpg') ? 'image/jpeg' : file.endsWith('.png') ? 'image/png' : 'image/webp')

/** Downloads every picture of the given packs and turns them into library assets. */
export async function buildPacks(packs: Pack[], onProgress?: (done: number, total: number) => void): Promise<Asset[]> {
  const items = packs.flatMap((p) => p.items.map((it) => ({ pack: p, it })))
  const now = Date.now()
  const out: Asset[] = []
  let done = 0
  // a few parallel downloads keep it quick without flooding the connection
  const queue = items.map((x, i) => ({ ...x, i }))
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const { pack, it, i } = job
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}packs/${pack.id}/${it.file}`)
        if (!res.ok) throw new Error(String(res.status))
        const blob = await res.blob()
        const bmp = await createImageBitmap(blob)
        const colors = detectColors(bmp, bmp.width, bmp.height)
        bmp.close()
        out.push({
          id: nanoid(),
          name: it.name,
          category: it.category,
          tags: it.tags,
          colors,
          blob,
          mime: blob.type || mimeOf(it.file),
          width: it.width,
          height: it.height,
          // keep the manifest order inside the library (newest first)
          createdAt: now - 1000 - i,
          starter: true,
          pack: pack.id,
        })
      } catch (e) {
        console.error('Не удалось загрузить элемент набора', it.file, e)
      }
      onProgress?.(++done, items.length)
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  return out
}
