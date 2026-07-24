import { useState, useRef } from 'react'
import { searchGoogle, retrieveGoogle, viewportToBbox } from '../../../shared/utils/googlePlaces'
import './MapSearch.css'

export function MapSearch({ onFlyTo, onPin }) {
  const [sessionToken] = useState(() => crypto.randomUUID())
  const debounceRef   = useRef(null)
  const [query,       setQuery]       = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [open,        setOpen]        = useState(false)
  const [loading,     setLoading]     = useState(false)

  function handleChange(e) {
    const q = e.target.value
    setQuery(q)
    clearTimeout(debounceRef.current)
    if (!q.trim()) { setSuggestions([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      const results = await searchGoogle(q, sessionToken).catch(() => [])
      setSuggestions(results)
      setOpen(results.length > 0)
      setLoading(false)
    }, 350)
  }

  function clear() {
    setQuery('')
    setSuggestions([])
    setOpen(false)
    clearTimeout(debounceRef.current)
    onPin?.(null)
  }

  async function handleSelect(s) {
    setQuery(s.name + (s.context ? `, ${s.context}` : ''))
    setOpen(false)
    setSuggestions([])
    onPin?.(null)
    const place = await retrieveGoogle(s.placeId).catch(() => null)
    if (!place) return
    const bbox = viewportToBbox(place.viewport)
    if (bbox) {
      onFlyTo(null, null, bbox)
    } else if (place.location) {
      onFlyTo(place.location.longitude, place.location.latitude, null)
    }
    if (place.location) {
      onPin?.({ lng: place.location.longitude, lat: place.location.latitude })
    }
  }

  return (
    <div className="map-search">
      <div className="map-search__bar">
        <SearchIcon />
        <input
          className="map-search__input"
          placeholder="Search places…"
          value={query}
          onChange={handleChange}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {loading && <span className="map-search__spinner" />}
        {query && !loading && (
          <button className="map-search__clear" onClick={clear} aria-label="Clear">×</button>
        )}
      </div>

      {open && (
        <ul className="map-search__results">
          {suggestions.map(s => (
            <li key={s.placeId}>
              <button
                className="map-search__result"
                onMouseDown={e => { e.preventDefault(); handleSelect(s) }}
              >
                <span className="map-search__result-name">{s.name}</span>
                {s.context && (
                  <span className="map-search__result-ctx">{s.context}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}


export function SearchPinMarker({ onDismiss }) {
  return (
    <div className="search-pin" onClick={onDismiss} title="Click to dismiss">
      <svg width="22" height="28" viewBox="0 0 22 28" fill="none" aria-hidden>
        <path d="M11 0C4.92 0 0 4.92 0 11c0 8.25 11 17 11 17S22 19.25 22 11C22 4.92 17.08 0 11 0z"
          fill="#37C2B8" />
        <circle cx="11" cy="11" r="4.5" fill="white" />
      </svg>
    </div>
  )
}

function SearchIcon() {
  return (
    <svg className="map-search__icon" width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M9 9L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}
