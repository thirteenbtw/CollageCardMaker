import { nanoid } from 'nanoid'
import { db } from './db'
import { useEditor } from './editor'
import { getFormat } from './formats'
import { renderCard } from './exporters'
import { stageRef } from './stageRef'

export async function saveCurrentDraft() {
  const ed = useEditor.getState()
  const stage = stageRef.current
  const thumbnail = stage ? renderCard(stage, getFormat(ed.doc.formatId), 'image/jpeg', 480) : ''
  const id = ed.draftId ?? nanoid()
  await db.putDraft({ id, name: ed.draftName || 'Без названия', doc: structuredClone(ed.doc), thumbnail, updatedAt: Date.now() })
  ed.markSaved(id, ed.draftName)
  return id
}
