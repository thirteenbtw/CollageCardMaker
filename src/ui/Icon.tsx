const P: Record<string, string> = {
  back: 'M15 6l-6 6 6 6',
  next: 'M5 12h14M13 6l6 6-6 6',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  sparkle: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
  copy: 'M8 8h12v12H8zM16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  unlock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M6 9l6 6 6-6',
  check: 'M5 12l5 5 9-10',
  shuffle: 'M4 7h3c5 0 5 10 10 10h3M17 14l3 3-3 3M4 17h3c1.5 0 2.5-.9 3.3-2M14 9c.8-1.2 1.8-2 3-2h3M17 4l3 3-3 3',
  toBack: 'M12 4v12M8 12l4 4 4-4M5 20h14',
  backward: 'M12 5v14M7 14l5 5 5-5',
  forward: 'M12 19V5M7 10l5-5 5 5',
  toFront: 'M12 20V8M8 12l4-4 4 4M5 4h14',
  flip: 'M12 3v18M8 7L3 12l5 5zM16 7l5 5-5 5z',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1.5 1.5 0 1 0 0 .01',
  home: 'M4 11l8-7 8 7M6 9.5V20h12V9.5',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  brush: 'M14 4l6 6-8 8-6-6zM6 12l-2.5 2.5c-1 1-1 3.5 0 4.5s3.5 1 4.5 0L10.5 16.5',
  lasso: 'M12 4c5 0 9 2.5 9 6s-4 6-9 6-9-2.5-9-6 4-6 9-6zM6 15c-1 2 0 4 2 4s2 2 1 3',
  polygon: 'M5 6l9-2 6 7-4 9-10-3zM5 6a1 1 0 1 0 0 .01M14 4a1 1 0 1 0 0 .01M20 11a1 1 0 1 0 0 .01M16 20a1 1 0 1 0 0 .01M6 17a1 1 0 1 0 0 .01',
  smart: 'M4 20c3-1 4-4 7-7l3 3c-3 3-6 4-10 4zM12 12l6-6 3 3-6 6zM18 2l.6 1.6L20 4l-1.4.4L18 6l-.6-1.6L16 4l1.4-.4zM6 4l.5 1.5L8 6l-1.5.5L6 8l-.5-1.5L4 6l1.5-.5z',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6.5 7S5 19 4 16l-1-3a1.5 1.5 0 0 1 2.7-1.2L8 15',
  scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.1 7.9L20 20M8.1 16.1L20 4M14 12l0 0',
  invert: 'M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 0 1 0 18',
  wand: 'M15 4l5 5M4 20L16 8M18 2v3M21 5h-3M8 3v2M9 4H7',
  menu: 'M4 7h16M4 12h16M4 17h16',
  layers: 'M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4',
}

export type IconName = keyof typeof P | 'more'

export function Icon({ name, size = 18, stroke = 1.9, fill }: { name: keyof typeof P | 'more'; size?: number; stroke?: number; fill?: boolean }) {
  if (name === 'more')
    return (
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <circle cx="5" cy="12" r="1.7" />
        <circle cx="12" cy="12" r="1.7" />
        <circle cx="19" cy="12" r="1.7" />
      </svg>
    )
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d={P[name]} />
    </svg>
  )
}
