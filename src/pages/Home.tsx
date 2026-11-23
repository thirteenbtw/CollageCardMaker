import { useEffect, useMemo, useState } from 'react'
import { nanoid } from 'nanoid'
import { TopBar, PageTitle, TAPE_CLASSES, confirmDialog, promptDialog, useOutsideClose } from '../ui/common'
import { Icon } from '../ui/Icon'
import { useDrafts } from '../drafts'
import { useLibrary } from '../library'
import { useUI } from '../ui/store'
import { emptyDoc, useEditor } from '../editor'
import { go } from '../router'
import { getFormat } from '../formats'
import { plural, timeAgo } from '../util'
import type { Draft } from '../types'

type Filter = 'all' | 'draft' | 'exported'
type Sort = 'updated' | 'created' | 'name'
const SORTS: Record<Sort, string> = { updated: 'Недавно изменённые', created: 'Недавно созданные', name: 'По названию' }
const TILTS = ['-2.5deg', '2deg', '-1deg', '3deg', '1.5deg', '-3deg', '2.5deg', '-1.5deg']

export function newCard() {
  const id = nanoid()
  useEditor.getState().open({ doc: emptyDoc(), id, name: 'Новая открытка', createdAt: Date.now(), persisted: false })
  go(`/card/${id}`)
}

function CardTile({ d, i }: { d: Draft; i: number }) {
  const [menu, setMenu] = useState(false)
  const ref = useOutsideClose(menu, () => setMenu(false))
  const { duplicate, remove, put } = useDrafts()
  const openExport = useUI((s) => s.openExport)
  const f = getFormat(d.doc.formatId)
  const open = () => go(`/card/${d.id}`)
  const rename = async () => {
    setMenu(false)
    const name = await promptDialog('Название открытки', d.name)
    if (name && name.trim()) await put({ ...d, name: name.trim() })
  }
  return (
    <div className="pol" style={{ transform: `rotate(${TILTS[i % TILTS.length]})` }}>
      <div className={'tape ' + TAPE_CLASSES[i % 4]} style={{ transform: `rotate(${i % 2 ? 4 : -5}deg)` }} />
      <button type="button" className="pol-img" style={{ aspectRatio: `${f.width} / ${f.height}` }} onClick={open} aria-label={`Открыть «${d.name}»`}>
        {d.thumbnail && <img src={d.thumbnail} alt="" />}
      </button>
      <div className="pol-meta">
        <div className="pol-title">{d.name}</div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="mono">
            {f.short} · {timeAgo(d.updatedAt)}
          </span>
          <span className={'badge' + (d.exported ? ' done' : '')}>{d.exported ? 'Скачана' : 'Черновик'}</span>
        </div>
      </div>
      <div className="qa" ref={ref}>
        <button type="button" className="ib" title="Дублировать" aria-label="Дублировать" onClick={() => duplicate(d.id)}>
          <Icon name="copy" size={16} />
        </button>
        <button type="button" className="ib" title="Скачать" aria-label="Скачать" onClick={() => openExport({ draftId: d.id, name: d.name, doc: d.doc })}>
          <Icon name="download" size={16} />
        </button>
        <span style={{ position: 'relative' }}>
          <button type="button" className="ib" title="Ещё" aria-label="Ещё" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <Icon name="more" size={16} />
          </button>
          {menu && (
            <div className="menu" style={{ right: 0, top: 'calc(100% + 6px)' }}>
              <button type="button" onClick={open}>
                <Icon name="pencil" size={16} /> Открыть
              </button>
              <button type="button" onClick={rename}>
                <Icon name="text" size={16} /> Переименовать
              </button>
              <button
                type="button"
                className="danger"
                onClick={async () => {
                  setMenu(false)
                  if (await confirmDialog('Удалить открытку?', `«${d.name}» пропадёт без возможности восстановить.`)) remove(d.id)
                }}
              >
                <Icon name="trash" size={16} /> Удалить
              </button>
            </div>
          )}
        </span>
      </div>
    </div>
  )
}

function EmptyHome() {
  const n = useLibrary((s) => s.assets.length)
  const openAutoGen = useUI((s) => s.openAutoGen)
  return (
    <div className="empty" style={{ paddingTop: 60 }}>
      <div aria-hidden="true" style={{ position: 'relative', width: 280, height: 190, marginBottom: 12 }}>
        <div style={{ position: 'absolute', left: 30, top: 20, width: 200, height: 140, background: '#FFFDF8', border: '1.5px solid #2A1712', borderRadius: 8, boxShadow: '4px 4px 0 0 #2A1712', transform: 'rotate(-6deg)' }} />
        <div style={{ position: 'absolute', left: 60, top: 36, width: 200, height: 140, background: '#E9D3B4', border: '1.5px solid #2A1712', borderRadius: 8, boxShadow: '4px 4px 0 0 #2A1712', transform: 'rotate(4deg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="hand" style={{ fontSize: 40, color: '#A8472D' }}>
            привет!
          </span>
        </div>
        <div className="tape clay" style={{ left: 120, top: 18, transform: 'rotate(-8deg)' }} />
      </div>
      <h2>Пока нет открыток</h2>
      <p>Начните с чистой открытки A6 или позвольте нам собрать первый черновик из ваших элементов.</p>
      <div className="row wrap" style={{ justifyContent: 'center', gap: 16 }}>
        <button type="button" className="btn primary lg" onClick={newCard}>
          <Icon name="plus" size={20} /> Новая открытка
        </button>
        <button type="button" className="btn lg" onClick={() => openAutoGen('new')}>
          <Icon name="sparkle" size={20} /> Собрать автоматически
        </button>
      </div>
      <div className="tip">
        <span className="mono">Совет</span>
        <span>
          {n
            ? `В библиотеке ${n} ${plural(n, 'элемент', 'элемента', 'элементов')} — автосборке есть с чем работать.`
            : 'Автосборке нужны элементы, а в библиотеке пока пусто. '}
          {!n && <a href="#/library">Добавьте картинки или стартовый набор</a>}
        </span>
      </div>
    </div>
  )
}

export function Home() {
  const { drafts, loaded, load } = useDrafts()
  const openAutoGen = useUI((s) => s.openAutoGen)
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('updated')
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useOutsideClose(sortOpen, () => setSortOpen(false))
  const [q, setQ] = useState('')
  useEffect(() => {
    load()
  }, [load])

  const counts = { all: drafts.length, draft: drafts.filter((d) => !d.exported).length, exported: drafts.filter((d) => d.exported).length }
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    const l = drafts.filter(
      (d) => (filter === 'all' || (filter === 'exported') === !!d.exported) && (!s || d.name.toLowerCase().includes(s) || d.doc.nodes.some((n) => n.type === 'text' && n.text.toLowerCase().includes(s))),
    )
    return l.sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name, 'ru') : sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt))
  }, [drafts, filter, sort, q])

  return (
    <div className="shell grid-paper">
      <TopBar current="home" search={q} onSearch={setQ} placeholder="Поиск открыток" />
      <main className="page">
        {loaded && drafts.length === 0 ? (
          <EmptyHome />
        ) : (
          <>
            <section className="home-head">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <PageTitle>Мои открытки</PageTitle>
                <p className="lede">
                  {drafts.length} {plural(drafts.length, 'открытка', 'открытки', 'открыток')}
                  {drafts[0] && ` · последняя правка ${timeAgo(drafts[0].updatedAt)}`}
                </p>
              </div>
              <div className="row wrap" style={{ gap: 16 }}>
                <button type="button" className="btn lg" onClick={() => openAutoGen('new')}>
                  <Icon name="sparkle" size={20} /> Собрать автоматически
                </button>
                <button type="button" className="btn primary lg" onClick={newCard} style={{ minWidth: 190 }}>
                  <Icon name="plus" size={20} /> Новая открытка
                </button>
              </div>
            </section>
            <div className="home-filters">
              <div className="row wrap" role="group" aria-label="Фильтр">
                {(
                  [
                    ['all', 'Все'],
                    ['draft', 'Черновики'],
                    ['exported', 'Скачанные'],
                  ] as [Filter, string][]
                ).map(([id, label]) => (
                  <button key={id} type="button" className="chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>
                    {label} <span className="count">{counts[id]}</span>
                  </button>
                ))}
              </div>
              <div style={{ position: 'relative' }} ref={sortRef}>
                <button type="button" className="chip" onClick={() => setSortOpen(!sortOpen)} aria-expanded={sortOpen}>
                  <span className="mono">Сортировка</span> {SORTS[sort]} <Icon name="chevron" size={16} />
                </button>
                {sortOpen && (
                  <div className="menu" style={{ right: 0, top: 'calc(100% + 6px)' }} role="menu">
                    {(Object.keys(SORTS) as Sort[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="menuitemradio"
                        aria-checked={sort === s}
                        onClick={() => {
                          setSort(s)
                          setSortOpen(false)
                        }}
                      >
                        {SORTS[s]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="card-grid">
              <button type="button" className="newtile" onClick={newCard}>
                <span className="plus">
                  <Icon name="plus" size={28} stroke={2.2} />
                </span>
                <span className="hand" style={{ fontSize: 34, lineHeight: 1 }}>
                  Новая открытка
                </span>
                <span className="mono">A6 · 148 × 105 мм</span>
              </button>
              {list.map((d, i) => (
                <CardTile key={d.id} d={d} i={i} />
              ))}
            </div>
            {list.length === 0 && <p className="lede" style={{ marginTop: 32 }}>Ничего не нашлось. Попробуйте другой фильтр или запрос.</p>}
          </>
        )}
      </main>
      <div className="checker-strip" aria-hidden="true" />
    </div>
  )
}
