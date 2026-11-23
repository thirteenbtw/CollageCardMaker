export interface CanvasFormat {
  id: string
  label: string
  short: string
  spec: string
  width: number
  height: number
  /** physical size in mm for print formats */
  mm?: [number, number]
}

const px = (mm: number) => Math.round((mm / 25.4) * 300)

export const FORMATS: CanvasFormat[] = [
  { id: 'a6-h', label: 'A6 горизонтальная', short: 'A6', spec: '148 × 105 мм', width: px(148), height: px(105), mm: [148, 105] },
  { id: 'a6-v', label: 'A6 вертикальная', short: 'A6', spec: '105 × 148 мм', width: px(105), height: px(148), mm: [105, 148] },
  { id: 'a5-h', label: 'A5 горизонтальная', short: 'A5', spec: '210 × 148 мм', width: px(210), height: px(148), mm: [210, 148] },
  { id: 'euro', label: 'Евро 210 × 99', short: 'Евро', spec: '210 × 99 мм', width: px(210), height: px(99), mm: [210, 99] },
  { id: 'square', label: 'Квадратный пост', short: '1:1', spec: '1080 × 1080 px', width: 1080, height: 1080 },
  { id: 'post', label: 'Пост 4:5', short: '4:5', spec: '1080 × 1350 px', width: 1080, height: 1350 },
  { id: 'story', label: 'Сторис', short: '9:16', spec: '1080 × 1920 px', width: 1080, height: 1920 },
]

export const getFormat = (id: string) => FORMATS.find((f) => f.id === id) ?? FORMATS[0]

/** fonts available for text on cards — all of them support Cyrillic */
export const FONTS = ['Caveat', 'Marck Script', 'Amatic SC', 'Playfair Display', 'Onest', 'IBM Plex Mono']

export const INK = '#2A1712'
export const PAPER_COLORS = ['#F6F1E7', '#EFE6D4', '#E9D3B4', '#FBE3D9', '#F3D46A', '#C3CCAE', '#DCE4E8', '#FFFDF8', '#2A1712']
