export type AssetCategory = 'background' | 'cutout' | 'sticker' | 'frame'

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  background: 'Фоны',
  cutout: 'Вырезки',
  sticker: 'Стикеры',
  frame: 'Рамки',
}

export const CATEGORIES: AssetCategory[] = ['background', 'cutout', 'sticker', 'frame']

export interface Asset {
  id: string
  name: string
  category: AssetCategory
  tags: string[]
  blob: Blob
  width: number
  height: number
  createdAt: number
}

interface BaseNode {
  id: string
  x: number
  y: number
  rotation: number
  scaleX: number
  scaleY: number
  opacity: number
}

export interface ImageNode extends BaseNode {
  type: 'image'
  role?: 'background' | 'frame'
  assetId: string
  width: number
  height: number
}

export interface TextNode extends BaseNode {
  type: 'text'
  text: string
  fontFamily: string
  fontSize: number
  fill: string
  align: 'left' | 'center' | 'right'
  width: number
  fontStyle: string
}

export type CardNode = ImageNode | TextNode

export interface CardDoc {
  formatId: string
  background: string
  nodes: CardNode[]
}

export interface Draft {
  id: string
  name: string
  doc: CardDoc
  thumbnail: string
  updatedAt: number
}
