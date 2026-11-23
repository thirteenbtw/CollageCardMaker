import { useMemo, useRef, useState } from 'react'
import { useLibrary, assetUrl } from '../library'
import { TEXT_PRESETS, useEditor } from '../editor'
import { PAPER_COLORS } from '../formats'
import { Icon } from '../ui/Icon'
import { StarterKitButton } from '../pages/Library'
import { ASSET_MIME, TEXT_MIME } from './Canvas'
import type { Asset, AssetCategory } from '../types'
import { useUI } from '../ui/store'

export type ElTab = 'bg' | 'cut' | 'st' | 'tx'
export const EL_TABS: { id: ElTab; label: string; cats: AssetCategory[]; upload: AssetCategory | 'auto'; icon: 'image' | 'grid' | 'sparkle' | 'text' }[] = [
  { id: 'bg', label: 'Фоны', cats: ['background'], upload: 'background', icon: 'grid' },
  { id: 'cut', label: 'Вырезки', cats: ['photo', 'cutout'], upload: 'auto', icon: 'image' },
  { id: 'st', label: 'Стикеры', cats: ['sticker', 'frame'], upload: 'sticker', icon: 'sparkle' },
  { id: 'tx', label: 'Текст', cats: [], upload: 'auto', icon: 'text' },
]

function AssetGrid({ assets, cover }: { assets: Asset[]; cover?: boolean }) {
  const addAsset = useEditor((s) => s.addAsset)
  return (
    <div className={'lib-grid' + (cover ? ' bgs' : '')}>
      {assets.map((a) => (
        <button
          key={a.id}
          type="button"
          className={'lib-item' + (cover ? ' cover' : ' checker')}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(ASSET_MIME, a.id)
            e.dataTransfer.effectAllowed = 'copy'
          }}
          onClick={() => addAsset(a)}
          aria-label={`Добавить: ${a.name}`}
          title={a.name}
        >
          <img src={assetUrl(a)} alt="" loading="lazy" />
          <span className="nm">{a.name}</span>
        </button>
      ))}
    </div>
  )
}

export function ElementsPanel({ tab, setTab, open }: { tab: ElTab; setTab: (t: ElTab) => void; open: boolean }) {
  const assets = useLibrary((s) => s.assets)
  const upload = useLibrary((s) => s.upload)
  const notify = useUI((s) => s.notify)
  const background = useEditor((s) => s.doc.background)
  const setBackground = useEditor((s) => s.setBackground)
  const addText = useEditor((s) => s.addText)
  const [q, setQ] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const def = EL_TABS.find((t) => t.id === tab)!
  const list = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/^#/, '')
    return assets.filter((a) => def.cats.includes(a.category) && (!s || a.name.toLowerCase().includes(s) || a.tags.some((t) => t.includes(s))))
  }, [assets, def, q])

  return (
    <aside className={'ed-left' + (open ? ' open' : '')} aria-label="Элементы">
      <div className="seg" role="tablist" aria-label="Тип элементов">
        {EL_TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab !== 'tx' && (
        <div className="row">
          <label className="search" style={{ flex: 1, height: 40 }}>
            <Icon name="search" />
            <span className="sr-only">Поиск</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Поиск: ${def.label.toLowerCase()}`} />
          </label>
          <button type="button" className="ib" style={{ width: 40, height: 40 }} title="Загрузить" aria-label="Загрузить картинки" onClick={() => file.current?.click()}>
            <Icon name="upload" size={18} />
          </button>
          <input
            ref={file}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={async (e) => {
              if (e.target.files) {
                const added = await upload(e.target.files, { category: def.upload, tags: [], removeBg: true })
                if (added.length) notify(`Добавлено в библиотеку: ${added.length}`)
              }
              e.target.value = ''
            }}
          />
        </div>
      )}

      {tab === 'bg' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="mono">Цвет бумаги</span>
          <div className="paper-row">
            {PAPER_COLORS.map((c) => (
              <button key={c} type="button" className="paper" style={{ background: c }} aria-pressed={background.toLowerCase() === c.toLowerCase()} aria-label={`Цвет ${c}`} onClick={() => setBackground(c)} />
            ))}
            <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} aria-label="Свой цвет" title="Свой цвет" style={{ width: 32, height: 32 }} />
          </div>
        </div>
      )}

      {tab === 'tx' ? (
        <div className="text-presets">
          {TEXT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="text-preset"
              draggable
              onDragStart={(e) => e.dataTransfer.setData(TEXT_MIME, p.id)}
              onClick={() => addText(p.id)}
            >
              <span className="mono" style={{ display: 'block', marginBottom: 6 }}>
                {p.label}
              </span>
              {p.id === 'hand' && <span style={{ fontFamily: 'Caveat', fontWeight: 700, fontSize: 30, lineHeight: 1 }}>{p.sample}</span>}
              {p.id === 'sans' && <span style={{ fontFamily: 'Onest', fontSize: 16 }}>{p.sample}</span>}
              {p.id === 'mono' && <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 13, letterSpacing: 2, color: '#6B5448' }}>{p.sample}</span>}
              {p.id === 'label' && (
                <span style={{ display: 'inline-block', fontFamily: 'IBM Plex Mono', fontWeight: 700, fontSize: 14, letterSpacing: 3, background: '#2A1712', color: '#FFFDF8', padding: '4px 10px', borderRadius: 3 }}>{p.sample}</span>
              )}
            </button>
          ))}
        </div>
      ) : list.length ? (
        <AssetGrid assets={list} cover={tab === 'bg'} />
      ) : (
        <div className="ed-empty-lib">
          {q ? (
            'Ничего не нашлось.'
          ) : (
            <>
              <span>Здесь пока пусто. Загрузите свои картинки кнопкой выше или возьмите стартовый набор.</span>
              <StarterKitButton className="btn sm" />
            </>
          )}
        </div>
      )}
      <p className="foot">
        Перетащите на открытку или кликните · <a href="#/library">Управлять библиотекой</a>
      </p>
    </aside>
  )
}
