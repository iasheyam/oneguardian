import { useState, useRef, useEffect, useMemo } from 'react'
import Map, { Marker, NavigationControl, AttributionControl, Source, Layer } from 'react-map-gl/mapbox'
import MapboxDraw from '@mapbox/mapbox-gl-draw'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MapSearch, MapStyleToggle, SearchPinMarker } from '../components/MapSearch'
import { searchGoogle, retrieveGoogle, viewportToBbox } from '../../../shared/utils/googlePlaces'
import { apiFetch, apiUrl } from '../../../shared/utils/api'
import './MapStudioPage.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

const MAP_STYLES = {
  dark:      'mapbox://styles/mapbox/dark-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
}

const RISK_META = {
  low:      { color: '#22c55e', label: 'LOW'  },
  medium:   { color: '#f59e0b', label: 'MED'  },
  high:     { color: '#f97316', label: 'HIGH' },
  critical: { color: '#ef4444', label: 'CRIT' },
}

const INITIAL_VIEW = { longitude: 0, latitude: 20, zoom: 1.2 }

const emptyZoneForm = () => ({ name: '', riskLevel: 'low', description: '' })

async function fetchNominatimBoundary(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=geojson&polygon_geojson=1&limit=1`
  const res  = await fetch(url, { headers: { 'User-Agent': 'TelematicsGuardian/1.0' } })
  const data = await res.json()
  const feature = data.features?.[0]
  if (!feature) return null
  const type = feature.geometry?.type
  if (type !== 'Polygon' && type !== 'MultiPolygon') return null
  return feature
}

export default function MapStudioPage() {
  const mapRef  = useRef(null)
  const drawRef = useRef(null)
  const [mapLoaded,     setMapLoaded]     = useState(false)
  const [zones,         setZones]         = useState([])
  const [zonesLoading,  setZonesLoading]  = useState(true)
  const [markers,       setMarkers]       = useState([])
  const [mode,          setMode]          = useState('view') // 'view' | 'add-zone'
  const [listSearch,    setListSearch]    = useState('')
  const [isDrawing,      setIsDrawing]      = useState(false)
  const [zoneForm,       setZoneForm]       = useState(emptyZoneForm)
  const [drawnGeometry,  setDrawnGeometry]  = useState(null)
  const [searchBoundary, setSearchBoundary] = useState(null)
  const [mapStyle,       setMapStyle]       = useState('dark')
  const [searchPin,      setSearchPin]      = useState(null)

  // Activate / deactivate draw control only when isDrawing changes
  useEffect(() => {
    if (!mapLoaded || !isDrawing) return
    const map = mapRef.current?.getMap()
    if (!map) return

    const draw = new MapboxDraw({ displayControlsDefault: false })
    map.addControl(draw)
    draw.changeMode('draw_polygon')
    drawRef.current = draw

    const onDrawCreate = e => { if (e.features?.[0]) setDrawnGeometry(e.features[0].geometry) }
    const onDrawUpdate = e => { if (e.features?.[0]) setDrawnGeometry(e.features[0].geometry) }
    map.on('draw.create', onDrawCreate)
    map.on('draw.update', onDrawUpdate)

    return () => {
      map.off('draw.create', onDrawCreate)
      map.off('draw.update', onDrawUpdate)
      try { if (map.hasControl(draw)) map.removeControl(draw) } catch {}
      drawRef.current = null
    }
  }, [isDrawing, mapLoaded])

  useEffect(() => {
    apiFetch(apiUrl('/api/zones'))
      .then(r => r.json())
      .then(setZones)
      .catch(err => console.error('[MapStudio] Failed to load zones:', err))
      .finally(() => setZonesLoading(false))
  }, [])

  const zonesGeoJSON = useMemo(() => ({
    type: 'FeatureCollection',
    features: zones.filter(z => z.geometry).map(z => ({
      type:       'Feature',
      id:         z.id,
      geometry:   z.geometry,
      properties: { color: RISK_META[z.riskLevel]?.color ?? '#22c55e' },
    })),
  }), [zones])

  function useBoundaryAsZone() {
    if (!searchBoundary?.geometry) return
    setDrawnGeometry(searchBoundary.geometry)
    setIsDrawing(false)
  }

  function enterAddZone() {
    setZoneForm(emptyZoneForm())
    setDrawnGeometry(null)
    setIsDrawing(false)
    setMode('add-zone')
  }

  function cancelAddZone() {
    setIsDrawing(false)
    setDrawnGeometry(null)
    setSearchBoundary(null)
    setMode('view')
  }

  function startDrawing() {
    setDrawnGeometry(null)
    setIsDrawing(true)
  }

  function redraw() {
    setDrawnGeometry(null)
    if (drawRef.current) {
      drawRef.current.deleteAll()
      drawRef.current.changeMode('draw_polygon')
    } else {
      setIsDrawing(false)
      setTimeout(() => setIsDrawing(true), 50)
    }
  }

  function flyTo(lng, lat, bbox) {
    if (bbox) {
      mapRef.current?.fitBounds(
        [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
        { padding: 80, duration: 1000, maxZoom: 15 }
      )
    } else {
      mapRef.current?.flyTo({ center: [lng, lat], zoom: 15, duration: 1000 })
    }
  }

  function flyToZone(zone) {
    if (!zone.geometry) return
    const { type, coordinates } = zone.geometry
    const rings = type === 'MultiPolygon'
      ? coordinates.flatMap(poly => poly[0])
      : coordinates[0]
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
    for (const [lng, lat] of rings) {
      minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng)
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat)
    }
    mapRef.current?.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 80, duration: 900 })
  }

  async function saveZone() {
    if (!zoneForm.name.trim() || !drawnGeometry) return
    try {
      const res = await apiFetch(apiUrl('/api/zones'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:        zoneForm.name.trim(),
          description: zoneForm.description.trim() || null,
          riskLevel:   zoneForm.riskLevel,
          geometry:    drawnGeometry,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const zone = await res.json()
      setZones(p => [...p, zone])
    } catch (err) {
      console.error('[MapStudio] Save zone failed:', err)
    }
    setIsDrawing(false)
    setDrawnGeometry(null)
    setSearchBoundary(null)
    setMode('view')
  }

  const canSave = zoneForm.name.trim().length > 0 && drawnGeometry != null

  return (
    <div className="map-studio">

      {/* ── left panel ────────────────────────── */}
      <aside className="ms-panel">
        {mode === 'add-zone' ? (
          <ZoneForm
            form={zoneForm}
            onChange={patch => setZoneForm(p => ({ ...p, ...patch }))}
            hasGeometry={drawnGeometry != null}
            isDrawing={isDrawing}
            canSave={canSave}
            searchBoundary={searchBoundary}
            onStartDrawing={startDrawing}
            onRedraw={redraw}
            onFlyTo={flyTo}
            onBoundaryFound={setSearchBoundary}
            onUseBoundary={useBoundaryAsZone}
            onSave={saveZone}
            onCancel={cancelAddZone}
          />
        ) : (
          <>
            {/* ── search ── */}
            <div className="ms-list-search">
              <SearchIcon />
              <input
                className="ms-list-search__input"
                placeholder="Search zones and markers…"
                value={listSearch}
                onChange={e => setListSearch(e.target.value)}
              />
              {listSearch && (
                <button className="ms-list-search__clear" onClick={() => setListSearch('')}>×</button>
              )}
            </div>

            {/* ── zones ── */}
            {(() => {
              const q = listSearch.trim().toLowerCase()
              const filtered = q ? zones.filter(z => z.name.toLowerCase().includes(q)) : zones
              return (
                <div className="ms-section">
                  <div className="ms-section__header">
                    <span className="ms-section__label">ZONES</span>
                    <span className="ms-section__count">{filtered.length}</span>
                    <div className="ms-section__spacer" />
                    <button className="ms-add-btn" onClick={enterAddZone}>
                      <PlusIcon /><span>Add Zone</span>
                    </button>
                  </div>
                  <ul className="ms-list" role="list">
                    {filtered.length === 0
                      ? <li className="ms-list__empty">{q ? 'No zones match' : 'No zones yet'}</li>
                      : filtered.map(z => (
                          <ZoneItem key={z.id} zone={z}
                            onDelete={async () => {
                              await apiFetch(apiUrl(`/api/zones/${z.id}`), { method: 'DELETE' })
                              setZones(p => p.filter(x => x.id !== z.id))
                            }}
                            onFlyTo={() => flyToZone(z)} />
                        ))
                    }
                  </ul>
                </div>
              )
            })()}

            <div className="ms-divider" />

            {/* ── markers ── */}
            {(() => {
              const q = listSearch.trim().toLowerCase()
              const filtered = q ? markers.filter(m => m.name.toLowerCase().includes(q)) : markers
              return (
                <div className="ms-section">
                  <div className="ms-section__header">
                    <span className="ms-section__label">MARKERS</span>
                    <span className="ms-section__count">{filtered.length}</span>
                    <div className="ms-section__spacer" />
                    <button className="ms-add-btn">
                      <PlusIcon /><span>Add Marker</span>
                    </button>
                  </div>
                  <ul className="ms-list" role="list">
                    {filtered.length === 0
                      ? <li className="ms-list__empty">{q ? 'No markers match' : 'No markers yet'}</li>
                      : filtered.map(m => (
                          <MarkerItem key={m.id} marker={m}
                            onDelete={() => setMarkers(p => p.filter(x => x.id !== m.id))} />
                        ))
                    }
                  </ul>
                </div>
              )
            })()}
          </>
        )}
      </aside>

      {/* ── map ───────────────────────────────── */}
      <div className="ms-map">
        <Map
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={INITIAL_VIEW}
          style={{ width: '100%', height: '100%' }}
          mapStyle={MAP_STYLES[mapStyle]}
          projection="globe"
          attributionControl={false}
          onLoad={e => {
            const map = e.target
            function syncFog() {
              const name = map.getStyle()?.name ?? ''
              if (name.toLowerCase().includes('satellite')) {
                try { map.setFog(null) } catch {}
              } else {
                map.setFog({
                  color:            'rgb(10, 14, 18)',
                  'high-color':     'rgb(30, 60, 120)',
                  'horizon-blend':  0.02,
                  'space-color':    'rgb(5, 8, 15)',
                  'star-intensity': 0.5,
                })
              }
            }
            syncFog()
            map.on('style.load', syncFog)
            setMapLoaded(true)
          }}
        >
          <NavigationControl position="bottom-right" showCompass={false} />
          <AttributionControl compact position="bottom-left" />

          <MapSearch onFlyTo={flyTo} onPin={setSearchPin} />
          <MapStyleToggle style={mapStyle} onChange={setMapStyle} />

          {searchPin && (
            <Marker longitude={searchPin.lng} latitude={searchPin.lat} anchor="bottom">
              <SearchPinMarker onDismiss={() => setSearchPin(null)} />
            </Marker>
          )}

          {searchBoundary && (
            <Source id="search-boundary" type="geojson" data={searchBoundary}>
              <Layer id="search-boundary-fill" type="fill"
                paint={{ 'fill-color': '#37C2B8', 'fill-opacity': 0.07 }} />
              <Layer id="search-boundary-outline" type="line"
                paint={{ 'line-color': '#37C2B8', 'line-width': 2, 'line-opacity': 0.7, 'line-dasharray': [4, 3] }} />
            </Source>
          )}

          <Source id="zones" type="geojson" data={zonesGeoJSON}>
            <Layer id="zones-fill" type="fill"
              paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.2 }} />
            <Layer id="zones-outline" type="line"
              paint={{ 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.8 }} />
          </Source>

          {isDrawing && (
            <div className="ms-draw-hint">
              Click to place points &middot; Double-click to close shape
            </div>
          )}
        </Map>
      </div>

    </div>
  )
}

/* ─────────────────────────────────────────
   Zone form
───────────────────────────────────────── */
function ZoneForm({ form, onChange, hasGeometry, isDrawing, canSave, searchBoundary, onStartDrawing, onRedraw, onFlyTo, onBoundaryFound, onUseBoundary, onSave, onCancel }) {
  const [sessionToken]  = useState(() => crypto.randomUUID())
  const debounceRef     = useRef(null)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [suggestions,   setSuggestions]   = useState([])
  const [searchOpen,    setSearchOpen]    = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)

  function handleSearchChange(e) {
    const q = e.target.value
    setSearchQuery(q)
    clearTimeout(debounceRef.current)
    if (!q.trim()) { setSuggestions([]); setSearchOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true)
      const results = await searchGoogle(q, sessionToken).catch(() => [])
      setSuggestions(results)
      setSearchOpen(results.length > 0)
      setSearchLoading(false)
    }, 350)
  }

  async function handleSuggestionClick(s) {
    const placeName = s.name + (s.context ? `, ${s.context}` : '')
    setSearchQuery(placeName)
    setSearchOpen(false)
    setSuggestions([])

    // Navigate the map via Google viewport bounds
    const place = await retrieveGoogle(s.placeId).catch(() => null)
    if (place) {
      const bbox = viewportToBbox(place.viewport)
      if (bbox) {
        onFlyTo(null, null, bbox)
      } else if (place.location) {
        onFlyTo(place.location.longitude, place.location.latitude, null)
      }
    }

    // Fetch and display the boundary polygon from Nominatim
    fetchNominatimBoundary(placeName)
      .then(boundary => onBoundaryFound(boundary))
      .catch(() => onBoundaryFound(null))
  }

  return (
    <div className="ms-zone-form">
      <div className="ms-form-header">
        <button className="ms-form-back" onClick={onCancel} aria-label="Cancel">
          <BackIcon />
        </button>
        <span className="ms-form-title">ADD ZONE</span>
      </div>

      <div className="ms-form-body">

        {/* Name */}
        <div className="ms-field">
          <label className="ms-label">NAME <span className="ms-required">*</span></label>
          <input
            className="ms-input"
            placeholder="e.g. Zone 18"
            value={form.name}
            onChange={e => onChange({ name: e.target.value })}
            autoFocus
          />
        </div>

        {/* Risk level */}
        <div className="ms-field">
          <label className="ms-label">RISK LEVEL</label>
          <div className="ms-risk-picker">
            {Object.entries(RISK_META).map(([key, { color, label }]) => (
              <button
                key={key}
                className={`ms-risk-btn${form.riskLevel === key ? ' active' : ''}`}
                style={form.riskLevel === key
                  ? { background: color, borderColor: color, color: '#0a0e10' }
                  : { borderColor: `${color}55`, color }
                }
                onClick={() => onChange({ riskLevel: key })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="ms-field">
          <label className="ms-label">
            DESCRIPTION <span className="ms-optional">optional</span>
          </label>
          <textarea
            className="ms-input ms-textarea"
            placeholder="Brief description…"
            value={form.description}
            onChange={e => onChange({ description: e.target.value })}
            rows={2}
          />
        </div>

        <div className="ms-form-separator" />

        {/* Location search */}
        <div className="ms-field">
          <label className="ms-label">NAVIGATE TO LOCATION</label>
          <div className="ms-search-wrap">
            <div className="ms-search-input-row">
              <SearchIcon />
              <input
                className="ms-search-input"
                placeholder="Search a place…"
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={() => suggestions.length > 0 && setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              />
              {searchLoading && <span className="ms-search-spinner" />}
            </div>
            {searchOpen && (
              <ul className="ms-search-results">
                {suggestions.map(s => (
                  <li key={s.placeId}>
                    <button
                      className="ms-search-result"
                      onMouseDown={e => { e.preventDefault(); handleSuggestionClick(s) }}
                    >
                      <span className="ms-search-result__name">{s.name}</span>
                      {s.context && (
                        <span className="ms-search-result__context">{s.context}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Boundary found — offer to use it */}
        {searchBoundary && (
          <div className="ms-boundary-found">
            <div className="ms-boundary-found__info">
              <span className="ms-boundary-found__dot" />
              <span className="ms-boundary-found__label">Boundary found on map</span>
            </div>
            <button
              className={`ms-use-boundary-btn${hasGeometry ? ' used' : ''}`}
              onClick={onUseBoundary}
            >
              {hasGeometry ? '✓ Using this boundary' : 'Use as Zone Boundary'}
            </button>
          </div>
        )}

        <div className="ms-form-separator" />

        {/* Draw section */}
        <div className="ms-draw-section">
          <div className={`ms-draw-status${hasGeometry ? ' ms-draw-status--done' : ''}`}>
            <span className="ms-draw-status__dot" />
            <span className="ms-draw-status__text">
              {hasGeometry ? 'Zone boundary drawn' : isDrawing ? 'Drawing — click to place points' : 'No boundary drawn yet'}
            </span>
          </div>

          {!isDrawing && !hasGeometry && (
            <button className="ms-draw-start-btn" onClick={onStartDrawing}>
              <DrawIcon />
              Start Drawing
            </button>
          )}

          {(isDrawing || hasGeometry) && (
            <button className="ms-draw-redo-btn" onClick={onRedraw}>
              <RedrawIcon />
              {hasGeometry ? 'Redraw' : 'Restart'}
            </button>
          )}
        </div>

      </div>

      <div className="ms-form-footer">
        <button className="ms-btn ms-btn--ghost" onClick={onCancel}>Cancel</button>
        <button className="ms-btn ms-btn--primary" onClick={onSave} disabled={!canSave}>
          Save Zone
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────
   List items
───────────────────────────────────────── */
function ZoneItem({ zone, onDelete, onFlyTo }) {
  const risk = RISK_META[zone.riskLevel] ?? RISK_META.low
  return (
    <li>
      <div className="ms-item" onClick={onFlyTo} role="button" tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && onFlyTo()}>
        <span className="ms-item__bar" style={{ background: risk.color }} />
        <span className="ms-item__name">{zone.name}</span>
        <span className="ms-item__badge"
          style={{ color: risk.color, borderColor: `${risk.color}44`, background: `${risk.color}18` }}>
          {risk.label}
        </span>
        <button className="ms-item__delete" title="Delete"
          onClick={e => { e.stopPropagation(); onDelete() }}>
          <TrashIcon />
        </button>
      </div>
    </li>
  )
}

function MarkerItem({ marker, onDelete }) {
  const risk = RISK_META[marker.riskLevel] ?? RISK_META.low
  return (
    <li>
      <div className="ms-item">
        <span className="ms-item__dot"
          style={{ background: risk.color, boxShadow: `0 0 6px ${risk.color}66` }} />
        <span className="ms-item__name">{marker.name}</span>
        <span className="ms-item__category">{marker.category ?? 'POI'}</span>
        <button className="ms-item__delete" title="Delete" onClick={onDelete}>
          <TrashIcon />
        </button>
      </div>
    </li>
  )
}

/* ─────────────────────────────────────────
   Icons
───────────────────────────────────────── */
function PlusIcon() {
  return <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
    <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
}

function TrashIcon() {
  return <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
    <path d="M1.5 3h10M5 3V2h3v1M3 3l.5 8h6L10 3"
      stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
}

function BackIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
}

function SearchIcon() {
  return <svg className="ms-search-icon" width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
    <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M9 9L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
}

function DrawIcon() {
  return <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
    <path d="M2 11L5 10L11 4L9 2L3 8L2 11Z" stroke="currentColor" strokeWidth="1.3"
      strokeLinejoin="round"/>
    <path d="M9 2L11 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
}

function RedrawIcon() {
  return <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
    <path d="M2 7a5 5 0 019.5-2M11 2v3H8" stroke="currentColor" strokeWidth="1.3"
      strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M11 6a5 5 0 01-9.5 2" stroke="currentColor" strokeWidth="1.3"
      strokeLinecap="round"/>
  </svg>
}
