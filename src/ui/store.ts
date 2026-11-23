import { create } from 'zustand'
import type { CardDoc } from '../types'

export interface ExportTarget {
  draftId: string
  name: string
  doc: CardDoc
}

interface UIState {
  autoGen: null | { target: 'new' | 'current' }
  exportTarget: ExportTarget | null
  toast: { id: number; text: string } | null
  cutoutAssetId: string | null
  openCutout: (assetId: string) => void
  closeCutout: () => void
  openAutoGen: (target: 'new' | 'current') => void
  closeAutoGen: () => void
  openExport: (t: ExportTarget) => void
  closeExport: () => void
  notify: (text: string) => void
}

export const useUI = create<UIState>((set) => ({
  autoGen: null,
  exportTarget: null,
  toast: null,
  cutoutAssetId: null,
  openCutout: (assetId) => set({ cutoutAssetId: assetId }),
  closeCutout: () => set({ cutoutAssetId: null }),
  openAutoGen: (target) => set({ autoGen: { target } }),
  closeAutoGen: () => set({ autoGen: null }),
  openExport: (t) => set({ exportTarget: t }),
  closeExport: () => set({ exportTarget: null }),
  notify: (text) => {
    const id = Date.now()
    set({ toast: { id, text } })
    setTimeout(() => set((s) => (s.toast?.id === id ? { toast: null } : s)), 2600)
  },
}))
