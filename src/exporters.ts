import type Konva from 'konva'
import type { CanvasFormat } from './formats'

/** Renders the stage at the card's real resolution with the selection hidden. */
export function renderCard(stage: Konva.Stage, format: CanvasFormat, mime: 'image/png' | 'image/jpeg', maxSide?: number) {
  const tr = stage.findOne('Transformer')
  const wasVisible = tr?.visible()
  tr?.visible(false)
  const displayScale = stage.scaleX()
  let ratio = 1 / displayScale
  if (maxSide) ratio = Math.min(ratio, maxSide / (Math.max(format.width, format.height) * displayScale))
  const url = stage.toDataURL({
    mimeType: mime,
    quality: 0.93,
    pixelRatio: ratio,
    x: 0,
    y: 0,
    width: format.width * displayScale,
    height: format.height * displayScale,
  })
  tr?.visible(wasVisible ?? true)
  return url
}

function download(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'открытка'

export async function exportCard(stage: Konva.Stage, format: CanvasFormat, kind: 'png' | 'jpg' | 'pdf', name: string) {
  const base = safe(name)
  if (kind === 'png') return download(renderCard(stage, format, 'image/png'), `${base}.png`)
  if (kind === 'jpg') return download(renderCard(stage, format, 'image/jpeg'), `${base}.jpg`)

  const { jsPDF } = await import('jspdf')
  const img = renderCard(stage, format, 'image/jpeg')
  const landscape = format.width >= format.height
  const [w, h] = format.mm ?? [format.width, format.height]
  const pdf = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: format.mm ? 'mm' : 'px',
    format: [w, h],
    hotfixes: ['px_scaling'],
  })
  pdf.addImage(img, 'JPEG', 0, 0, w, h)
  pdf.save(`${base}.pdf`)
}
