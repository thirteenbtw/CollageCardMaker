import { useEffect, useState } from 'react'

export type Route = { page: 'home' } | { page: 'library' } | { page: 'editor'; id: string }

function parse(hash: string): Route {
  const h = hash.replace(/^#\/?/, '')
  const [a, b] = h.split('/')
  if (a === 'library') return { page: 'library' }
  if (a === 'card' && b) return { page: 'editor', id: decodeURIComponent(b) }
  return { page: 'home' }
}

export const go = (path: string) => {
  window.location.hash = path
}

export function useRoute() {
  const [route, setRoute] = useState(() => parse(window.location.hash))
  useEffect(() => {
    const f = () => setRoute(parse(window.location.hash))
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return route
}
