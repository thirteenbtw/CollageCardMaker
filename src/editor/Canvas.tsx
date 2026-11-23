import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Stage, Layer, Rect, Image as KImage, Text as KText, Shape, Group, Transformer } from 'react-konva'
import type Konva from 'konva'
import { useEditor } from '../editor'
import { useLibrary, loadAssetImage } from '../library'
import { getFormat } from '../formats'
import type { ImageNode, TextNode } from '../types'
import { colorized, imageSize, shadowDistance, shadowProps, tapePosFromPoint, tapeRect, TAPE_DEFAULT, textConfig, textLayout, tornPolygon } from '../effects'
import { tornSceneFunc } from '../render'

export const ASSET_MIME = 'application/x-card-asset'
export const TEXT_MIME = 'application/x-card-text'

const ACCENT = '#D2694B'
const INK = '#2A1712'

function useSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 800, h: 600 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    update()
    return () => ro.disconnect()
  }, [ref])
  return size
}

/** re-render when web fonts finish loading so text gets measured correctly */
function useFontsTick() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const f = () => setTick((x) => x + 1)
    document.fonts.addEventListener('loadingdone', f)
    document.fonts.ready.then(f)
    return () => document.fonts.removeEventListener('loadingdone', f)
  }, [])
}

interface ItemProps<T> {
  node: T
  dist: number
  hovered: boolean
  selected: boolean
  onSelect: () => void
  onHover: (on: boolean) => void
}

function handlers(id: string, locked?: boolean) {
  const { updateNode } = useEditor.getState()
  return {
    draggable: !locked,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      // ignore drags of children (e.g. the washi tape) that bubble up
      if (e.target !== e.currentTarget) return
      updateNode(id, { x: e.target.x(), y: e.target.y() })
    },
  }
}

function ImageItem({ node, dist, hovered, selected, onSelect, onHover }: ItemProps<ImageNode>) {
  const asset = useLibrary((s) => s.assets.find((a) => a.id === node.assetId))
  const [source, setSource] = useState<HTMLImageElement | null>(null)
  const outer = useRef<Konva.Group>(null)
  useEffect(() => {
    let alive = true
    if (asset) loadAssetImage(asset).then((i) => alive && setSource(i), () => {})
    return () => {
      alive = false
    }
  }, [asset])
  const img = useMemo(() => (source ? colorized(source, node.assetId, node.color) : null), [source, node.assetId, node.color])
  const W = node.width * Math.abs(node.scaleX)
  const H = node.height * Math.abs(node.scaleY)
  // The selection frame must hug the picture itself: torn edges, shadows and the tape
  // would otherwise stretch (or, for the custom torn shape, collapse) the box.
  useLayoutEffect(() => {
    const g = outer.current
    if (!g) return
    const base = Object.getPrototypeOf(g).getClientRect as Konva.Group['getClientRect']
    g.getClientRect = function (cfg) {
      if (cfg?.skipTransform) return { x: -W / 2, y: -H / 2, width: W, height: H }
      return base.call(this, cfg)
    }
  })
  if (!img) return null
  const size = imageSize(img)
  const sh = shadowProps(node, dist, node.scaleX, node.scaleY)
  const tapeEditable = selected && !node.locked
  return (
    <Group
      ref={outer}
      id={node.id}
      name="el"
      x={node.x}
      y={node.y}
      rotation={node.rotation}
      opacity={node.opacity}
      onMouseDown={onSelect}
      onTap={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onTransformEnd={(e) => {
        const g = e.target
        if (g !== e.currentTarget) return
        const kx = g.scaleX()
        const ky = g.scaleY()
        g.scale({ x: 1, y: 1 })
        useEditor.getState().updateNode(node.id, { x: g.x(), y: g.y(), rotation: g.rotation(), scaleX: node.scaleX * kx, scaleY: node.scaleY * ky })
      }}
      {...handlers(node.id, node.locked)}
    >
      <Group scaleX={node.scaleX} scaleY={node.scaleY} offsetX={node.width / 2} offsetY={node.height / 2}>
        {node.torn ? (
          <Shape
            width={node.width}
            height={node.height}
            sceneFunc={tornSceneFunc(tornPolygon(node.id, node.width, node.height, node.tornOpts))}
            fillPatternImage={img as HTMLImageElement}
            fillPatternRepeat="no-repeat"
            fillPatternScaleX={node.width / size.w}
            fillPatternScaleY={node.height / size.h}
            {...sh}
          />
        ) : (
          <KImage image={img} width={node.width} height={node.height} {...sh} />
        )}
      </Group>
      {node.tape && (
        <Rect
          {...tapeRect(node)}
          name="tape"
          draggable={tapeEditable}
          onMouseEnter={(e) => tapeEditable && (e.target.getStage()!.container().style.cursor = 'move')}
          onMouseLeave={(e) => (e.target.getStage()!.container().style.cursor = '')}
          onDragStart={(e) => {
            e.cancelBubble = true
          }}
          onDragMove={(e) => {
            e.cancelBubble = true
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true
            const p = tapePosFromPoint(node, e.target.x(), e.target.y())
            useEditor.getState().updateNode(node.id, { tapeOpts: { ...TAPE_DEFAULT, ...node.tapeOpts, ...p } } as Partial<ImageNode>)
          }}
        />
      )}
      {hovered && !selected && <Rect x={-W / 2 - 6} y={-H / 2 - 6} width={W + 12} height={H + 12} stroke={INK} strokeWidth={1.5} dash={[6, 4]} strokeScaleEnabled={false} listening={false} />}
    </Group>
  )
}

function TextItem({ node, dist, hovered, selected, onSelect, onHover }: ItemProps<TextNode>) {
  const L = textLayout(node)
  const sh = shadowProps(node, dist, node.scaleX, node.scaleY)
  const focus = () => window.dispatchEvent(new Event('focus-text-editor'))
  return (
    <Group
      id={node.id}
      name="el"
      x={node.x}
      y={node.y}
      rotation={node.rotation}
      scaleX={node.scaleX}
      scaleY={node.scaleY}
      offsetX={L.offsetX}
      offsetY={L.offsetY}
      opacity={node.opacity}
      onMouseDown={onSelect}
      onTap={onSelect}
      onDblClick={focus}
      onDblTap={focus}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onTransformEnd={(e) => {
        const g = e.target
        // bake the scale into font size / width so text stays crisp and re-flows
        const s = Math.abs(g.scaleY())
        const wf = Math.abs(g.scaleX()) / s
        g.scale({ x: 1, y: 1 })
        useEditor.getState().updateNode(node.id, {
          x: g.x(),
          y: g.y(),
          rotation: g.rotation(),
          scaleX: 1,
          scaleY: 1,
          fontSize: node.fontSize * s,
          width: node.width * s * wf,
        } as Partial<TextNode>)
      }}
      {...handlers(node.id, node.locked)}
    >
      {node.bg ? <Rect {...L.rect} fill={node.bg} {...sh} /> : <Rect {...L.rect} fill="transparent" />}
      <KText {...textConfig(node)} {...(node.bg ? {} : sh)} />
      {hovered && !selected && <Rect {...L.rect} stroke={INK} strokeWidth={1.5} dash={[6, 4]} strokeScaleEnabled={false} listening={false} />}
    </Group>
  )
}

export function Canvas({ zoom, setZoom, onFit }: { zoom: number; setZoom: (z: number) => void; onFit: (fit: number) => void }) {
  const wrap = useRef<HTMLDivElement>(null)
  const stage = useRef<Konva.Stage>(null)
  const tr = useRef<Konva.Transformer>(null)
  const { w, h } = useSize(wrap)
  useFontsTick()
  const doc = useEditor((s) => s.doc)
  const selectedId = useEditor((s) => s.selectedId)
  const select = useEditor((s) => s.select)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [shift, setShift] = useState(false)
  const [dropping, setDropping] = useState(false)
  const format = getFormat(doc.formatId)
  const fit = Math.max(0.05, Math.min((w - 96) / format.width, (h - 128) / format.height))
  useEffect(() => onFit(fit), [fit, onFit])
  const scale = fit * zoom
  const dist = shadowDistance(doc)
  const selected = doc.nodes.find((n) => n.id === selectedId)

  useEffect(() => {
    const k = (e: KeyboardEvent) => setShift(e.shiftKey)
    window.addEventListener('keydown', k)
    window.addEventListener('keyup', k)
    return () => {
      window.removeEventListener('keydown', k)
      window.removeEventListener('keyup', k)
    }
  }, [])

  // attach the transformer to the selected node after it rendered
  useEffect(() => {
    const t = tr.current
    if (!t) return
    const target = selectedId ? stage.current?.findOne('#' + selectedId) : null
    t.nodes(target ? [target] : [])
    t.getLayer()?.batchDraw()
  })

  // ctrl / cmd + wheel zooms
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setZoom(Math.min(4, Math.max(0.25, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoom, setZoom])

  const onDrop = (e: React.DragEvent) => {
    setDropping(false)
    const assetId = e.dataTransfer.getData(ASSET_MIME)
    const preset = e.dataTransfer.getData(TEXT_MIME)
    if ((!assetId && !preset) || !stage.current) return
    e.preventDefault()
    stage.current.setPointersPositions(e.nativeEvent)
    const p = stage.current.getPointerPosition()
    const at = p ? { x: p.x / scale, y: p.y / scale } : undefined
    const ed = useEditor.getState()
    if (assetId) {
      const asset = useLibrary.getState().byId(assetId)
      if (asset) ed.addAsset(asset, at)
    } else {
      ed.addText(preset)
      if (at) ed.updateNode(useEditor.getState().selectedId!, at)
    }
  }

  const isText = selected?.type === 'text'
  const locked = !!selected?.locked
  const deselect = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (e.target === e.target.getStage() || e.target.name() === 'card-bg') select(null)
  }

  return (
    <div
      ref={wrap}
      className={'ed-canvas' + (dropping ? ' drop' : '')}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(ASSET_MIME) || e.dataTransfer.types.includes(TEXT_MIME)) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDropping(true)
        }
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
      onMouseDown={(e) => {
        if (e.target === wrap.current) select(null)
      }}
    >
      <div className="card-sheet" style={{ width: format.width * scale, height: format.height * scale }} onMouseDown={(e) => e.stopPropagation()}>
        <Stage ref={stage} width={format.width * scale} height={format.height * scale} scaleX={scale} scaleY={scale} onMouseDown={deselect} onTouchStart={deselect}>
          <Layer>
            <Rect name="card-bg" x={0} y={0} width={format.width} height={format.height} fill={doc.background} />
            {doc.nodes.map((n) => {
              const p = {
                dist,
                hovered: hoverId === n.id,
                selected: selectedId === n.id,
                onSelect: () => select(n.id),
                onHover: (on: boolean) => setHoverId((cur) => (on ? n.id : cur === n.id ? null : cur)),
              }
              return n.type === 'image' ? <ImageItem key={n.id} {...p} node={n} /> : <TextItem key={n.id} {...p} node={n} />
            })}
            <Transformer
              ref={tr}
              keepRatio={!isText}
              resizeEnabled={!locked}
              rotateEnabled={!locked}
              rotationSnaps={shift ? Array.from({ length: 24 }, (_, i) => i * 15) : [0, 90, 180, 270]}
              rotationSnapTolerance={shift ? 7.5 : 3}
              enabledAnchors={isText ? ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right'] : ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center', 'bottom-center', 'middle-left', 'middle-right']}
              anchorSize={11}
              anchorCornerRadius={2}
              anchorStroke={ACCENT}
              anchorStrokeWidth={1.5}
              anchorFill="#FFFDF8"
              borderStroke={locked ? '#9C8A7E' : ACCENT}
              borderStrokeWidth={1.5}
              borderDash={locked ? [6, 4] : undefined}
              rotateAnchorOffset={30}
              rotateAnchorCursor="grab"
              padding={4}
              ignoreStroke
              boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 16 || Math.abs(newBox.height) < 16 ? oldBox : newBox)}
            />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
