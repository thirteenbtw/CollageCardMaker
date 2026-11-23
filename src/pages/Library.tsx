import { useEffect, useMemo, useRef, useState } from 'react'
import { TopBar, PageTitle, confirmDialog } from '../ui/common'
import { Icon } from '../ui/Icon'
import { useLibrary, assetUrl, parseTags, loadAssetImage, type UploadOptions } from '../library'
import { useDrafts } from '../drafts'
import { useUI } from '../ui/store'
import { CATEGORIES, CATEGORY_KIND, CATEGORY_LABELS, type Asset, type AssetCategory } from '../types'
import { NAMED_COLORS, colorById } from '../colors'
import { buildStarterKit } from '../starterKit'
import { buildPacks, loadPacks, type Pack } from '../packs'
import { removeBackground } from '../imageTools'
import { plural } from '../util'

export function UploadZone({ compact, defaultCategory = 'auto' }: { compact?: boolean; defaultCategory?: UploadOptions['category'] }) {
  const upload = useLibrary((s) => s.upload)
  const notify = useUI((s) => s.notify)
  const [hover, setHover] = useState(false)
  const [category, setCategory] = useState<UploadOptions['category']>(defaultCategory)
  const [tags, setTags] = useState('')
  const [removeBg, setRemoveBg] = useState(true)
  const input = useRef<HTMLInputElement>(null)
  const go = async (files: FileList | File[]) => {
    const added = await upload(files, { category, tags: parseTags(tags), removeBg })
    if (added.length) notify(`Добавлено: ${added.length} ${plural(added.length, 'элемент', 'элемента', 'элементов')}`)
  }
  return (
    <div
      className={'dropzone' + (hover ? ' hover' : '')}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setHover(true)
        }
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault()
        setHover(false)
        if (e.dataTransfer.files.length) go(e.dataTransfer.files)
      }}
    >
      <span className="dz-icon" aria-hidden="true">
        <Icon name="upload" size={26} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 }}>
        <span style={{ fontSize: compact ? 16 : 18, fontWeight: 500 }}>Перетащите сюда фото, вырезки PNG или стикеры SVG</span>
        <span className="mono">PNG · JPG · WEBP · SVG — до 20 МБ · фон у вырезок удаляется автоматически</span>
      </span>
      <button type="button" className="btn" onClick={() => input.current?.click()}>
        Выбрать файлы
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) go(e.target.files)
          e.target.value = ''
        }}
      />
      <div className="dz-opts">
        <span className="mono">Загрузить как</span>
        <select className="field" value={category} onChange={(e) => setCategory(e.target.value as UploadOptions['category'])} aria-label="Категория загружаемых файлов">
          <option value="auto">Определить автоматически</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <input className="field" style={{ width: 200 }} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="теги через запятую" aria-label="Теги" />
        <label className="row" style={{ fontSize: 14 }}>
          <input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} /> Удалять однотонный фон у вырезок
        </label>
      </div>
    </div>
  )
}

function TagEditor({ tags, onChange, suggestions }: { tags: string[]; onChange: (t: string[]) => void; suggestions: string[] }) {
  const [v, setV] = useState('')
  const add = (s: string) => {
    const next = parseTags(s).filter((t) => !tags.includes(t))
    if (next.length) onChange([...tags, ...next])
    setV('')
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="tagbox">
        {tags.map((t) => (
          <span key={t} className="tagpill">
            #{t}
            <button type="button" aria-label={`Убрать тег ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
              <Icon name="close" size={12} stroke={2.4} />
            </button>
          </span>
        ))}
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add(v)
            } else if (e.key === 'Backspace' && !v && tags.length) onChange(tags.slice(0, -1))
          }}
          onBlur={() => v && add(v)}
          placeholder="Добавить тег…"
          aria-label="Добавить тег"
        />
      </div>
      {suggestions.length > 0 && (
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            Подсказки:
          </span>
          {suggestions.map((s) => (
            <button key={s} type="button" className="chip sm" onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AssetPanel({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const { update, remove, replaceImage, assets } = useLibrary()
  const drafts = useDrafts((s) => s.drafts)
  const notify = useUI((s) => s.notify)
  const [name, setName] = useState(asset.name)
  const [category, setCategory] = useState<AssetCategory>(asset.category)
  const [tags, setTags] = useState(asset.tags)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setName(asset.name)
    setCategory(asset.category)
    setTags(asset.tags)
  }, [asset.id, asset.name, asset.category, asset.tags])

  const usedIn = drafts.filter((d) => d.doc.nodes.some((n) => n.type === 'image' && n.assetId === asset.id))
  const suggestions = useMemo(() => {
    const count = new Map<string, number>()
    assets.forEach((a) => a.category === category && a.tags.forEach((t) => count.set(t, (count.get(t) ?? 0) + 1)))
    const fromLib = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
    const fromColor = asset.colors.map((c) => colorById(c)?.label ?? '')
    return [...new Set([...fromLib, ...fromColor])].filter((t) => t && !tags.includes(t)).slice(0, 4)
  }, [assets, category, asset.colors, tags])
  const dirty = name !== asset.name || category !== asset.category || tags.join() !== asset.tags.join()

  return (
    <aside className="side-panel" aria-label="Редактирование элемента">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="mono">Выбрано · {CATEGORY_KIND[asset.category]}</span>
        <button type="button" className="ib sm" aria-label="Закрыть панель" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="side-preview checker">
        <img src={assetUrl(asset)} alt={asset.name} />
        <span className="mono">
          {asset.mime === 'image/png' ? 'PNG' : 'JPG'} · {asset.width} × {asset.height}
        </span>
      </div>
      <label className="lbl">
        Название
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="lbl">
        Категория
        <select className="field" value={category} onChange={(e) => setCategory(e.target.value as AssetCategory)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      <div className="lbl">
        Теги
        <TagEditor tags={tags} onChange={setTags} suggestions={suggestions} />
      </div>
      {asset.colors.length > 0 && (
        <div className="lbl">
          Цвета
          <div className="colordots">
            {asset.colors.map((c) => (
              <span key={c} title={colorById(c)?.label} style={{ background: colorById(c)?.hex }} />
            ))}
            <span className="muted" style={{ border: 0, width: 'auto', fontSize: 13, fontWeight: 400 }}>
              {asset.colors.map((c) => colorById(c)?.label).join(', ')}
            </span>
          </div>
        </div>
      )}
      {(category === 'cutout' || category === 'sticker') && asset.mime !== 'image/png' && (
        <button
          type="button"
          className="btn sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const img = await loadAssetImage(asset)
            const c = document.createElement('canvas')
            c.width = asset.width
            c.height = asset.height
            c.getContext('2d')!.drawImage(img, 0, 0)
            const share = removeBackground(c)
            if (share > 0.02) {
              await replaceImage(asset.id, c)
              notify('Фон удалён')
            } else notify('Не нашёл однотонный фон по краям')
            setBusy(false)
          }}
        >
          <Icon name="wand" size={16} /> Удалить фон
        </button>
      )}
      <div className="used-in">
        {usedIn.length ? (
          <>
            Используется в <b>{usedIn.length} {plural(usedIn.length, 'открытке', 'открытках', 'открытках')}</b>: {usedIn.slice(0, 4).map((d) => d.name).join(', ')}
            {usedIn.length > 4 && '…'}
          </>
        ) : (
          'Пока не используется в открытках'
        )}
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button
          type="button"
          className="btn ghost danger"
          onClick={async () => {
            const warn = usedIn.length ? ` Он пропадёт из ${usedIn.length} ${plural(usedIn.length, 'открытки', 'открыток', 'открыток')}.` : ''
            if (await confirmDialog('Удалить элемент?', `«${asset.name}» будет удалён из библиотеки.${warn}`)) {
              await remove(asset.id)
              onClose()
            }
          }}
        >
          <Icon name="trash" size={16} /> Удалить
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!dirty}
          onClick={async () => {
            await update(asset.id, { name: name.trim() || asset.name, category, tags })
            notify('Сохранено')
          }}
        >
          Сохранить
        </button>
      </div>
    </aside>
  )
}

export function StarterKitButton({ className = 'btn' }: { className?: string }) {
  const addAssets = useLibrary((s) => s.addAssets)
  const assets = useLibrary((s) => s.assets)
  const notify = useUI((s) => s.notify)
  const [busy, setBusy] = useState<string | null>(null)
  const [packs, setPacks] = useState<Pack[]>([])
  useEffect(() => {
    loadPacks().then(setPacks)
  }, [])
  const hasKit = assets.some((a) => a.starter && !a.pack)
  const present = new Set(assets.map((a) => a.pack).filter(Boolean))
  const missing = packs.filter((p) => !present.has(p.id))
  if (hasKit && missing.length === 0) return null
  const label = hasKit ? `Добавить новые наборы (${missing.length})` : 'Добавить стартовый набор'
  return (
    <button
      type="button"
      className={className}
      disabled={!!busy}
      onClick={async () => {
        setBusy('Рисую…')
        const kit = hasKit ? [] : await buildStarterKit()
        const pics = await buildPacks(missing, (d, t) => setBusy(`Загружаю ${d} из ${t}…`))
        await addAssets([...kit, ...pics])
        setBusy(null)
        notify(`Добавлено элементов: ${kit.length + pics.length}`)
      }}
    >
      <Icon name="sparkle" size={18} /> {busy ?? label}
    </button>
  )
}

export function Library() {
  const { assets, uploads, load } = useLibrary()
  const loadDrafts = useDrafts((s) => s.load)
  const drafts = useDrafts((s) => s.drafts)
  const [cat, setCat] = useState<AssetCategory | 'all'>('all')
  const [color, setColor] = useState<string | null>(null)
  const [tag, setTag] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  useEffect(() => {
    load()
    loadDrafts()
  }, [load, loadDrafts])

  const usedCards = drafts.filter((d) => d.doc.nodes.some((n) => n.type === 'image')).length
  const counts = useMemo(() => {
    const m: Record<string, number> = { all: assets.length }
    CATEGORIES.forEach((c) => (m[c] = assets.filter((a) => a.category === c).length))
    return m
  }, [assets])
  const topTags = useMemo(() => {
    const m = new Map<string, number>()
    assets.forEach((a) => a.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)))
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => t)
  }, [assets])
  const presentColors = NAMED_COLORS.filter((c) => assets.some((a) => a.colors.includes(c.id)))
  const shown = assets.filter((a) => {
    if (cat !== 'all' && a.category !== cat) return false
    if (color && !a.colors.includes(color)) return false
    if (tag && !a.tags.includes(tag)) return false
    const s = q.trim().toLowerCase().replace(/^#/, '')
    if (s && !a.name.toLowerCase().includes(s) && !a.tags.some((t) => t.includes(s))) return false
    return true
  })
  const selected = assets.find((a) => a.id === sel)
  const clear = () => {
    setCat('all')
    setColor(null)
    setTag(null)
    setQ('')
  }

  return (
    <div className="shell grid-paper">
      <TopBar current="library" search={q} onSearch={setQ} placeholder="Поиск по тегу или названию" />
      <main className="page" style={{ maxWidth: 1400 }}>
        <div className="lib-layout">
          <div className="lib-main">
            <div className="row wrap" style={{ justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <PageTitle tapes={false}>Библиотека элементов</PageTitle>
                <p className="lede">
                  {assets.length} {plural(assets.length, 'элемент', 'элемента', 'элементов')}
                  {usedCards > 0 && ` · используются в ${usedCards} ${plural(usedCards, 'открытке', 'открытках', 'открытках')}`}
                </p>
              </div>
              <div className="row wrap">
                <StarterKitButton className="btn sm" />
                {assets.length > 0 && (
                  <span className="mono">
                    Показано {shown.length} из {assets.length}
                  </span>
                )}
              </div>
            </div>
            <UploadZone />
            {assets.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="filter-row" role="group" aria-label="Категория">
                  <span className="mono">Категория</span>
                  {(['all', ...CATEGORIES] as const).map((c) => (
                    <button key={c} type="button" className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
                      {c === 'all' ? 'Все' : CATEGORY_LABELS[c]} <span className="count">{counts[c]}</span>
                    </button>
                  ))}
                </div>
                {presentColors.length > 0 && (
                  <div className="filter-row" role="group" aria-label="Цвет">
                    <span className="mono">Цвет</span>
                    {presentColors.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="swatch-chip"
                        style={{ background: c.hex, color: c.id === 'ink' || c.id === 'slate' ? '#FFFDF8' : '#2A1712' }}
                        aria-pressed={color === c.id}
                        aria-label={c.label}
                        title={c.label}
                        onClick={() => setColor(color === c.id ? null : c.id)}
                      >
                        {color === c.id && <Icon name="check" size={16} stroke={2.6} />}
                      </button>
                    ))}
                    {color && (
                      <button type="button" className="btn ghost sm" onClick={() => setColor(null)}>
                        Сбросить
                      </button>
                    )}
                  </div>
                )}
                {topTags.length > 0 && (
                  <div className="filter-row" role="group" aria-label="Теги">
                    <span className="mono">Теги</span>
                    {topTags.map((t) => (
                      <button key={t} type="button" className="chip sm" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                        #{t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {assets.length === 0 && uploads.length === 0 ? (
              <div className="empty">
                <div aria-hidden="true" style={{ width: 150, height: 110, border: '1.5px solid #2A1712', borderRadius: 10, background: '#E9D3B4', boxShadow: '4px 4px 0 0 #2A1712', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: -8, right: -8, top: -14, height: 28, border: '1.5px solid #2A1712', borderRadius: 8, background: '#C9A27A' }} />
                </div>
                <h2>Коробка пока пуста</h2>
                <p>Загрузите фото, вырезки и стикеры. Цвета определятся автоматически, а теги помогут собирать открытки по темам.</p>
                <StarterKitButton className="btn primary lg" />
              </div>
            ) : shown.length === 0 && uploads.length === 0 ? (
              <div className="empty">
                <h2>Ничего не нашлось</h2>
                <p>Попробуйте другой цвет или тег, или сбросьте фильтры, чтобы увидеть все {assets.length} элементов.</p>
                <button type="button" className="btn" onClick={clear}>
                  Сбросить фильтры
                </button>
              </div>
            ) : (
              <div className="masonry">
                {uploads.map((u) => (
                  <div key={u.id} className="upload-tile">
                    <div className="tile-name">{u.name}</div>
                    <div className="progress" role="progressbar" aria-valuenow={Math.round(u.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Загрузка">
                      <div style={{ width: `${Math.max(8, u.progress * 100)}%` }} />
                    </div>
                    <div className="mono">Загрузка · {Math.round(u.progress * 100)}%</div>
                  </div>
                ))}
                {shown.map((a) => (
                  <button key={a.id} type="button" className="tile" aria-pressed={sel === a.id} onClick={() => setSel(sel === a.id ? null : a.id)}>
                    <span className={'tile-img' + (a.category === 'background' || a.category === 'photo' ? ' full' : ' checker')}>
                      <img src={assetUrl(a)} alt="" loading="lazy" />
                      <span className="tile-kind">{CATEGORY_KIND[a.category]}</span>
                    </span>
                    <span className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="tile-name">{a.name}</span>
                      <span className="edit-hint">Изменить</span>
                    </span>
                    {a.tags.length > 0 && (
                      <span className="tile-tags">
                        {a.tags.slice(0, 4).map((t) => (
                          <span key={t} className="tag">
                            #{t}
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          {selected && <AssetPanel asset={selected} onClose={() => setSel(null)} />}
        </div>
      </main>
      <div className="checker-strip" aria-hidden="true" />
    </div>
  )
}
