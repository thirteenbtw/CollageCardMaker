import { openDB, type DBSchema } from 'idb'
import type { Asset, Draft } from './types'

interface CardDB extends DBSchema {
  assets: { key: string; value: Asset; indexes: { byCategory: string } }
  drafts: { key: string; value: Draft }
}

const dbPromise = openDB<CardDB>('card-generator', 1, {
  upgrade(db) {
    const assets = db.createObjectStore('assets', { keyPath: 'id' })
    assets.createIndex('byCategory', 'category')
    db.createObjectStore('drafts', { keyPath: 'id' })
  },
})

export const db = {
  async allAssets() {
    const list = await (await dbPromise).getAll('assets')
    return list.sort((a, b) => b.createdAt - a.createdAt)
  },
  async putAsset(a: Asset) {
    await (await dbPromise).put('assets', a)
  },
  async deleteAsset(id: string) {
    await (await dbPromise).delete('assets', id)
  },
  async allDrafts() {
    const list = await (await dbPromise).getAll('drafts')
    return list.sort((a, b) => b.updatedAt - a.updatedAt)
  },
  async putDraft(d: Draft) {
    await (await dbPromise).put('drafts', d)
  },
  async deleteDraft(id: string) {
    await (await dbPromise).delete('drafts', id)
  },
}
