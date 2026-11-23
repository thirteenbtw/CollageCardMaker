import { useEffect, useMemo, useRef, useState } from 'react'
import { useLibrary, assetUrl, parseTags } from '../library'
import { useEditor } from '../editor'
import { CATEGORIES, CATEGORY_LABELS, type Asset, type AssetCategory } from '../types'
import { ASSET_MIME } from '../stageRef'

function AssetEditor({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const update = useLibrary((s) => s.update)
  const remove = useLibrary((s) => s.remove)
  const [name, setName] = useState(asset.name)
  const [category, setCategory] = useState<AssetCategory>(asset.category)
  const [tags, setTags] = useState(asset.tags.join(', '))
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <img className="modal-preview" src={assetUrl(asset)} alt="" />
        <label>
          Название
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Категория
          <select value={category} onChange={(e) => setCategory(e.target.value as AssetCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Теги (через запятую)
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="цветы, весна, винтаж" />
        </label>
        <div className="modal-actions">
          <button
            className="btn danger"
            onClick={async () => {
              if (confirm('Удалить элемент из библиотеки? В сохранённых открытках он пропадёт.')) {
                await remove(asset.id)
                onClose()
              }
            }}
          >
            Удалить
          </button>
          <span className="grow" />
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn primary"
            onClick={async () => {
              await update(asset.id, { name: name.trim() || asset.name, category, tags: parseTags(tags) })
              onClose()
            }}
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  )
}

export function Library() {
  const { assets, loaded, load, upload } = useLibrary()
  const addAsset = useEditor((s) => s.addAsset)
  const [tab, setTab] = useState<AssetCategory | 'all'>('all')
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [uploadCategory, setUploadCategory] = useState<AssetCategory>('cutout')
  const [uploadTags, setUploadTags] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Asset | null>(null)
  const [dropHover, setDropHover] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  const topTags = useMemo(() => {
    const count = new Map<string, number>()
    assets.forEach((a) => a.tags.forEach((t) => count.set(t, (count.get(t) ?? 0) + 1)))
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([t]) => t)
  }, [assets])

  const visible = assets.filter((a) => {
    if (tab !== 'all' && a.category !== tab) return false
    if (activeTag && !a.tags.includes(activeTag)) return false
    const q = query.trim().toLowerCase()
    if (q && !a.name.toLowerCase().includes(q) && !a.tags.some((t) => t.includes(q))) return false
    return true
  })

  const doUpload = async (files: FileList | File[]) => {
    if (!files.length) return
    setBusy(true)
    try {
      await upload(files, uploadCategory, parseTags(uploadTags))
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="panel library">
      <div className="panel-title">Библиотека</div>

      <div
        className={'upload-box' + (dropHover ? ' hover' : '')}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault()
            setDropHover(true)
          }
        }}
        onDragLeave={() => setDropHover(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDropHover(false)
          doUpload(e.dataTransfer.files)
        }}
      >
        <div className="row">
          <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value as AssetCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <input value={uploadTags} onChange={(e) => setUploadTags(e.target.value)} placeholder="теги через запятую" />
        </div>
        <button className="btn primary wide" disabled={busy} onClick={() => fileInput.current?.click()}>
          {busy ? 'Загружаю…' : '+ Загрузить картинки'}
        </button>
        <div className="muted small">или перетащите файлы сюда. PNG с прозрачностью лучше всего для вырезок и стикеров</div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) doUpload(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      <div className="tabs">
        <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
          Все
        </button>
        {CATEGORIES.map((c) => (
          <button key={c} className={tab === c ? 'active' : ''} onClick={() => setTab(c)}>
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск по названию или тегу" />

      {topTags.length > 0 && (
        <div className="tag-row">
          {topTags.map((t) => (
            <button key={t} className={'tag' + (activeTag === t ? ' active' : '')} onClick={() => setActiveTag(activeTag === t ? null : t)}>
              #{t}
            </button>
          ))}
        </div>
      )}

      <div className="asset-grid">
        {visible.map((a) => (
          <div
            key={a.id}
            className={'asset-tile cat-' + a.category}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(ASSET_MIME, a.id)
              e.dataTransfer.effectAllowed = 'copy'
            }}
            onClick={() => addAsset(a)}
            title={`${a.name}${a.tags.length ? ' · #' + a.tags.join(' #') : ''}\nКлик — добавить, перетаскивание — поставить в нужное место`}
          >
            <img src={assetUrl(a)} alt={a.name} loading="lazy" />
            <button
              className="tile-edit"
              title="Изменить"
              onClick={(e) => {
                e.stopPropagation()
                setEditing(a)
              }}
            >
              ⋯
            </button>
          </div>
        ))}
        {loaded && visible.length === 0 && (
          <div className="empty muted">{assets.length ? 'Ничего не найдено' : 'Библиотека пуста. Загрузите фоны, вырезки, стикеры и рамки.'}</div>
        )}
      </div>

      {editing && <AssetEditor asset={editing} onClose={() => setEditing(null)} />}
    </aside>
  )
}
