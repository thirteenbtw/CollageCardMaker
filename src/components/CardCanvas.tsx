import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Stage, Layer, Rect, Image as KImage, Text as KText, Transformer } from 'react-konva'
import type Konva from 'konva'
import { useEditor } from '../editor'
import { useLibrary, loadAssetImage } from '../library'
import { getFormat } from '../formats'
import type { ImageNode, TextNode } from '../types'
import { stageRef, ASSET_MIME } from '../stageRef'

const PAD = 48

function useContainerSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 800, h: 600 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [ref])
  return size
}

interface ItemProps<T> {
  node: T
  onSelect: () => void
}

function commonHandlers(id: string) {
  const { updateNode } = useEditor.getState()
  return {
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => updateNode(id, { x: e.target.x(), y: e.target.y() }),
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const n = e.target
      updateNode(id, { x: n.x(), y: n.y(), rotation: n.rotation(), scaleX: n.scaleX(), scaleY: n.scaleY() })
    },
  }
}

function ImageItem({ node, onSelect }: ItemProps<ImageNode>) {
  const asset = useLibrary((s) => s.assets.find((a) => a.id === node.assetId))
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    let alive = true
    if (asset) loadAssetImage(asset).then((i) => alive && setImg(i), () => {})
    return () => {
      alive = false
    }
  }, [asset])
  if (!img) return null
  return (
    <KImage
      id={node.id}
      image={img}
      x={node.x}
      y={node.y}
      width={node.width}
      height={node.height}
      offsetX={node.width / 2}
      offsetY={node.height / 2}
      rotation={node.rotation}
      scaleX={node.scaleX}
      scaleY={node.scaleY}
      opacity={node.opacity}
      draggable
      onMouseDown={onSelect}
      onTap={onSelect}
      {...commonHandlers(node.id)}
    />
  )
}

function TextItem({ node, onSelect }: ItemProps<TextNode>) {
  const ref = useRef<Konva.Text>(null)
  const [, force] = useState(0)
  const [h, setH] = useState(node.fontSize)
  // re-measure once the web font is actually available
  useEffect(() => {
    document.fonts.load(`${node.fontStyle} ${Math.round(node.fontSize)}px "${node.fontFamily}"`).then(() => force((x) => x + 1))
  }, [node.fontFamily, node.fontStyle, node.fontSize])
  useLayoutEffect(() => {
    if (ref.current) setH(ref.current.height())
  })
  return (
    <KText
      ref={ref}
      id={node.id}
      text={node.text}
      fontFamily={node.fontFamily}
      fontSize={node.fontSize}
      fontStyle={node.fontStyle}
      fill={node.fill}
      align={node.align}
      width={node.width}
      lineHeight={1.1}
      x={node.x}
      y={node.y}
      offsetX={node.width / 2}
      offsetY={h / 2}
      rotation={node.rotation}
      scaleX={node.scaleX}
      scaleY={node.scaleY}
      opacity={node.opacity}
      draggable
      onMouseDown={onSelect}
      onTap={onSelect}
      onDblClick={() => window.dispatchEvent(new Event('focus-text-editor'))}
      onDblTap={() => window.dispatchEvent(new Event('focus-text-editor'))}
      {...commonHandlers(node.id)}
    />
  )
}

export function CardCanvas() {
  const wrap = useRef<HTMLDivElement>(null)
  const stage = useRef<Konva.Stage>(null)
  const tr = useRef<Konva.Transformer>(null)
  const { w, h } = useContainerSize(wrap)
  const doc = useEditor((s) => s.doc)
  const selectedId = useEditor((s) => s.selectedId)
  const select = useEditor((s) => s.select)
  const format = getFormat(doc.formatId)
  const scale = Math.max(0.05, Math.min((w - PAD * 2) / format.width, (h - PAD * 2) / format.height))

  useEffect(() => {
    stageRef.current = stage.current
    return () => {
      stageRef.current = null
    }
  }, [])

  // attach transformer to the selected node (after it has rendered)
  useEffect(() => {
    const t = tr.current
    if (!t) return
    const target = selectedId ? stage.current?.findOne('#' + selectedId) : null
    t.nodes(target ? [target] : [])
    t.getLayer()?.batchDraw()
  })

  const onDrop = (e: React.DragEvent) => {
    const id = e.dataTransfer.getData(ASSET_MIME)
    if (!id || !stage.current) return
    e.preventDefault()
    const asset = useLibrary.getState().byId(id)
    if (!asset) return
    stage.current.setPointersPositions(e.nativeEvent)
    const p = stage.current.getPointerPosition()
    useEditor.getState().addAsset(asset, p ? { x: p.x / scale, y: p.y / scale } : undefined)
  }

  return (
    <div
      className="canvas-wrap"
      ref={wrap}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(ASSET_MIME)) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={onDrop}
      onMouseDown={(e) => {
        if (e.target === wrap.current) select(null)
      }}
    >
      <div className="card-paper" style={{ width: format.width * scale, height: format.height * scale }}>
        <Stage
          ref={stage}
          width={format.width * scale}
          height={format.height * scale}
          scaleX={scale}
          scaleY={scale}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage() || e.target.name() === 'card-bg') select(null)
          }}
          onTouchStart={(e) => {
            if (e.target === e.target.getStage() || e.target.name() === 'card-bg') select(null)
          }}
        >
          <Layer>
            <Rect name="card-bg" x={0} y={0} width={format.width} height={format.height} fill={doc.background} />
            {doc.nodes.map((n) =>
              n.type === 'image' ? (
                <ImageItem key={n.id} node={n} onSelect={() => select(n.id)} />
              ) : (
                <TextItem key={n.id} node={n} onSelect={() => select(n.id)} />
              ),
            )}
            <Transformer
              ref={tr}
              keepRatio
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
              rotationSnapTolerance={4}
              enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
              anchorSize={10}
              anchorCornerRadius={5}
              anchorStroke="#c0623f"
              anchorFill="#fffaf2"
              borderStroke="#c0623f"
              borderDash={[6, 4]}
              rotateAnchorOffset={28}
              boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 12 || Math.abs(newBox.height) < 12 ? oldBox : newBox)}
            />
          </Layer>
        </Stage>
      </div>
      {doc.nodes.length === 0 && (
        <div className="canvas-hint">
          Перетащите элементы из библиотеки на открытку
          <br />
          или нажмите «Автоколлаж»
        </div>
      )}
    </div>
  )
}
