import { openDB, type DBSchema } from 'idb'
import type { Asset, Draft } from './types'

interface CardDB extends DBSchema {
  assets: { key: string; value: Asset; indexes: { byCategory: string } }
  drafts: { key: string; value: Draft }
  meta: { key: string; value: unknown }
}

const dbPromise = openDB<CardDB>('card-generator', 2, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      const assets = db.createObjectStore('assets', { keyPath: 'id' })
      assets.createIndex('byCategory', 'category')
      db.createObjectStore('drafts', { keyPath: 'id' })
    }
    if (oldVersion < 2) db.createObjectStore('meta')
  },
})

// records written by the first MVP lack some fields
const normAsset = (a: Asset): Asset => ({ ...a, colors: a.colors ?? [], mime: a.mime ?? a.blob.type, tags: a.tags ?? [] })
const normDraft = (d: Draft): Draft => ({ ...d, createdAt: d.createdAt ?? d.updatedAt })

export const db = {
  async allAssets() {
    const list = await (await dbPromise).getAll('assets')
    return list.map(normAsset).sort((a, b) => b.createdAt - a.createdAt)
  },
  async putAsset(a: Asset) {
    await (await dbPromise).put('assets', a)
  },
  async deleteAsset(id: string) {
    await (await dbPromise).delete('assets', id)
  },
  async allDrafts() {
    const list = await (await dbPromise).getAll('drafts')
    return list.map(normDraft).sort((a, b) => b.updatedAt - a.updatedAt)
  },
  async getDraft(id: string) {
    const d = await (await dbPromise).get('drafts', id)
    return d ? normDraft(d) : undefined
  },
  async putDraft(d: Draft) {
    await (await dbPromise).put('drafts', d)
  },
  async deleteDraft(id: string) {
    await (await dbPromise).delete('drafts', id)
  },
  async getMeta<T>(key: string) {
    return (await (await dbPromise).get('meta', key)) as T | undefined
  },
  async setMeta(key: string, value: unknown) {
    await (await dbPromise).put('meta', value, key)
  },
}
