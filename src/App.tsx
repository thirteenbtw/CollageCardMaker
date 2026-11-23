import { useEffect } from 'react'
import { useRoute } from './router'
import { Home } from './pages/Home'
import { Library } from './pages/Library'
import { EditorPage } from './editor/EditorPage'
import { AutoGenDialog } from './dialogs/AutoGen'
import { ExportDialog } from './dialogs/Export'
import { ConfirmHost, Toast } from './ui/common'
import { useLibrary } from './library'
import { useDrafts } from './drafts'

export default function App() {
  const route = useRoute()
  useEffect(() => {
    useLibrary.getState().load()
    useDrafts.getState().load()
  }, [])
  useEffect(() => {
    document.title = route.page === 'library' ? 'Библиотека — Collage Card Maker' : route.page === 'editor' ? 'Редактор — Collage Card Maker' : 'Мои открытки — Collage Card Maker'
  }, [route.page])
  return (
    <>
      {route.page === 'home' && <Home />}
      {route.page === 'library' && <Library />}
      {route.page === 'editor' && <EditorPage key={route.id} id={route.id} />}
      <AutoGenDialog />
      <ExportDialog />
      <ConfirmHost />
      <Toast />
    </>
  )
}
