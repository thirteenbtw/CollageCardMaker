import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor } from '../editor'
import { useLibrary } from '../library'
import { FORMATS, FONTS } from '../formats'
import { autoLayout, type AutoOptions } from '../autoLayout'
import type { CardNode, TextNode } from '../types'

const PAPER_COLORS = ['#f6efe3', '#efe2cf', '#e2d3bd', '#f4dcd0', '#dfe5d6', '#d9e1e8', '#2f2a26', '#ffffff']

/** Auto-collage options, shared with the toolbar button */
export const autoOptions: { current: AutoOptions } = {
  current: { withText: true, text: 'С праздником!', tag: null, withFrame: false },
}

export function runAutoLayout() {
  const assets = useLibrary.getState().assets
  const ed = useEditor.getState()
  const doc = autoLayout(assets, ed.doc.formatId, autoOptions.current)
  ed.apply(() => doc)
  ed.select(null)
}

function AutoPanel() {
  const assets = useLibrary((s) => s.assets)
  const [opts, setOpts] = useState<AutoOptions>(autoOptions.current)
  useEffect(() => {
    autoOptions.current = opts
  }, [opts])
  const tags = useMemo(() => [...new Set(assets.flatMap((a) => a.tags))].sort(), [assets])
  const elements = assets.filter((a) => a.category === 'cutout' || a.category === 'sticker').length
  return (
    <section className="group">
      <h4>Автоколлаж</h4>
      <label className="check">
        <input type="checkbox" checked={opts.withText} onChange={(e) => setOpts({ ...opts, withText: e.target.checked })} />С текстом
        (центр остаётся свободным)
      </label>
      {opts.withText && <input value={opts.text} onChange={(e) => setOpts({ ...opts, text: e.target.value })} placeholder="Текст открытки" />}
      <label className="check">
        <input type="checkbox" checked={opts.withFrame} onChange={(e) => setOpts({ ...opts, withFrame: e.target.checked })} />
        Добавить рамку
      </label>
      <label>
        Тема (тег)
        <select value={opts.tag ?? ''} onChange={(e) => setOpts({ ...opts, tag: e.target.value || null })}>
          <option value="">любая</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </select>
      </label>
      <button className="btn primary wide" onClick={() => runAutoLayout()} disabled={!assets.length}>
        ✦ Собрать открытку
      </button>
      {elements < 3 && <div className="muted small">Для красивого коллажа загрузите хотя бы 3 вырезки или стикера и пару фонов.</div>}
    </section>
  )
}

function CanvasPanel() {
  const doc = useEditor((s) => s.doc)
  const setFormat = useEditor((s) => s.setFormat)
  const setBackground = useEditor((s) => s.setBackground)
  return (
    <>
      <section className="group">
        <h4>Формат</h4>
        <select value={doc.formatId} onChange={(e) => setFormat(e.target.value)}>
          {FORMATS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </section>
      <section className="group">
        <h4>Цвет бумаги</h4>
        <div className="swatches">
          {PAPER_COLORS.map((c) => (
            <button key={c} className={'swatch' + (doc.background === c ? ' active' : '')} style={{ background: c }} onClick={() => setBackground(c)} />
          ))}
          <input type="color" value={doc.background} onChange={(e) => setBackground(e.target.value)} title="Свой цвет" />
        </div>
      </section>
      <AutoPanel />
    </>
  )
}

/** slider that records one history step per drag, not per tick */
function Slider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string
}) {
  const [local, setLocal] = useState<number | null>(null)
  return (
    <label>
      <span className="label-row">
        {label}
        <span className="muted">{(format ?? String)(local ?? value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={local ?? value}
        onChange={(e) => setLocal(Number(e.target.value))}
        onPointerUp={() => {
          if (local !== null) onChange(local)
          setLocal(null)
        }}
        onKeyUp={() => {
          if (local !== null) onChange(local)
          setLocal(null)
        }}
      />
    </label>
  )
}

function TextControls({ node }: { node: TextNode }) {
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
    <section className="group">
      <h4>Текст</h4>
      <textarea
        ref={ta}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== node.text && set({ text })}
      />
      <select value={node.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })} style={{ fontFamily: node.fontFamily }}>
        {FONTS.map((f) => (
          <option key={f} value={f} style={{ fontFamily: f }}>
            {f}
          </option>
        ))}
      </select>
      <div className="row">
        <input type="color" value={node.fill} onChange={(e) => set({ fill: e.target.value })} title="Цвет" />
        <button className={'btn icon' + (bold ? ' on' : '')} onClick={() => set({ fontStyle: style(!bold, italic) })}>
          <b>Ж</b>
        </button>
        <button className={'btn icon' + (italic ? ' on' : '')} onClick={() => set({ fontStyle: style(bold, !italic) })}>
          <i>К</i>
        </button>
        {(['left', 'center', 'right'] as const).map((a) => (
          <button key={a} className={'btn icon' + (node.align === a ? ' on' : '')} onClick={() => set({ align: a })} title={a}>
            {a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}
          </button>
        ))}
      </div>
      <Slider label="Размер" value={Math.round(node.fontSize)} min={12} max={600} step={1} onChange={(v) => set({ fontSize: v })} />
    </section>
  )
}

function NodePanel({ node }: { node: CardNode }) {
  const { updateNode, reorder, removeSelected, duplicateSelected, select } = useEditor()
  return (
    <>
      <div className="panel-head-row">
        <button className="btn link" onClick={() => select(null)}>
          ← Настройки открытки
        </button>
      </div>
      {node.type === 'text' && <TextControls node={node} />}
      <section className="group">
        <h4>Слой</h4>
        <div className="row wrap">
          <button className="btn small" onClick={() => reorder('top')}>Наверх</button>
          <button className="btn small" onClick={() => reorder('up')}>Выше</button>
          <button className="btn small" onClick={() => reorder('down')}>Ниже</button>
          <button className="btn small" onClick={() => reorder('bottom')}>Вниз</button>
        </div>
        <Slider label="Прозрачность" value={node.opacity} min={0.05} max={1} step={0.05} onChange={(v) => updateNode(node.id, { opacity: v })} format={(v) => Math.round(v * 100) + '%'} />
        <Slider label="Поворот" value={Math.round(node.rotation)} min={-180} max={180} step={1} onChange={(v) => updateNode(node.id, { rotation: v })} format={(v) => v + '°'} />
        {node.type === 'image' && (
          <button className="btn small" onClick={() => updateNode(node.id, { scaleX: -node.scaleX })}>
            ⇋ Отразить
          </button>
        )}
      </section>
      <section className="group">
        <div className="row">
          <button className="btn" onClick={duplicateSelected}>Дублировать</button>
          <button className="btn danger" onClick={removeSelected}>Удалить</button>
        </div>
        <div className="muted small">Del — удалить, Ctrl+D — дублировать, стрелки — сдвиг, Shift+стрелки — быстрее</div>
      </section>
    </>
  )
}

export function Inspector() {
  const node = useEditor((s) => s.doc.nodes.find((n) => n.id === s.selectedId))
  return <aside className="panel inspector">{node ? <NodePanel node={node} /> : <CanvasPanel />}</aside>
}
