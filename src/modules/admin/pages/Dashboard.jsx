import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Map, { Marker, Popup, AttributionControl } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useAccounts } from '../contexts/AccountsContext'
import { useLivePositions } from '../../../shared/hooks/useLivePositions'
import { MapSearch, SearchPinMarker } from '../components/MapSearch'
import { MapControls, MAP_STYLES, UpuRow } from '../components/MapControls'
import ZoneLayers from '../components/ZoneLayers'
import MarkerPins from '../components/MarkerPins'
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
  longitude: 0,
  latitude:  20,
  zoom:      1.8,
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R  = 6371
  const dL = (lat2 - lat1) * Math.PI / 180
  const dG = (lng2 - lng1) * Math.PI / 180
  const a  = Math.sin(dL / 2) ** 2
           + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dG / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default function Dashboard() {
  const { accounts } = useAccounts()
  const positions    = useLivePositions()
  const navigate     = useNavigate()
  const mapRef       = useRef(null)
  const centeredRef  = useRef(false)

  const [filter,       setFilter]     = useState('all')
  const [search,       setSearch]     = useState('')
  const [selectedId,   setSelectedId] = useState(null)
  const [popupId,      setPopupId]    = useState(null)
  const [mapStyle, setMapStyle] = useState('dark')
  const [searchPin,       setSearchPin]       = useState(null)

  // Flatten all real units across accounts; attach primary device live position
  const displayUnits = useMemo(() => {
    const result = []
    for (const acc of accounts) {
      for (const unit of acc.units ?? []) {
        const primaryDev = unit.devices?.find(d => d.id === unit.primaryDeviceId)
        const traccarId  = primaryDev?.traccarDeviceId
                         ?? unit.devices?.find(d => d.traccarDeviceId)?.traccarDeviceId
                         ?? null
        const pos = traccarId ? positions[traccarId] : null
        result.push({
          id:          unit.id,
          name:        unit.name,
          type:        unit.type,
          status:      unit.status ?? 'offline',
          accountName: acc.name,
          isLive:      !!pos,
          lat:         pos?.latitude  ?? null,
          lng:         pos?.longitude ?? null,
          speed:       pos ? Math.round(pos.speed * 1.852) : null,
          heading:     pos?.course ?? null,
        })
      }
    }
    return result
  }, [accounts, positions])

  const counts = useMemo(() => ({
    total:   displayUnits.length,
    warning: displayUnits.filter(u => u.status === 'warning').length,
    normal:  displayUnits.filter(u => u.status === 'normal').length,
    offline: displayUnits.filter(u => u.status === 'offline').length,
    duress:  displayUnits.filter(u => u.status === 'duress').length,
  }), [displayUnits])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return displayUnits
      .filter(u => filter === 'all' || u.status === filter)
      .filter(u => !q || [u.name, u.accountName].join(' ').toLowerCase().includes(q))
  }, [displayUnits, filter, search])

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

  // Only units with a live position get a map marker
  const liveUnits = useMemo(() => displayUnits.filter(u => u.lat != null), [displayUnits])

  // Auto-center on the densest cluster of live units — fires once when positions first arrive
  useEffect(() => {
    if (centeredRef.current)   return
    if (liveUnits.length === 0) return
    if (!mapRef.current)        return
    centeredRef.current = true

    const lats = [...liveUnits.map(u => u.lat)].sort((a, b) => a - b)
    const lngs = [...liveUnits.map(u => u.lng)].sort((a, b) => a - b)
    const medLat = lats[Math.floor(lats.length / 2)]
    const medLng = lngs[Math.floor(lngs.length / 2)]

    // Keep only units within 500 km of the median — drops outliers
    const cluster = liveUnits.filter(u => haversineKm(medLat, medLng, u.lat, u.lng) <= 500)
    const target  = cluster.length > 0 ? cluster : liveUnits // fallback: use all

    if (target.length === 1) {
      mapRef.current.flyTo({ center: [target[0].lng, target[0].lat], zoom: 13, duration: 1400 })
      return
    }

    const minLat = Math.min(...target.map(u => u.lat))
    const maxLat = Math.max(...target.map(u => u.lat))
    const minLng = Math.min(...target.map(u => u.lng))
    const maxLng = Math.max(...target.map(u => u.lng))

    mapRef.current.fitBounds(
      [[minLng, minLat], [maxLng, maxLat]],
      { padding: 120, duration: 1400, maxZoom: 14 },
    )
  }, [liveUnits])

  function selectUnit(id) {
    setSelectedId(id)
    setPopupId(id)
    const unit = displayUnits.find(u => u.id === id)
    if (unit?.lat != null && mapRef.current) {
      mapRef.current.flyTo({ center: [unit.lng, unit.lat], zoom: 14, duration: 900 })
    }
  }

  function flyToPlace(lng, lat, bbox) {
    if (bbox) {
      mapRef.current?.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 80, duration: 1000, maxZoom: 15 })
    } else {
      mapRef.current?.flyTo({ center: [lng, lat], zoom: 15, duration: 900 })
    }
  }

  return (
    <div className="dashboard">
      {/* ── left panel ─────────────────────────── */}
      <aside className="dash-panel">
        <div className="filter-tabs">
          {FILTER_DEFS.map(tab => {
            const count       = tab.key === 'all' ? counts.total : counts[tab.key]
            const active      = filter === tab.key
            const statusColor = STATUS_META[tab.key]?.color
            return (
              <button
                key={tab.key}
                className={`filter-tab${active ? ' active' : ''}`}
                style={active && statusColor ? { background: statusColor, borderColor: statusColor, color: '#0A0E10' } : {}}
                onClick={() => setFilter(tab.key)}
              >
                {tab.label}
                <span className="filter-tab__count">{count}</span>
              </button>
            )
          })}
        </div>

        <div className="dash-search">
          <SearchIcon />
          <input
            className="dash-search__input"
            type="text"
            placeholder="Search units…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <ul className="unit-list" role="list">
          {filtered.length === 0 && (
            <li className="unit-list__empty">
              {accounts.length === 0 ? 'Loading…' : 'No units match'}
            </li>
          )}

          {groups.vehicles.length > 0 && (
            <>
              <UnitGroupHeader label="VEHICLES" count={groups.vehicles.length} />
              {groups.vehicles.map(unit => (
                <UnitCardItem key={unit.id} unit={unit} selected={unit.id === selectedId} onSelect={selectUnit} />
              ))}
            </>
          )}

          {groups.people.length > 0 && (
            <>
              <UnitGroupHeader label="PEOPLE" count={groups.people.length} />
              {groups.people.map(unit => (
                <UnitCardItem key={unit.id} unit={unit} selected={unit.id === selectedId} onSelect={selectUnit} />
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
          mapStyle={MAP_STYLES[mapStyle]}
          attributionControl={false}
        >
          <AttributionControl compact position="bottom-left" />
          <ZoneLayers />
          <MarkerPins />

          <MapSearch onFlyTo={flyToPlace} onPin={setSearchPin} />
          <MapControls mapStyle={mapStyle} onStyleChange={setMapStyle} />

          {searchPin && (
            <Marker longitude={searchPin.lng} latitude={searchPin.lat} anchor="bottom">
              <SearchPinMarker onDismiss={() => setSearchPin(null)} />
            </Marker>
          )}

          {/* Unit markers — only units with a live primary device position */}
          {liveUnits.map(unit => {
            const meta   = STATUS_META[unit.status] ?? STATUS_META.offline
            const isSel  = unit.id === selectedId
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
                    {isPulse && <span className="marker-ring" style={{ background: meta.color }} />}
                    <span
                      className="marker-dot"
                      style={{
                        background: meta.color,
                        width:  isSel || unit.status === 'duress' ? '15px' : '11px',
                        height: isSel || unit.status === 'duress' ? '15px' : '11px',
                        boxShadow: `0 0 0 2px ${meta.color}38, 0 0 14px ${meta.color}99`,
                      }}
                    />
                  </div>
                  <span className="marker-label" style={{ color: isSel ? '#EEF2F3' : '#AEB8BD', borderColor: `${meta.color}66` }}>
                    {unit.name}
                  </span>
                </div>
              </Marker>
            )
          })}

          {/* Popup for selected unit */}
          {popupId && (() => {
            const unit = displayUnits.find(u => u.id === popupId)
            if (!unit) return null
            const meta    = STATUS_META[unit.status] ?? STATUS_META.offline
            const detailPath = `/admin/unit/${unit.type === 'person' ? 'principal' : 'vehicle'}/${unit.id}`
            if (!unit.lat) return null
            return (
              <Popup
                longitude={unit.lng} latitude={unit.lat}
                anchor="bottom" offset={22} closeOnClick={false}
                onClose={() => setPopupId(null)} className="unit-popup"
              >
                <div className="upu">
                  <div className="upu-head">
                    <span className="upu-dot" style={{ background: meta.color, boxShadow: `0 0 6px ${meta.color}88` }} />
                    <span className="upu-id">{unit.name}</span>
                    <span className="upu-chip" style={{ color: meta.color, borderColor: `${meta.color}44`, background: `${meta.color}18` }}>
                      {meta.label}
                    </span>
                  </div>
                  <div className="upu-rows">
                    {unit.accountName && <UpuRow k="ACCOUNT" v={unit.accountName} />}
                    {unit.speed != null && <UpuRow k="SPEED" v={`${unit.speed} KPH`} />}
                    {unit.heading != null && <UpuRow k="HEADING" v={`${unit.heading}°`} />}
                    <UpuRow k="COORDS" v={`${unit.lat.toFixed(5)}, ${unit.lng.toFixed(5)}`} />
                    <UpuRow k="SIGNAL" v="● LIVE" color="#37C2B8" />
                  </div>
                  <button className="upu-open" onClick={() => navigate(detailPath)}>
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
  const detailPath = `/admin/unit/${unit.type === 'person' ? 'principal' : 'vehicle'}/${unit.id}`

  return (
    <li>
      <div
        className={`unit-card${selected ? ' selected' : ''}`}
        onClick={() => onSelect(unit.id)}
        role="button" tabIndex={0} aria-pressed={selected}
        onKeyDown={e => e.key === 'Enter' && onSelect(unit.id)}
      >
        <span className="unit-card__bar" style={{ background: meta.color, opacity: selected ? 1 : 0.45 }} />

        <div className="unit-card__head">
          <span className="unit-card__dot" style={{ background: meta.color, boxShadow: unit.isLive ? `0 0 8px ${meta.color}88` : 'none' }} />
          <span className="unit-card__type-icon" aria-label={unit.type}>
            {unit.type === 'vehicle' ? <VehicleIcon /> : <PersonIcon />}
          </span>
          <span className="unit-card__id">{unit.name}</span>
          <span className="unit-card__chip" style={{ color: meta.color, background: `${meta.color}1A`, borderColor: `${meta.color}4D` }}>
            {meta.label}
          </span>
        </div>

        <div className="unit-card__principal">{unit.accountName}</div>

        <div className="unit-card__info">
          <span className="unit-card__loc" style={{ color: unit.isLive ? '#37C2B8' : undefined }}>
            {unit.isLive ? '● LIVE' : 'No signal'}
          </span>
          <span className="unit-card__speed" style={{ color: unit.isLive ? '#37C2B8' : '#66727A' }}>
            {unit.isLive ? `${unit.speed} KPH` : '—'}
          </span>
        </div>

        {selected && (
          <div className="unit-card__footer">
            <span className="unit-card__updated" style={unit.isLive ? { color: '#37C2B8' } : undefined}>
              {unit.isLive ? '● LIVE' : 'No signal'}
            </span>
            <button className="unit-card__open" onClick={e => { e.stopPropagation(); navigate(detailPath) }}>
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

