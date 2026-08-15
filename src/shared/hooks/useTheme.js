import { useState, useEffect } from 'react'

function currentTheme() {
  const stored = localStorage.getItem('adm-theme')
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState(currentTheme)

  useEffect(() => {
    const obs = new MutationObserver(() => {
      const t = document.documentElement.dataset.theme
      if (t === 'dark' || t === 'light') setTheme(t)
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  return theme
}
