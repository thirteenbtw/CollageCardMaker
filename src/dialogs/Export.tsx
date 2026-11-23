import { useEffect, useMemo, useState } from 'react'
import { Modal, CloseButton, TAPE_CLASSES } from '../ui/common'
import { Icon } from '../ui/Icon'
import { useUI, type ExportTarget } from '../ui/store'
import { getFormat } from '../formats'
import { renderDoc, renderDocToCanvas } from '../render'
import { markDraftExported } from '../drafts'
import { download, slug } from '../util'
import { canvasToBlob } from '../imageTools'

type Fmt = 'png' | 'jpg' | 'pdf'
type Size = 'screen' | 'print' | 'bleed' | 'small'

const HINTS: Record<Fmt, string> = {
  png: 'Без потерь качества — для соцсетей и печати.',
  jpg: 'Файл поменьше — для мессенджеров и почты.',
  pdf: 'Точный физический размер — можно нести в типографию.',
}
const BLEED_MM = 3

export function ExportDialog() {
  const t = useUI((s) => s.exportTarget)
  const close = useUI((s) => s.closeExport)
  if (!t) return null
  return <ExportInner t={t} close={close} />
}

function ExportInner({ t, close }: { t: ExportTarget; close: () => void }) {
  const notify = useUI((s) => s.notify)
  const f = getFormat(t.doc.formatId)
  const print = !!f.mm
  const [fmt, setFmt] = useState<Fmt>('png')
  const [size, setSize] = useState<Size>(print ? 'print' : 'screen')
  const [transparent, setTransparent] = useState(false)
  const [quality, setQuality] = useState(90)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    renderDoc(t.doc, { longSide: 700, mime: 'image/png', transparent }).then(setPreview)
  }, [t.doc, transparent])

  const long = Math.max(f.width, f.height)
  const sizes = useMemo(() => {
    const dims = (k: number, extra = 0) => `${Math.round((f.width + extra) * k)} × ${Math.round((f.height + extra) * k)} px`
    const bleedPx = print ? ((BLEED_MM * f.width) / f.mm![0]) * 2 : 0
    const list: { id: Size; label: string; spec: string; dims: string; long: number }[] = []
    if (print) {
      list.push({ id: 'screen', label: 'Для экрана', spec: '1600 px по длинной стороне', dims: dims(1600 / long), long: 1600 })
      list.push({ id: 'print', label: 'Печать · 300 dpi', spec: f.spec, dims: dims(1) + ' · 300 dpi', long })
      list.push({ id: 'bleed', label: 'Печать с вылетами', spec: `+${BLEED_MM} мм с каждой стороны`, dims: dims(1, bleedPx) + ' · 300 dpi', long })
    } else {
      list.push({ id: 'screen', label: 'Оригинал', spec: `${f.width} × ${f.height} px`, dims: dims(1), long })
      list.push({ id: 'small', label: 'Лёгкий файл', spec: 'вдвое меньше', dims: dims(0.5), long: long / 2 })
    }
    return list
  }, [f, long, print])
  const cur = sizes.find((s) => s.id === size) ?? sizes[0]
  const ext = fmt
  const fileName = `${slug(t.name)}.${ext}`

  const render = (mime: 'image/png' | 'image/jpeg') =>
    renderDocToCanvas(t.doc, { longSide: cur.long, transparent: mime === 'image/png' && transparent, bleedMm: size === 'bleed' ? BLEED_MM : 0 })

  const doDownload = async () => {
    setBusy(true)
    try {
      if (fmt === 'pdf') {
        const { jsPDF } = await import('jspdf')
        const c = await render('image/jpeg')
        const bleed = size === 'bleed' ? BLEED_MM * 2 : 0
        const [w, h] = f.mm ? [f.mm[0] + bleed, f.mm[1] + bleed] : [c.width, c.height]
        const pdf = new jsPDF({ orientation: w >= h ? 'landscape' : 'portrait', unit: f.mm ? 'mm' : 'px', format: [w, h], hotfixes: ['px_scaling'] })
        pdf.addImage(c.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, w, h)
        pdf.setProperties({ title: t.name })
        pdf.save(fileName)
      } else {
        const mime = fmt === 'png' ? 'image/png' : 'image/jpeg'
        const c = await render(mime)
        const blob = await canvasToBlob(c, mime, quality / 100)
        const url = URL.createObjectURL(blob)
        download(url, fileName)
        setTimeout(() => URL.revokeObjectURL(url), 4000)
      }
      await markDraftExported(t.draftId)
      notify(`Файл ${fileName} скачан`)
      close()
    } catch (e) {
      console.error(e)
      notify('Не получилось сохранить файл')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try {
      const c = await renderDocToCanvas(t.doc, { longSide: Math.min(cur.long, 2000), transparent })
      const blob = await canvasToBlob(c, 'image/png')
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      notify('Картинка скопирована — вставьте её в мессенджер')
    } catch {
      notify('Браузер не дал скопировать картинку')
    }
  }

  const canShare = typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
  const share = async () => {
    const c = await renderDocToCanvas(t.doc, { longSide: Math.min(cur.long, 2000) })
    const file = new File([await canvasToBlob(c, 'image/jpeg', 0.9)], `${slug(t.name)}.jpg`, { type: 'image/jpeg' })
    if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: t.name }).catch(() => {})
    else notify('Это устройство не умеет делиться файлами')
  }

  return (
    <Modal onClose={close} width={940} label="Скачать открытку">
      <div className="ex-wrap">
        <div className="ex-preview">
          <div className="pol">
            <div className={'tape ' + TAPE_CLASSES[0]} style={{ transform: 'rotate(4deg)' }} />
            <div className={transparent && fmt === 'png' ? 'checker' : ''} style={{ position: 'relative', border: '1px solid rgba(42,23,18,.25)', borderRadius: 4, overflow: 'hidden', aspectRatio: `${f.width} / ${f.height}`, background: transparent ? undefined : '#EFE6D4' }}>
              {preview && <img src={preview} alt="Превью" style={{ display: 'block', width: '100%' }} />}
              {size === 'bleed' && <span className="bleed-mark" style={{ inset: '3%' }} aria-hidden="true" />}
            </div>
            <div className="row" style={{ justifyContent: 'space-between', padding: '10px 2px 12px' }}>
              <span className="hand" style={{ fontSize: 24, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.name}
              </span>
              <span className="mono" style={{ fontSize: 11 }}>
                {f.short}
              </span>
            </div>
          </div>
          <span className="mono" style={{ textAlign: 'center' }}>
            {fileName} · {cur.dims}
          </span>
        </div>
        <div className="ex-form">
          <header className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h2 className="hand" style={{ margin: 0, fontSize: 46, lineHeight: 1, color: '#A8472D' }}>
              Скачать открытку
            </h2>
            <CloseButton onClick={close} />
          </header>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="mono">Формат файла</span>
            <div className="seg" role="radiogroup" aria-label="Формат файла">
              {(['png', 'jpg', 'pdf'] as Fmt[]).map((x) => (
                <button key={x} type="button" role="radio" aria-checked={fmt === x} onClick={() => setFmt(x)} style={{ fontWeight: 700 }}>
                  {x.toUpperCase()}
                </button>
              ))}
            </div>
            <span className="muted" style={{ fontSize: 13 }}>
              {HINTS[fmt]}
            </span>
          </div>
          <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <legend className="mono" style={{ padding: 0, marginBottom: 8 }}>
              Размер
            </legend>
            <div role="radiogroup" aria-label="Размер" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sizes.map((s) => (
                <button key={s.id} type="button" className="optcard" role="radio" aria-checked={size === s.id} onClick={() => setSize(s.id)}>
                  <span className="dot" />
                  <span style={{ flex: 1, fontWeight: 500 }}>{s.label}</span>
                  <span className="mono" style={{ textTransform: 'none' }}>
                    {s.spec}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
          {fmt === 'png' && (
            <label className="row" style={{ fontSize: 15 }}>
              <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Прозрачный фон (без бумаги и фоновой картинки)
            </label>
          )}
          {fmt === 'jpg' && (
            <label className="slider">
              <span>
                Качество <span className="mono">{quality}%</span>
              </span>
              <input type="range" min={50} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
            </label>
          )}
          <div className="ex-box">
            <span className="row" style={{ fontWeight: 700 }}>
              <Icon name="link" /> Поделиться сразу
            </span>
            <div className="row wrap">
              <button type="button" className="btn sm" onClick={copy}>
                <Icon name="copy" size={16} /> Скопировать картинку
              </button>
              {canShare && (
                <button type="button" className="btn sm" onClick={share}>
                  <Icon name="next" size={16} /> Отправить…
                </button>
              )}
            </div>
            <span className="muted" style={{ fontSize: 13 }}>
              Картинка попадёт в буфер обмена — её можно вставить в чат или письмо.
            </span>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={close}>
              Отмена
            </button>
            <button type="button" className="btn primary lg" onClick={doDownload} disabled={busy} style={{ minWidth: 200 }}>
              <Icon name="download" /> {busy ? 'Готовлю…' : `Скачать ${fmt.toUpperCase()}`}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
