import { useState } from 'react'
import { useMap, Marker, Popup } from 'react-map-gl/mapbox'
import './MapControls.css'

export const MAP_STYLES = {
  dark:      'mapbox://styles/mapbox/dark-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
}

const POI_TYPES = {
  police:   { label: 'Police',   color: '#4A90E2', Icon: PoliceIcon },
  hospital: { label: 'Hospital', color: '#F2495B', Icon: HospitalIcon },
}

async function fetchOverpassPOIs(amenity, center) {
  const query = `[out:json][timeout:15];(node["amenity"="${amenity}"](around:6000,${center.lat},${center.lng});way["amenity"="${amenity}"](around:6000,${center.lat},${center.lng}););out center;`
  const res   = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query })
  const data  = await res.json()
  return data.elements
    .map(el => ({
      id:        el.id,
      name:      el.tags?.name ?? amenity,
      lat:       el.lat ?? el.center?.lat,
      lng:       el.lon ?? el.center?.lon,
      phone:     el.tags?.phone ?? el.tags?.['contact:phone'] ?? null,
      website:   el.tags?.website ?? el.tags?.['contact:website'] ?? null,
      hours:     el.tags?.opening_hours ?? null,
      address:   [el.tags?.['addr:housenumber'], el.tags?.['addr:street'], el.tags?.['addr:city']].filter(Boolean).join(', ') || null,
      operator:  el.tags?.operator ?? null,
      emergency: el.tags?.emergency ?? null,
      beds:      el.tags?.beds ?? null,
    }))
    .filter(el => el.lat && el.lng)
}

export function MapControls({ mapStyle, onStyleChange }) {
  const { current: map } = useMap()

  const [active,      setActive]      = useState({})
  const [markers,     setMarkers]     = useState({})
  const [loading,     setLoading]     = useState({})
  const [selectedPOI, setSelectedPOI] = useState(null)

  function togglePOI(type) {
    if (active[type]) {
      setActive(a  => ({ ...a,  [type]: false }))
      setMarkers(m => ({ ...m, [type]: [] }))
      if (selectedPOI?.kind === type) setSelectedPOI(null)
      return
    }
    setActive(a  => ({ ...a,  [type]: true }))
    setLoading(l => ({ ...l, [type]: true }))
    const center = map?.getCenter() ?? { lat: 0, lng: 0 }
    fetchOverpassPOIs(type, center)
      .then(data => setMarkers(m => ({ ...m, [type]: data })))
      .finally(() => setLoading(l => ({ ...l, [type]: false })))
  }

  const poiColor   = kind => POI_TYPES[kind]?.color ?? '#AEB8BD'
  const activeStyle = (type) => active[type]
    ? { color: poiColor(type), background: `${poiColor(type)}18` }
    : {}

  return (
    <>
      <div className="mc-panel">
        {/* Style toggle */}
        <div className="mc-group mc-group--row">
          <button
            className={`mc-btn${mapStyle === 'dark'      ? ' mc-btn--active' : ''}`}
            onClick={() => onStyleChange('dark')}
          >MAP</button>
          <button
            className={`mc-btn${mapStyle === 'satellite' ? ' mc-btn--active' : ''}`}
            onClick={() => onStyleChange('satellite')}
          >SAT</button>
        </div>

        {/* Zoom */}
        <div className="mc-group">
          <button className="mc-btn mc-btn--zoom" onClick={() => map?.zoomIn({ duration: 250 })}>+</button>
          <button className="mc-btn mc-btn--zoom" onClick={() => map?.zoomOut({ duration: 250 })}>−</button>
        </div>

        {/* POI overlays */}
        <div className="mc-group">
          {Object.entries(POI_TYPES).map(([type, { label, color }]) => (
            <button
              key={type}
              className="mc-btn mc-btn--poi"
              style={activeStyle(type)}
              disabled={loading[type]}
              onClick={() => togglePOI(type)}
            >
              {loading[type]
                ? <span className="mc-spinner" />
                : <span className="mc-poi-dot" style={{ background: color }} />
              }
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* POI markers */}
      {Object.entries(POI_TYPES).map(([type, { Icon }]) =>
        (markers[type] ?? []).map(poi => (
          <Marker
            key={`${type}-${poi.id}`}
            longitude={poi.lng}
            latitude={poi.lat}
            anchor="center"
            onClick={e => { e.originalEvent.stopPropagation(); setSelectedPOI({ ...poi, kind: type }) }}
          >
            <div className={`mc-poi-marker mc-poi-marker--${type}${selectedPOI?.id === poi.id ? ' mc-poi-marker--sel' : ''}`}>
              <Icon />
              <span className="mc-poi-marker__label">{poi.name}</span>
            </div>
          </Marker>
        ))
      )}

      {/* POI popup */}
      {selectedPOI && (
        <Popup
          longitude={selectedPOI.lng}
          latitude={selectedPOI.lat}
          anchor="bottom"
          offset={22}
          closeOnClick={false}
          onClose={() => setSelectedPOI(null)}
          className="unit-popup"
        >
          <div className="upu">
            <div className="upu-head">
              <span className="upu-dot" style={{
                background: poiColor(selectedPOI.kind),
                boxShadow:  `0 0 6px ${poiColor(selectedPOI.kind)}88`,
              }} />
              <span className="upu-id">{selectedPOI.name}</span>
              <span className="upu-chip" style={{
                color:      poiColor(selectedPOI.kind),
                borderColor: `${poiColor(selectedPOI.kind)}44`,
                background:  `${poiColor(selectedPOI.kind)}18`,
              }}>
                {selectedPOI.kind.toUpperCase()}
              </span>
            </div>
            <div className="upu-rows">
              {selectedPOI.address   && <UpuRow k="ADDRESS"   v={selectedPOI.address}  wrap />}
              {selectedPOI.phone     && <UpuRow k="PHONE"     v={<a href={`tel:${selectedPOI.phone}`} style={{ color: 'inherit' }}>{selectedPOI.phone}</a>} />}
              {selectedPOI.hours     && <UpuRow k="HOURS"     v={selectedPOI.hours} />}
              {selectedPOI.operator  && <UpuRow k="OPERATOR"  v={selectedPOI.operator} />}
              {selectedPOI.beds      && <UpuRow k="BEDS"      v={selectedPOI.beds} />}
              {selectedPOI.emergency && <UpuRow k="EMERGENCY" v={selectedPOI.emergency} />}
              {selectedPOI.website   && (
                <UpuRow k="WEBSITE" v={
                  <a href={selectedPOI.website} target="_blank" rel="noreferrer" style={{ color: '#37C2B8' }}>
                    {selectedPOI.website.replace(/^https?:\/\//, '')}
                  </a>
                } />
              )}
              <UpuRow k="COORDS" v={`${selectedPOI.lat.toFixed(5)}, ${selectedPOI.lng.toFixed(5)}`} />
            </div>
          </div>
        </Popup>
      )}
    </>
  )
}

export function UpuRow({ k, v, wrap, color }) {
  return (
    <div className="upu-row">
      <span className="upu-key">{k}</span>
      <span className={`upu-val${wrap ? ' upu-val--wrap' : ''}`} style={color ? { color } : undefined}>{v}</span>
    </div>
  )
}

function PoliceIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M6 1L7.5 4H11L8.5 6.5L9.5 10L6 8L2.5 10L3.5 6.5L1 4H4.5L6 1Z" fill="currentColor"/>
    </svg>
  )
}

function HospitalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <rect x="1" y="1" width="10" height="10" rx="2" fill="currentColor" opacity="0.15"/>
      <rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M6 3.5V8.5M3.5 6H8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}
