import { useEffect, useRef, useState } from 'react'
import { useEditor, nodeLabel } from '../editor'
import { useLibrary, assetUrl } from '../library'
import { FONTS, FORMATS, PAPER_COLORS, getFormat } from '../formats'
import { COLOR_DEFAULT, isNeutralColor, SHADOW_DEFAULT, TAPE_DEFAULT, TAPES, TORN_DEFAULT } from '../effects'
import { Icon } from '../ui/Icon'
import { useUI } from '../ui/store'
import { CATEGORY_KIND, type CardNode, type ColorOpts, type ImageNode, type ShadowOpts, type TapeOpts, type TextNode, type TornOpts } from '../types'
import { reshuffle } from '../autoLayout'

/** slider with live preview; one history step per drag */
function Slider({ label, value, min, max, step = 1, unit = '', onLive, onDone }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onLive: (v: number) => void; onDone: () => void }) {
  return (
    <label className="slider">
      <span>
        {label} <span className="mono">{Math.round(value * 10) / 10 + unit}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onLive(Number(e.target.value))} onPointerUp={onDone} onKeyUp={onDone} onBlur={onDone} />
    </label>
  )
}

export function kindOf(n: CardNode) {
  if (n.type === 'text') return 'Текст'
  if (n.role === 'background') return 'Фон'
  if (n.role === 'frame') return 'Рамка'
  const a = useLibrary.getState().byId(n.assetId)
  return a ? CATEGORY_KIND[a.category] : 'Элемент'
}

export function useNodeName(n: CardNode | undefined) {
  const asset = useLibrary((s) => (n?.type === 'image' ? s.assets.find((a) => a.id === n.assetId) : undefined))
  return n ? nodeLabel(n, asset?.name) : ''
}

function Layers() {
  const nodes = useEditor((s) => s.doc.nodes)
  const selectedId = useEditor((s) => s.selectedId)
  const select = useEditor((s) => s.select)
  const assets = useLibrary((s) => s.assets)
  const list = [...nodes].reverse()
  if (!list.length) return <p className="muted" style={{ margin: 0, fontSize: 14 }}>На открытке пока пусто.</p>
  return (
    <ol className="layers">
      {list.map((n, i) => {
        const a = n.type === 'image' ? assets.find((x) => x.id === n.assetId) : undefined
        return (
          <li key={n.id}>
            <button type="button" aria-current={selectedId === n.id} onClick={() => select(n.id)}>
              <span className="n">{list.length - i}</span>
              <span className="th" style={a ? { backgroundImage: `url(${assetUrl(a)})` } : undefined}>
                {n.type === 'text' ? 'Т' : ''}
              </span>
              <span className="lbl">{nodeLabel(n, a?.name)}</span>
              {n.locked && <Icon name="lock" size={14} />}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function CardProps() {
  const doc = useEditor((s) => s.doc)
  const { setFormat, setBackground, apply } = useEditor()
  const openAutoGen = useUI((s) => s.openAutoGen)
  const assets = useLibrary((s) => s.assets)
  const f = getFormat(doc.formatId)
  const loose = doc.nodes.filter((n) => n.type === 'image' && !n.role && !n.locked).length
  return (
    <>
      <div className="prop-head">
        <span className="mono">Открытка</span>
        <span className="title">{f.label}</span>
        <span className="mono">{f.spec}</span>
      </div>
      <section className="prop">
        <h3>Формат</h3>
        <select className="field" value={doc.formatId} onChange={(e) => setFormat(e.target.value)} aria-label="Формат">
          {FORMATS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label} · {x.spec}
            </option>
          ))}
        </select>
      </section>
      <section className="prop">
        <h3>Цвет бумаги</h3>
        <div className="paper-row">
          {PAPER_COLORS.map((c) => (
            <button key={c} type="button" className="paper" style={{ background: c }} aria-pressed={doc.background.toLowerCase() === c.toLowerCase()} aria-label={`Цвет ${c}`} onClick={() => setBackground(c)} />
          ))}
          <input type="color" value={doc.background} onChange={(e) => setBackground(e.target.value)} aria-label="Свой цвет" style={{ width: 32, height: 32 }} />
        </div>
      </section>
      <section className="prop">
        <h3>Автоматически</h3>
        <button type="button" className="btn" onClick={() => openAutoGen('current')}>
          <Icon name="sparkle" /> Собрать коллаж
        </button>
        <button type="button" className="btn" disabled={loose < 2} onClick={() => apply((d) => reshuffle(d, assets))}>
          <Icon name="shuffle" /> Перемешать элементы
        </button>
      </section>
      <section className="prop">
        <h3>Слои</h3>
        <Layers />
      </section>
    </>
  )
}

function TextProps({ node }: { node: TextNode }) {
  const updateNode = useEditor((s) => s.updateNode)
  const ta = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(node.text)
  useEffect(() => setText(node.text), [node.text, node.id])
  useEffect(() => {
    const f = () => {
      ta.current?.focus()
      ta.current?.select()
    }
    window.addEventListener('focus-text-editor', f)
    return () => window.removeEventListener('focus-text-editor', f)
  }, [])
  const set = (p: Partial<TextNode>) => updateNode(node.id, p as Partial<CardNode>)
  const bold = node.fontStyle.includes('bold')
  const italic = node.fontStyle.includes('italic')
  const style = (b: boolean, i: boolean) => [i && 'italic', b && 'bold'].filter(Boolean).join(' ') || 'normal'
  return (
    <section className="prop">
      <h3>Текст</h3>
      <textarea
        ref={ta}
        className="field"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== node.text && set({ text })}
        style={{ fontFamily: node.fontFamily, fontSize: 18 }}
        aria-label="Текст"
      />
      <select className="field" value={node.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })} aria-label="Шрифт" style={{ fontFamily: node.fontFamily }}>
        {FONTS.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      <div className="toggle-row">
        <input type="color" value={node.fill} onChange={(e) => set({ fill: e.target.value })} aria-label="Цвет текста" title="Цвет текста" />
        <button type="button" className={'ib' + (bold ? ' on' : '')} aria-pressed={bold} aria-label="Жирный" onClick={() => set({ fontStyle: style(!bold, italic) })}>
          <b>Ж</b>
        </button>
        <button type="button" className={'ib' + (italic ? ' on' : '')} aria-pressed={italic} aria-label="Курсив" onClick={() => set({ fontStyle: style(bold, !italic) })}>
          <i>К</i>
        </button>
        {(['left', 'center', 'right'] as const).map((a) => (
          <button key={a} type="button" className={'ib' + (node.align === a ? ' on' : '')} aria-pressed={node.align === a} aria-label={a === 'left' ? 'Влево' : a === 'center' ? 'По центру' : 'Вправо'} onClick={() => set({ align: a })}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d={a === 'left' ? 'M4 6h16M4 12h10M4 18h13' : a === 'center' ? 'M4 6h16M7 12h10M5.5 18h13' : 'M4 6h16M10 12h10M7 18h13'} />
            </svg>
          </button>
        ))}
      </div>
    </section>
  )
}

function SizeSlider({ node }: { node: CardNode }) {
  const { livePatch, commitLive } = useEditor()
  const f = getFormat(useEditor((s) => s.doc.formatId))
  if (node.type === 'text')
    return <Slider label="Размер шрифта" value={Math.round(node.fontSize)} min={10} max={Math.round(Math.min(f.width, f.height) * 0.4)} onLive={(v) => livePatch(node.id, { fontSize: v } as Partial<CardNode>)} onDone={commitLive} />
  const pct = Math.round(((node.width * Math.abs(node.scaleX)) / f.width) * 100)
  return (
    <Slider
      label="Размер"
      unit="%"
      value={pct}
      min={4}
      max={160}
      onLive={(v) => {
        const k = ((v / 100) * f.width) / node.width
        const ratio = Math.abs(node.scaleY / node.scaleX)
        livePatch(node.id, { scaleX: Math.sign(node.scaleX) * k, scaleY: Math.sign(node.scaleY) * k * ratio })
      }}
      onDone={commitLive}
    />
  )
}

const TINTS = ['#D2694B', '#E4B011', '#5D798E', '#8A9A6B', '#C98AA0', '#2A1712']

const COLOR_PRESETS: { label: string; c: Partial<ColorOpts> }[] = [
  { label: 'Ч/Б', c: { grayscale: true, contrast: 10 } },
  { label: 'Сепия', c: { grayscale: true, tint: '#C9A27A', tintAmount: 0.7 } },
  { label: 'Выцветший', c: { saturation: -45, contrast: -20, brightness: 6 } },
  { label: 'Яркий', c: { saturation: 45, contrast: 12 } },
  { label: 'Дуотон', c: { grayscale: true, contrast: 20, brightness: 15, tint: '#D2694B', tintAmount: 1 } },
]

/** slider + live preview of a nested options object */
function useOpts<T extends object>(node: CardNode, key: string, defaults: T) {
  const { livePatch, commitLive, updateNode } = useEditor()
  const cur = { ...defaults, ...((node as unknown as Record<string, unknown>)[key] as Partial<T> | undefined) } as T
  return {
    cur,
    live: (patch: Partial<T>) => livePatch(node.id, { [key]: { ...cur, ...patch } } as Partial<CardNode>),
    set: (patch: Partial<T> | null) => updateNode(node.id, { [key]: patch === null ? undefined : { ...cur, ...patch } } as Partial<CardNode>),
    done: commitLive,
  }
}

function ShadowSettings({ node }: { node: CardNode }) {
  const o = useOpts<ShadowOpts>(node, 'shadowOpts', SHADOW_DEFAULT)
  return (
    <div className="fx-sub">
      <Slider label="Сдвиг" value={o.cur.dist} min={0} max={4} step={0.1} unit="×" onLive={(v) => o.live({ dist: v })} onDone={o.done} />
      <Slider label="Направление" value={o.cur.angle} min={0} max={359} unit="°" onLive={(v) => o.live({ angle: v })} onDone={o.done} />
      <Slider label="Размытие" value={o.cur.blur} min={0} max={8} step={0.1} unit="×" onLive={(v) => o.live({ blur: v })} onDone={o.done} />
      <Slider label="Плотность" value={Math.round(o.cur.opacity * 100)} min={5} max={100} unit="%" onLive={(v) => o.live({ opacity: v / 100 })} onDone={o.done} />
      <div className="row fx-colors">
        <span>Цвет</span>
        {['#2A1712', '#6B5448', '#D2694B', '#5D798E'].map((c) => (
          <button key={c} type="button" className="dot-sw" aria-label={c} aria-pressed={o.cur.color.toLowerCase() === c.toLowerCase()} style={{ background: c }} onClick={() => o.set({ color: c })} />
        ))}
        <input type="color" value={o.cur.color} onChange={(e) => o.live({ color: e.target.value })} onBlur={o.done} aria-label="Свой цвет тени" />
        <button type="button" className="btn sm ghost" onClick={() => o.set(null)}>
          Сбросить
        </button>
      </div>
    </div>
  )
}

function TornSettings({ node }: { node: ImageNode }) {
  const o = useOpts<TornOpts>(node, 'tornOpts', TORN_DEFAULT)
  return (
    <div className="fx-sub">
      <Slider label="Глубина рваного края" value={Math.round(o.cur.depth * 1000) / 10} min={0.5} max={10} step={0.5} unit="%" onLive={(v) => o.live({ depth: v / 100 })} onDone={o.done} />
      <Slider label="Размер зубцов" value={Math.round(o.cur.step * 1000) / 10} min={0.5} max={8} step={0.5} unit="%" onLive={(v) => o.live({ step: v / 100 })} onDone={o.done} />
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn sm" onClick={() => o.set({ seed: o.cur.seed + 1 })}>
          <Icon name="shuffle" size={16} /> Другой узор
        </button>
        <button type="button" className="btn sm ghost" onClick={() => o.set(null)}>
          Сбросить
        </button>
      </div>
    </div>
  )
}

function TapeSettings({ node }: { node: ImageNode }) {
  const updateNode = useEditor((s) => s.updateNode)
  const o = useOpts<TapeOpts>(node, 'tapeOpts', TAPE_DEFAULT)
  return (
    <div className="fx-sub">
      <div className="tapes" role="radiogroup" aria-label="Цвет ленты">
        {TAPES.map((t) => (
          <button
            key={t.id}
            type="button"
            className="tape-sw"
            role="radio"
            aria-checked={node.tape === t.id}
            aria-label={t.label}
            title={t.label}
            style={{ ['--a' as string]: t.a, ['--b' as string]: t.b }}
            onClick={() => updateNode(node.id, { tape: t.id } as Partial<CardNode>)}
          />
        ))}
      </div>
      <p className="fx-note">Ленту можно перетащить мышью прямо на открытке.</p>
      <Slider label="Наклон ленты" value={Math.round(o.cur.rotation)} min={-90} max={90} unit="°" onLive={(v) => o.live({ rotation: v })} onDone={o.done} />
      <Slider label="Длина ленты" value={Math.round(o.cur.len * 100)} min={30} max={220} unit="%" onLive={(v) => o.live({ len: v / 100 })} onDone={o.done} />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="chip sm" onClick={() => o.set({ x: 0.5, y: 0.03, rotation: -7 })}>
          Сверху
        </button>
        <button type="button" className="chip sm" onClick={() => o.set({ x: 0.1, y: 0.07, rotation: -40 })}>
          На угол
        </button>
        <button type="button" className="chip sm" onClick={() => o.set({ x: 0.5, y: 0.97, rotation: 4 })}>
          Снизу
        </button>
        <button type="button" className="btn sm ghost" onClick={() => o.set(null)}>
          Вернуть на место
        </button>
      </div>
    </div>
  )
}

function ColorSettings({ node }: { node: ImageNode }) {
  const o = useOpts<ColorOpts>(node, 'color', COLOR_DEFAULT)
  const c = o.cur
  return (
    <section className="prop">
      <h3>Цвет</h3>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {COLOR_PRESETS.map((p) => (
          <button key={p.label} type="button" className="chip sm" onClick={() => o.set({ ...COLOR_DEFAULT, ...p.c })}>
            {p.label}
          </button>
        ))}
      </div>
      <Slider label="Оттенок" value={c.hue} min={-180} max={180} unit="°" onLive={(v) => o.live({ hue: v })} onDone={o.done} />
      <Slider label="Насыщенность" value={c.saturation} min={-100} max={100} onLive={(v) => o.live({ saturation: v })} onDone={o.done} />
      <Slider label="Яркость" value={c.brightness} min={-80} max={80} onLive={(v) => o.live({ brightness: v })} onDone={o.done} />
      <Slider label="Контраст" value={c.contrast} min={-80} max={80} onLive={(v) => o.live({ contrast: v })} onDone={o.done} />
      <div className="fx">
        <span className="txt">Чёрно-белое</span>
        <button type="button" className="switch" role="switch" aria-checked={c.grayscale} aria-label="Чёрно-белое" onClick={() => o.set({ grayscale: !c.grayscale })} />
      </div>
      <div className="row fx-colors">
        <span>Тон</span>
        <button type="button" className="dot-sw none" aria-label="Без тона" aria-pressed={!c.tint} onClick={() => o.set({ tint: null })} />
        {TINTS.map((t) => (
          <button key={t} type="button" className="dot-sw" aria-label={t} aria-pressed={c.tint?.toLowerCase() === t.toLowerCase()} style={{ background: t }} onClick={() => o.set({ tint: t })} />
        ))}
        <input type="color" value={c.tint ?? '#D2694B'} onChange={(e) => o.live({ tint: e.target.value })} onBlur={o.done} aria-label="Свой цвет тона" />
      </div>
      {c.tint && <Slider label="Сила тона" value={Math.round(c.tintAmount * 100)} min={5} max={100} unit="%" onLive={(v) => o.live({ tintAmount: v / 100 })} onDone={o.done} />}
      {!isNeutralColor(node.color) && (
        <button type="button" className="btn sm ghost" onClick={() => o.set(null)}>
          Сбросить цвет
        </button>
      )}
    </section>
  )
}

function Effects({ node }: { node: CardNode }) {
  const updateNode = useEditor((s) => s.updateNode)
  const rows: [string, string, string, string, boolean, () => void, React.ReactNode][] = [
    ['Тень', 'Сдвиг, размытие, цвет', '#EFE6D4', '▢', !!node.shadow, () => updateNode(node.id, { shadow: !node.shadow }), <ShadowSettings key="s" node={node} />],
  ]
  if (node.type === 'image') {
    rows.push(['Рваный край', 'Как вырванный лист', '#FBE3D9', '≈', !!node.torn, () => updateNode(node.id, { torn: !node.torn } as Partial<CardNode>), <TornSettings key="t" node={node} />])
    rows.push(['Васи-лента', 'Тяните её мышью', '#F3D46A', '▭', !!node.tape, () => updateNode(node.id, { tape: node.tape ? null : 'mustard' } as Partial<CardNode>), <TapeSettings key="p" node={node} />])
  } else {
    rows.push([
      'Лента-наклейка',
      'Плашка под текстом',
      '#F3D46A',
      '▭',
      !!node.bg,
      () => updateNode(node.id, { bg: node.bg ? null : '#2A1712', fill: node.bg ? '#2A1712' : '#FFFDF8' } as Partial<CardNode>),
      node.type === 'text' && node.bg ? (
        <div className="row fx-sub">
          <span style={{ fontSize: 14 }}>Цвет плашки</span>
          <input type="color" value={node.bg} onChange={(e) => updateNode(node.id, { bg: e.target.value } as Partial<CardNode>)} aria-label="Цвет плашки" />
        </div>
      ) : null,
    ])
  }
  return (
    <section className="prop">
      <h3>Эффекты</h3>
      {rows.map(([label, hint, bg, glyph, on, toggle, settings]) => (
        <div key={label} className="fx-block">
          <div className="fx">
            <span className="glyph" aria-hidden="true" style={{ background: bg }}>
              {glyph}
            </span>
            <span className="txt">
              {label}
              <small>{hint}</small>
            </span>
            <button type="button" className="switch" role="switch" aria-checked={on} aria-label={label} onClick={toggle} />
          </div>
          {on && settings}
        </div>
      ))}
    </section>
  )
}

function NodeProps({ node }: { node: CardNode }) {
  const { updateNode, livePatch, commitLive, reorder } = useEditor()
  const name = useNodeName(node)
  const r = Math.round(node.rotation)
  return (
    <>
      <div className="prop-head">
        <span className="mono">{kindOf(node)}</span>
        <span className="title">{name}</span>
      </div>
      {node.type === 'text' && <TextProps node={node} />}
      <section className="prop">
        <h3>Положение</h3>
        <Slider label="Поворот" unit="°" value={r} min={-180} max={180} onLive={(v) => livePatch(node.id, { rotation: v })} onDone={commitLive} />
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => updateNode(node.id, { rotation: Math.max(-180, r - 15) })}>
            ↺ 15°
          </button>
          <button type="button" className="btn" onClick={() => updateNode(node.id, { rotation: 0 })}>
            Выпрямить
          </button>
          <button type="button" className="btn" onClick={() => updateNode(node.id, { rotation: Math.min(180, r + 15) })}>
            ↻ 15°
          </button>
        </div>
        <SizeSlider node={node} />
        <Slider label="Прозрачность" unit="%" value={Math.round(node.opacity * 100)} min={5} max={100} onLive={(v) => livePatch(node.id, { opacity: v / 100 })} onDone={commitLive} />
        {node.type === 'image' && (
          <button type="button" className="btn sm" onClick={() => updateNode(node.id, { scaleX: -node.scaleX })}>
            <Icon name="flip" size={16} /> Отразить
          </button>
        )}
      </section>
      <section className="prop">
        <h3>Порядок слоёв</h3>
        <div className="layer-btns">
          <button type="button" className="ib" title="На задний план" aria-label="На задний план" onClick={() => reorder('bottom')}>
            <Icon name="toBack" />
          </button>
          <button type="button" className="ib" title="Ниже" aria-label="Ниже" onClick={() => reorder('down')}>
            <Icon name="backward" />
          </button>
          <button type="button" className="ib" title="Выше" aria-label="Выше" onClick={() => reorder('up')}>
            <Icon name="forward" />
          </button>
          <button type="button" className="ib" title="На передний план" aria-label="На передний план" onClick={() => reorder('top')}>
            <Icon name="toFront" />
          </button>
        </div>
        <Layers />
      </section>
      {node.type === 'image' && <ColorSettings node={node} />}
      {!(node.type === 'image' && node.role) && <Effects node={node as ImageNode | TextNode} />}
    </>
  )
}

export function PropertiesPanel({ open }: { open: boolean }) {
  const node = useEditor((s) => s.doc.nodes.find((n) => n.id === s.selectedId))
  return (
    <aside className={'ed-right' + (open ? ' open' : '')} aria-label="Свойства">
      {node ? <NodeProps node={node} /> : <CardProps />}
    </aside>
  )
}
