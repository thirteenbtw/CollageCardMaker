export type AssetCategory = 'photo' | 'cutout' | 'sticker' | 'background' | 'frame'

export const CATEGORIES: AssetCategory[] = ['photo', 'cutout', 'sticker', 'background', 'frame']

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  photo: 'Фото',
  cutout: 'Вырезки',
  sticker: 'Стикеры',
  background: 'Фоны',
  frame: 'Рамки',
}

/** singular, for badges */
export const CATEGORY_KIND: Record<AssetCategory, string> = {
  photo: 'Фото',
  cutout: 'Вырезка',
  sticker: 'Стикер',
  background: 'Фон',
  frame: 'Рамка',
}

export interface Asset {
  id: string
  name: string
  category: AssetCategory
  tags: string[]
  /** named colour ids, see colors.ts */
  colors: string[]
  blob: Blob
  mime: string
  width: number
  height: number
  createdAt: number
  starter?: boolean
  /** untouched source image for re-cutting; `crop` is where `blob` sits inside it */
  original?: Blob
  crop?: { x: number; y: number; w: number; h: number }
}

interface BaseNode {
  id: string
  x: number
  y: number
  rotation: number
  scaleX: number
  scaleY: number
  opacity: number
  locked?: boolean
  shadow?: boolean
}

export interface ImageNode extends BaseNode {
  type: 'image'
  role?: 'background' | 'frame'
  assetId: string
  width: number
  height: number
  torn?: boolean
  /** washi tape colour id, see effects.ts */
  tape?: string | null
}

export interface TextNode extends BaseNode {
  type: 'text'
  text: string
  fontFamily: string
  fontSize: number
  fontStyle: string
  fill: string
  align: 'left' | 'center' | 'right'
  width: number
  letterSpacing?: number
  /** label-maker tape behind the text */
  bg?: string | null
  preset?: string
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
  createdAt: number
  updatedAt: number
  exported?: boolean
}
