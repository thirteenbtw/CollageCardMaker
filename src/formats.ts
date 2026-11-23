export interface CanvasFormat {
  id: string
  label: string
  width: number
  height: number
  /** physical size for PDF, mm; undefined → PDF in px */
  mm?: [number, number]
}

// 300 dpi for print formats
const mmToPx = (mm: number) => Math.round((mm / 25.4) * 300)

export const FORMATS: CanvasFormat[] = [
  { id: 'a6-h', label: 'Открытка A6 горизонтальная', width: mmToPx(148), height: mmToPx(105), mm: [148, 105] },
  { id: 'a6-v', label: 'Открытка A6 вертикальная', width: mmToPx(105), height: mmToPx(148), mm: [105, 148] },
  { id: 'a5-h', label: 'A5 горизонтальная', width: mmToPx(210), height: mmToPx(148), mm: [210, 148] },
  { id: 'square', label: 'Квадрат 1080×1080', width: 1080, height: 1080 },
  { id: 'post', label: 'Пост 1080×1350', width: 1080, height: 1350 },
  { id: 'story', label: 'Сторис 1080×1920', width: 1080, height: 1920 },
]

export const getFormat = (id: string) => FORMATS.find((f) => f.id === id) ?? FORMATS[0]

export const FONTS = ['Caveat', 'Amatic SC', 'Marck Script', 'Playfair Display', 'Rubik']
