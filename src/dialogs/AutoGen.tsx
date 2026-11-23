import { useEffect, useMemo, useState } from 'react'
import { Modal, CloseButton, Burst } from '../ui/common'
import { Icon } from '../ui/Icon'
import { useUI } from '../ui/store'
import { useLibrary, assetUrl } from '../library'
import { autoLayout, OCCASIONS, STYLE_LABELS, type LayoutStyle } from '../autoLayout'
import { renderDoc } from '../render'
import { useEditor } from '../editor'
import { useDrafts } from '../drafts'
import { go } from '../router'
import { FORMATS, getFormat } from '../formats'
import { plural, pick } from '../util'
import type { Asset, CardDoc } from '../types'
import { StarterKitButton } from '../pages/Library'

const STYLES: LayoutStyle[] = ['scatter', 'hero', 'corners', 'frame']
const TILTS = ['-1.5deg', '1.2deg', '1deg', '-1.2deg']

interface Variant {
  doc: CardDoc
  img: string | null
}

export function AutoGenDialog() {
  const target = useUI((s) => s.autoGen?.target)
  const close = useUI((s) => s.closeAutoGen)
  if (!target) return null
  return <AutoGenInner target={target} close={close} />
}

function AutoGenInner({ target, close }: { target: 'new' | 'current'; close: () => void }) {
  const assets = useLibrary((s) => s.assets)
  const editorFormat = useEditor((s) => s.doc.formatId)
  const [formatId, setFormatId] = useState(target === 'current' ? editorFormat : 'a6-h')
  const [set, setSet] = useState<string | null>(null)
  const [withText, setWithText] = useState(true)
  const [occasion, setOccasion] = useState('День рождения')
  const [greeting, setGreeting] = useState('')
  const [withFrame, setWithFrame] = useState(false)
  const [round, setRound] = useState(1)
  const [picked, setPicked] = useState(0)
  const [variants, setVariants] = useState<Variant[]>([])
  const [greet, setGreet] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setGreet(greeting.trim()), 500)
    return () => clearTimeout(t)
  }, [greeting])

  const sets = useMemo(() => {
    const m = new Map<string, Asset[]>()
    assets.forEach((a) => a.tags.forEach((t) => m.set(t, [...(m.get(t) ?? []), a])))
    const tagSets = [...m.entries()]
      .filter(([, l]) => l.length >= 3 && l.some((a) => a.category !== 'background'))
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 8)
    return [{ id: null as string | null, label: 'Все элементы', items: assets }, ...tagSets.map(([t, l]) => ({ id: t as string | null, label: `#${t}`, items: l }))]
  }, [assets])
  const current = sets.find((s) => s.id === set) ?? sets[0]
  const usable = assets.filter((a) => a.category !== 'background' && a.category !== 'frame').length

  // re-generate whenever the ingredients change
  useEffect(() => {
    if (!usable) return
    let alive = true
    const phrases = OCCASIONS[occasion]
    const docs = STYLES.map((style, i) => {
      const text = withText ? greet || phrases[(i + round - 1) % phrases.length] : null
      return autoLayout(assets, formatId, { tag: set, text, style, withFrame })
    })
    setVariants(docs.map((doc) => ({ doc, img: null })))
    ;(async () => {
      for (let i = 0; i < docs.length; i++) {
        const img = await renderDoc(docs[i], { longSide: 560, mime: 'image/jpeg', quality: 0.85 })
        if (!alive) return
        setVariants((v) => v.map((x, j) => (j === i && x.doc === docs[i] ? { ...x, img } : x)))
      }
    })()
    return () => {
      alive = false
    }
  }, [assets, formatId, set, withText, occasion, withFrame, round, greet, usable])

  const open = async () => {
    const v = variants[picked]
    if (!v) return
    const doc = structuredClone(v.doc)
    // apply the latest greeting typed
    if (withText && greeting.trim()) {
      const t = doc.nodes.find((n) => n.type === 'text')
      if (t && t.type === 'text') t.text = greeting.trim()
    }
    if (target === 'current') {
      const ed = useEditor.getState()
      ed.apply(() => doc)
      ed.select(null)
    } else {
      const name = withText ? (greeting.trim() || occasion).slice(0, 40) : `Коллаж ${new Date().toLocaleDateString('ru-RU')}`
      const d = await useDrafts.getState().create(doc, name)
      useEditor.getState().open({ doc: d.doc, id: d.id, name: d.name, createdAt: d.createdAt, persisted: true })
      go(`/card/${d.id}`)
    }
    close()
  }

  const f = getFormat(formatId)
  return (
    <Modal onClose={close} width={1180} label="Собрать автоматически">
      <div className="tape mustard" />
      <div className="tape clay" style={{ right: 70, top: -12, width: 96, height: 26, transform: 'rotate(6deg)' }} />
      <header className="modal-head">
        <div>
          <h2>Собрать автоматически</h2>
          <p>Выберите ингредиенты — мы разложим четыре коллажа на выбор.</p>
        </div>
        <CloseButton onClick={close} />
      </header>
      {!usable ? (
        <div className="empty">
          <p>Для автосборки нужны фото, вырезки или стикеры в библиотеке.</p>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            <StarterKitButton className="btn primary" />
            <a className="btn" href="#/library" onClick={close}>
              Открыть библиотеку
            </a>
          </div>
        </div>
      ) : (
        <div className="ag-body">
          <form className="ag-form" onSubmit={(e) => e.preventDefault()}>
            <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <legend className="mono" style={{ padding: 0, marginBottom: 10 }}>
                1 · Набор элементов
              </legend>
              <div className="ag-sets" role="radiogroup" aria-label="Набор элементов">
                {sets.map((s) => {
                  const pics = s.items.filter((a) => a.category !== 'frame').slice(0, 2)
                  const photos = s.items.filter((a) => a.category === 'photo').length
                  const stickers = s.items.filter((a) => a.category === 'sticker').length
                  return (
                    <button key={s.id ?? 'all'} type="button" className="optcard" role="radio" aria-checked={set === s.id} onClick={() => setSet(s.id)}>
                      <span className="ag-thumbs" aria-hidden="true">
                        {pics.map((a) => (
                          <span key={a.id} style={{ backgroundImage: `url(${assetUrl(a)})` }} />
                        ))}
                      </span>
                      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontWeight: 500 }}>{s.label}</span>
                        <span className="mono" style={{ fontSize: 11 }}>
                          {s.items.length} {plural(s.items.length, 'элемент', 'элемента', 'элементов')}
                          {photos ? ` · ${photos} фото` : ''}
                          {stickers ? ` · ${stickers} ${plural(stickers, 'стикер', 'стикера', 'стикеров')}` : ''}
                        </span>
                      </span>
                      <span className="dot" />
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <label className="lbl">
              <span className="mono">2 · Формат</span>
              <select className="field" value={formatId} onChange={(e) => setFormatId(e.target.value)}>
                {FORMATS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label} · {x.spec}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span className="mono">3 · Текст поздравления</span>
              <div className="seg" role="radiogroup" aria-label="Текст на открытке">
                <button type="button" role="radio" aria-checked={withText} onClick={() => setWithText(true)}>
                  С текстом
                </button>
                <button type="button" role="radio" aria-checked={!withText} onClick={() => setWithText(false)}>
                  Без текста
                </button>
              </div>
            </div>

            {withText && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>Повод</span>
                  <div className="row wrap" style={{ gap: 6 }}>
                    {Object.keys(OCCASIONS).map((o) => (
                      <button key={o} type="button" className="chip sm" aria-pressed={occasion === o} onClick={() => setOccasion(o)}>
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="lbl">
                  <span className="row" style={{ justifyContent: 'space-between' }}>
                    Поздравление <span className="counter">{greeting.length} / 60</span>
                  </span>
                  <textarea
                    className="field"
                    rows={2}
                    maxLength={60}
                    value={greeting}
                    onChange={(e) => setGreeting(e.target.value)}
                    placeholder={pick(OCCASIONS[occasion])}
                    style={{ fontFamily: 'Caveat', fontWeight: 700, fontSize: 26, lineHeight: 1.1, boxShadow: '3px 3px 0 0 #2A1712' }}
                  />
                  <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>
                    Оставьте пустым — подберём фразу под повод.
                  </span>
                </label>
              </div>
            )}

            <label className="row" style={{ fontSize: 14 }}>
              <input type="checkbox" checked={withFrame} onChange={(e) => setWithFrame(e.target.checked)} /> Добавить рамку из библиотеки
            </label>

            <button type="button" className="btn lg" onClick={() => setRound((r) => r + 1)}>
              <Icon name="sparkle" size={20} /> Собрать ещё раз
            </button>
          </form>

          <div className="ag-variants">
            <div className="row wrap" style={{ justifyContent: 'space-between' }}>
              <span className="mono">4 · Выберите вариант · попытка {round}</span>
              <span className="muted" style={{ fontSize: 14 }}>
                Из <b style={{ color: '#2A1712' }}>{current.label}</b> · {f.short} · {withText ? 'с поздравлением' : 'без текста'}
              </span>
            </div>
            <div className="ag-grid" role="radiogroup" aria-label="Варианты">
              {variants.map((v, i) => (
                <button key={i} type="button" className="variant" role="radio" aria-checked={picked === i} onClick={() => setPicked(i)} onDoubleClick={open} style={{ transform: `rotate(${TILTS[i]})` }}>
                  <span className="pv" style={{ aspectRatio: `${f.width} / ${f.height}` }}>
                    {v.img ? <img src={v.img} alt={`Вариант ${i + 1}`} /> : <span className="spinner" />}
                  </span>
                  <span className="meta">
                    <span className="hand" style={{ fontSize: 24 }}>
                      Вариант {i + 1}
                    </span>
                    <span className="mono" style={{ fontSize: 11 }}>
                      {STYLE_LABELS[STYLES[i]]}
                    </span>
                  </span>
                  {picked === i && <Burst label="выбран!" />}
                </button>
              ))}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={close}>
                Отмена
              </button>
              <button type="button" className="btn primary lg" onClick={open} disabled={!variants[picked]}>
                {target === 'current' ? `Поставить вариант ${picked + 1} на открытку` : `Открыть вариант ${picked + 1} в редакторе`} <Icon name="next" />
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
