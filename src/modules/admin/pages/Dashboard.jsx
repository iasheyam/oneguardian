import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Map, { Marker, Popup, NavigationControl, AttributionControl } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useLivePositions } from '../../../shared/hooks/useLivePositions'
import './Dashboard.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

const STATUS_META = {
  normal:  { color: '#37C2B8', label: 'SECURE'  },
  warning: { color: '#E0A63C', label: 'WARNING' },
  duress:  { color: '#F2495B', label: 'DURESS'  },
  offline: { color: '#66727A', label: 'OFFLINE' },
}

const FILTER_DEFS = [
  { key: 'all',     label: 'ALL'     },
  { key: 'warning', label: 'WARN'    },
  { key: 'normal',  label: 'SECURE'  },
  { key: 'offline', label: 'OFFLINE' },
]

const INITIAL_VIEW = {
  longitude: -90.5069,
  latitude:  14.5980,
  zoom:      12.5,
}

export default function Dashboard({ units }) {
  const [filter,       setFilter]     = useState('all')
  const [search,       setSearch]     = useState('')
  const [selectedId,   setSelectedId] = useState(units[0]?.id ?? null)
  const [popupId,      setPopupId]    = useState(null)
  const [showPolice,      setShowPolice]      = useState(false)
  const [showHospital,    setShowHospital]    = useState(false)
  const [policeMarkers,   setPoliceMarkers]   = useState([])
  const [hospitalMarkers, setHospitalMarkers] = useState([])
  const [loadingPolice,   setLoadingPolice]   = useState(false)
  const [loadingHospital, setLoadingHospital] = useState(false)
  const [selectedPOI,     setSelectedPOI]     = useState(null)
  const mapRef = useRef(null)
  const navigate = useNavigate()

  async function fetchOverpassPOIs(amenity) {
    const center = mapRef.current?.getCenter() ?? { lng: INITIAL_VIEW.longitude, lat: INITIAL_VIEW.latitude }
    const query = `[out:json][timeout:15];(node["amenity"="${amenity}"](around:6000,${center.lat},${center.lng});way["amenity"="${amenity}"](around:6000,${center.lat},${center.lng}););out center;`
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    })
    const data = await res.json()
    return data.elements
      .map(el => ({
        id:       el.id,
        name:     el.tags?.name ?? amenity,
        lat:      el.lat ?? el.center?.lat,
        lng:      el.lon ?? el.center?.lon,
        phone:    el.tags?.phone ?? el.tags?.['contact:phone'] ?? null,
        website:  el.tags?.website ?? el.tags?.['contact:website'] ?? null,
        hours:    el.tags?.opening_hours ?? null,
        address:  [el.tags?.['addr:housenumber'], el.tags?.['addr:street'], el.tags?.['addr:city']].filter(Boolean).join(', ') || null,
        operator: el.tags?.operator ?? null,
        emergency: el.tags?.emergency ?? null,
        beds:     el.tags?.beds ?? null,
      }))
      .filter(el => el.lat && el.lng)
  }

  useEffect(() => {
    if (!showPolice) { setPoliceMarkers([]); return }
    setLoadingPolice(true)
    fetchOverpassPOIs('police')
      .then(setPoliceMarkers)
      .finally(() => setLoadingPolice(false))
  }, [showPolice])

  useEffect(() => {
    if (!showHospital) { setHospitalMarkers([]); return }
    setLoadingHospital(true)
    fetchOverpassPOIs('hospital')
      .then(setHospitalMarkers)
      .finally(() => setLoadingHospital(false))
  }, [showHospital])

  const livePositions = useLivePositions()

  // Merge live Traccar positions into units; mock coords used as fallback
  const mergedUnits = useMemo(() => units.map(unit => {
    if (!unit.traccarDeviceId) return unit
    const pos = livePositions[unit.traccarDeviceId]
    if (!pos) return unit
    return {
      ...unit,
      lat:         pos.latitude,
      lng:         pos.longitude,
      speed:       Math.round(pos.speed * 1.852), // knots → kph
      heading:     pos.course,
      isLive:      true,
      lastUpdated: 'LIVE',
    }
  }), [units, livePositions])

  const counts = useMemo(() => ({
    total:   mergedUnits.length,
    warning: mergedUnits.filter(u => u.status === 'warning').length,
    normal:  mergedUnits.filter(u => u.status === 'normal').length,
    offline: mergedUnits.filter(u => u.status === 'offline').length,
    duress:  mergedUnits.filter(u => u.status === 'duress').length,
  }), [mergedUnits])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return mergedUnits
      .filter(u => filter === 'all' || u.status === filter)
      .filter(u => !q || [u.id, u.callsign, u.principal, u.agent].join(' ').toLowerCase().includes(q))
  }, [mergedUnits, filter, search])

  const groups = useMemo(() => {
    const byStatus = (a, b) => {
      const order = { duress: 0, warning: 1, normal: 2, offline: 3 }
      return (order[a.status] ?? 4) - (order[b.status] ?? 4)
    }
    return {
      vehicles: filtered.filter(u => u.type === 'vehicle').sort(byStatus),
      people:   filtered.filter(u => u.type === 'person').sort(byStatus),
    }
  }, [filtered])

  const selected = mergedUnits.find(u => u.id === selectedId)

  function selectUnit(id) {
    setSelectedId(id)
    setPopupId(id)
    const unit = mergedUnits.find(u => u.id === id)
    if (unit && mapRef.current) {
      mapRef.current.flyTo({
        center:   [unit.lng, unit.lat],
        zoom:     14,
        duration: 900,
      })
    }
  }

  return (
    <div className="dashboard">
      {/* ── left panel ─────────────────────────── */}
      <aside className="dash-panel">
        {/* filter tabs */}
        <div className="filter-tabs">
          {FILTER_DEFS.map(tab => {
            const count = tab.key === 'all' ? counts.total : counts[tab.key]
            const active = filter === tab.key
            const statusColor = STATUS_META[tab.key]?.color
            return (
              <button
                key={tab.key}
                className={`filter-tab${active ? ' active' : ''}`}
                style={active && statusColor ? {
                  background: statusColor,
                  borderColor: statusColor,
                  color: '#0A0E10',
                } : {}}
                onClick={() => setFilter(tab.key)}
              >
                {tab.label}
                <span className="filter-tab__count">{count}</span>
              </button>
            )
          })}
        </div>

        {/* search */}
        <div className="dash-search">
          <SearchIcon />
          <input
            className="dash-search__input"
            type="text"
            placeholder="Search units, principals, agents…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* unit list */}
        <ul className="unit-list" role="list">
          {filtered.length === 0 && (
            <li className="unit-list__empty">No units match</li>
          )}

          {groups.vehicles.length > 0 && (
            <>
              <UnitGroupHeader label="VEHICLES" count={groups.vehicles.length} />
              {groups.vehicles.map(unit => (
                <UnitCardItem
                  key={unit.id}
                  unit={unit}
                  selected={unit.id === selectedId}
                  onSelect={selectUnit}
                />
              ))}
            </>
          )}

          {groups.people.length > 0 && (
            <>
              <UnitGroupHeader label="PEOPLE" count={groups.people.length} />
              {groups.people.map(unit => (
                <UnitCardItem
                  key={unit.id}
                  unit={unit}
                  selected={unit.id === selectedId}
                  onSelect={selectUnit}
                />
              ))}
            </>
          )}
        </ul>
      </aside>

      {/* ── map area ───────────────────────────── */}
      <div className="dash-map">
        <Map
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={INITIAL_VIEW}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          attributionControl={false}
        >
          <NavigationControl position="bottom-right" showCompass={false} />
          <AttributionControl compact position="bottom-left" />

          {/* Police station markers */}
          {policeMarkers.map(poi => (
            <Marker key={poi.id} longitude={poi.lng} latitude={poi.lat} anchor="center"
              onClick={e => { e.originalEvent.stopPropagation(); setSelectedPOI({ ...poi, kind: 'police' }) }}>
              <div className={`poi-marker poi-marker--police${selectedPOI?.id === poi.id ? ' selected' : ''}`}>
                <PoliceIcon />
                <span className="poi-marker__label">{poi.name}</span>
              </div>
            </Marker>
          ))}

          {/* Hospital markers */}
          {hospitalMarkers.map(poi => (
            <Marker key={poi.id} longitude={poi.lng} latitude={poi.lat} anchor="center"
              onClick={e => { e.originalEvent.stopPropagation(); setSelectedPOI({ ...poi, kind: 'hospital' }) }}>
              <div className={`poi-marker poi-marker--hospital${selectedPOI?.id === poi.id ? ' selected' : ''}`}>
                <HospitalIcon />
                <span className="poi-marker__label">{poi.name}</span>
              </div>
            </Marker>
          ))}

          {/* POI detail popup */}
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
                    background: selectedPOI.kind === 'police' ? '#4A90E2' : '#F2495B',
                    boxShadow: `0 0 6px ${selectedPOI.kind === 'police' ? '#4A90E288' : '#F2495B88'}`,
                  }} />
                  <span className="upu-id">{selectedPOI.name}</span>
                  <span className="upu-chip" style={selectedPOI.kind === 'police'
                    ? { color: '#4A90E2', borderColor: '#4A90E244', background: '#4A90E218' }
                    : { color: '#F2495B', borderColor: '#F2495B44', background: '#F2495B18' }}>
                    {selectedPOI.kind === 'police' ? 'POLICE' : 'HOSPITAL'}
                  </span>
                </div>
                <div className="upu-rows">
                  {selectedPOI.address && (
                    <div className="upu-row">
                      <span className="upu-key">ADDRESS</span>
                      <span className="upu-val upu-val--wrap">{selectedPOI.address}</span>
                    </div>
                  )}
                  {selectedPOI.phone && (
                    <div className="upu-row">
                      <span className="upu-key">PHONE</span>
                      <span className="upu-val">
                        <a href={`tel:${selectedPOI.phone}`} style={{ color: 'inherit' }}>{selectedPOI.phone}</a>
                      </span>
                    </div>
                  )}
                  {selectedPOI.hours && (
                    <div className="upu-row">
                      <span className="upu-key">HOURS</span>
                      <span className="upu-val">{selectedPOI.hours}</span>
                    </div>
                  )}
                  {selectedPOI.operator && (
                    <div className="upu-row">
                      <span className="upu-key">OPERATOR</span>
                      <span className="upu-val">{selectedPOI.operator}</span>
                    </div>
                  )}
                  {selectedPOI.beds && (
                    <div className="upu-row">
                      <span className="upu-key">BEDS</span>
                      <span className="upu-val">{selectedPOI.beds}</span>
                    </div>
                  )}
                  {selectedPOI.emergency && (
                    <div className="upu-row">
                      <span className="upu-key">EMERGENCY</span>
                      <span className="upu-val">{selectedPOI.emergency}</span>
                    </div>
                  )}
                  {selectedPOI.website && (
                    <div className="upu-row">
                      <span className="upu-key">WEBSITE</span>
                      <span className="upu-val">
                        <a href={selectedPOI.website} target="_blank" rel="noreferrer" style={{ color: '#37C2B8' }}>
                          {selectedPOI.website.replace(/^https?:\/\//, '')}
                        </a>
                      </span>
                    </div>
                  )}
                  <div className="upu-row">
                    <span className="upu-key">COORDS</span>
                    <span className="upu-val">{selectedPOI.lat.toFixed(5)}, {selectedPOI.lng.toFixed(5)}</span>
                  </div>
                </div>
              </div>
            </Popup>
          )}

          {/* POI toggles overlay */}
          <div className="map-poi-toggles">
            <button
              className={`map-poi-btn${showPolice ? ' active' : ''}`}
              style={showPolice ? { borderColor: '#4A90E2', color: '#4A90E2', background: '#4A90E218' } : {}}
              onClick={() => setShowPolice(v => !v)}
              disabled={loadingPolice}
            >
              {loadingPolice
                ? <span className="map-poi-btn__spinner" />
                : <span className="map-poi-btn__dot" style={{ background: '#4A90E2' }} />}
              Police
            </button>
            <button
              className={`map-poi-btn${showHospital ? ' active' : ''}`}
              style={showHospital ? { borderColor: '#F2495B', color: '#F2495B', background: '#F2495B18' } : {}}
              onClick={() => setShowHospital(v => !v)}
              disabled={loadingHospital}
            >
              {loadingHospital
                ? <span className="map-poi-btn__spinner" />
                : <span className="map-poi-btn__dot" style={{ background: '#F2495B' }} />}
              Hospital
            </button>
          </div>

          {mergedUnits.map(unit => {
            const meta    = STATUS_META[unit.status] ?? STATUS_META.offline
            const isSel   = unit.id === selectedId
            const isPulse = unit.status === 'warning' || unit.status === 'duress' || isSel
            const zIndex  = unit.status === 'duress' ? 8 : isSel ? 6 : 3

            return (
              <Marker
                key={unit.id}
                longitude={unit.lng}
                latitude={unit.lat}
                anchor="center"
                style={{ zIndex }}
                onClick={e => { e.originalEvent.stopPropagation(); selectUnit(unit.id) }}
              >
                <div className={`map-marker${isSel ? ' selected' : ''} status-${unit.status}`}>
                  <div className="marker-dot-wrap">
                    {isPulse && (
                      <span className="marker-ring" style={{ background: meta.color }} />
                    )}
                    <span
                      className="marker-dot"
                      style={{
                        background: meta.color,
                        width:  isSel || unit.status === 'duress' ? '15px' : '11px',
                        height: isSel || unit.status === 'duress' ? '15px' : '11px',
                        boxShadow: unit.status !== 'offline'
                          ? `0 0 0 2px ${meta.color}38, 0 0 14px ${meta.color}99`
                          : 'none',
                      }}
                    />
                  </div>
                  <span
                    className="marker-label"
                    style={{
                      color:       isSel ? '#EEF2F3' : '#AEB8BD',
                      borderColor: `${meta.color}66`,
                    }}
                  >
                    {unit.id} · {unit.callsign}
                  </span>
                </div>
              </Marker>
            )
          })}

          {popupId && (() => {
            const unit = mergedUnits.find(u => u.id === popupId)
            if (!unit) return null
            const meta = STATUS_META[unit.status] ?? STATUS_META.offline
            return (
              <Popup
                longitude={unit.lng}
                latitude={unit.lat}
                anchor="bottom"
                offset={22}
                closeOnClick={false}
                onClose={() => setPopupId(null)}
                className="unit-popup"
              >
                <div className="upu">
                  <div className="upu-head">
                    <span className="upu-dot" style={{ background: meta.color, boxShadow: `0 0 6px ${meta.color}88` }} />
                    <span className="upu-id">{unit.id} · {unit.callsign}</span>
                    <span className="upu-chip" style={{ color: meta.color, borderColor: `${meta.color}44`, background: `${meta.color}18` }}>
                      {meta.label}
                    </span>
                  </div>
                  <div className="upu-rows">
                    <div className="upu-row">
                      <span className="upu-key">PRINCIPAL</span>
                      <span className="upu-val">{unit.principal}</span>
                    </div>
                    {unit.agent && unit.agent !== '—' && (
                      <div className="upu-row">
                        <span className="upu-key">AGENT</span>
                        <span className="upu-val">{unit.agent}</span>
                      </div>
                    )}
                    {unit.vehicle && (
                      <div className="upu-row">
                        <span className="upu-key">VEHICLE</span>
                        <span className="upu-val">{unit.vehicle}</span>
                      </div>
                    )}
                    <div className="upu-row">
                      <span className="upu-key">LOCATION</span>
                      <span className="upu-val">{unit.location}</span>
                    </div>
                    <div className="upu-row">
                      <span className="upu-key">SPEED</span>
                      <span className="upu-val" style={{ color: unit.status === 'offline' ? '#66727A' : undefined }}>
                        {unit.status === 'offline' ? 'NO SIGNAL' : `${unit.speed} KPH`}
                      </span>
                    </div>
                    <div className="upu-row">
                      <span className="upu-key">UPDATED</span>
                      <span className="upu-val" style={unit.isLive ? { color: '#37C2B8' } : undefined}>
                        {unit.isLive ? '● LIVE' : `${unit.lastUpdated} ago`}
                      </span>
                    </div>
                  </div>
                  <button className="upu-open" onClick={() => navigate(`/admin/unit/${unit.id}`)}>
                    OPEN DETAIL →
                  </button>
                </div>
              </Popup>
            )
          })()}
        </Map>
      </div>
    </div>
  )
}

function UnitGroupHeader({ label, count }) {
  return (
    <li className="unit-group-header" aria-label={`${label} section`}>
      <span className="unit-group-header__label">{label}</span>
      <span className="unit-group-header__line" aria-hidden />
      <span className="unit-group-header__count">{count}</span>
    </li>
  )
}

function UnitCardItem({ unit, selected, onSelect }) {
  const navigate = useNavigate()
  const meta     = STATUS_META[unit.status] ?? STATUS_META.offline
  const speed    = unit.status === 'offline' ? 'NO SIGNAL' : `${unit.speed} MPH`

  return (
    <li>
      <div
        className={`unit-card${selected ? ' selected' : ''}`}
        onClick={() => onSelect(unit.id)}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onKeyDown={e => e.key === 'Enter' && onSelect(unit.id)}
      >
        <span
          className="unit-card__bar"
          style={{ background: meta.color, opacity: selected ? 1 : 0.45 }}
        />

        <div className="unit-card__head">
          <span
            className="unit-card__dot"
            style={{
              background: meta.color,
              boxShadow: unit.status !== 'offline' ? `0 0 8px ${meta.color}88` : 'none',
            }}
          />
          <span className="unit-card__type-icon" aria-label={unit.type}>
            {unit.type === 'vehicle' ? <VehicleIcon /> : <PersonIcon />}
          </span>
          <span className="unit-card__id">{unit.id} · {unit.callsign}</span>
          <span
            className="unit-card__chip"
            style={{
              color:        meta.color,
              background:   `${meta.color}1A`,
              borderColor:  `${meta.color}4D`,
            }}
          >
            {meta.label}
          </span>
        </div>

        <div className="unit-card__principal">
          {unit.principal}
          <span className="unit-card__role"> · {unit.principalRole}</span>
        </div>

        <div className="unit-card__info">
          <span className="unit-card__loc">{unit.location}</span>
          <span
            className="unit-card__speed"
            style={{ color: unit.isLive ? '#37C2B8' : unit.status === 'warning' ? '#E0A63C' : undefined }}
          >
            {unit.isLive ? `● ${speed}` : speed}
          </span>
        </div>

        {selected && (
          <div className="unit-card__footer">
            <span className="unit-card__updated" style={unit.isLive ? { color: '#37C2B8' } : undefined}>
              {unit.isLive ? '● LIVE' : `Updated ${unit.lastUpdated} ago`}
            </span>
            <button
              className="unit-card__open"
              onClick={e => { e.stopPropagation(); navigate(`/admin/unit/${unit.id}`) }}
            >
              OPEN DETAIL →
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

function VehicleIcon() {
  return (
    <svg width="15" height="11" viewBox="0 0 15 11" fill="none" aria-hidden>
      <path d="M1 7h13M2.5 7L4.5 3.5h6L12.5 7" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="4.5" cy="9" r="1.25" stroke="currentColor" strokeWidth="1.25"/>
      <circle cx="10.5" cy="9" r="1.25" stroke="currentColor" strokeWidth="1.25"/>
    </svg>
  )
}

function PersonIcon() {
  return (
    <svg width="11" height="13" viewBox="0 0 11 13" fill="none" aria-hidden>
      <circle cx="5.5" cy="3.5" r="2.5" stroke="currentColor" strokeWidth="1.25"/>
      <path d="M1 12c0-2.5 2-4.5 4.5-4.5S10 9.5 10 12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg className="dash-search__icon" width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M9 9L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
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
