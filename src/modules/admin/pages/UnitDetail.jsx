import { useState, useRef, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Map, { Marker, Source, Layer, NavigationControl } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import './UnitDetail.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

const STATUS_META = {
  normal:  { color: '#37C2B8', label: 'SECURE'  },
  warning: { color: '#E0A63C', label: 'WARNING' },
  duress:  { color: '#F2495B', label: 'DURESS'  },
  offline: { color: '#66727A', label: 'OFFLINE' },
}

const SEVERITY_COLOR = {
  normal:  '#37C2B8',
  warning: '#E0A63C',
  duress:  '#F2495B',
  offline: '#66727A',
  muted:   '#5D676C',
}

const SCHEDULE_TYPE_LABEL = {
  arrive:   'ARR',
  depart:   'DEP',
  waypoint: 'WPT',
  stop:     'STP',
}

// Interpolate [lng, lat] position along routeCoords at 0–100% progress
function interpolateRoute(coords, progress) {
  if (!coords || coords.length === 0) return null
  if (coords.length === 1) return coords[0]
  const t = Math.max(0, Math.min(1, progress / 100))
  const segs = []
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    const d = Math.hypot(coords[i][0] - coords[i-1][0], coords[i][1] - coords[i-1][1])
    segs.push(d)
    total += d
  }
  let dist = t * total
  for (let i = 0; i < segs.length; i++) {
    if (dist <= segs[i]) {
      const f = segs[i] > 0 ? dist / segs[i] : 0
      return [
        coords[i][0] + (coords[i+1][0] - coords[i][0]) * f,
        coords[i][1] + (coords[i+1][1] - coords[i][1]) * f,
      ]
    }
    dist -= segs[i]
  }
  return coords[coords.length - 1]
}

// Slice coords from start to progress% (returns coords for completed portion)
function sliceRoute(coords, progress) {
  if (!coords || coords.length < 2) return coords ?? []
  const end = interpolateRoute(coords, progress)
  const t = Math.max(0, Math.min(1, progress / 100))
  const segs = []
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    const d = Math.hypot(coords[i][0] - coords[i-1][0], coords[i][1] - coords[i-1][1])
    segs.push(d)
    total += d
  }
  let dist = t * total
  const slice = [coords[0]]
  for (let i = 0; i < segs.length; i++) {
    if (dist <= segs[i]) {
      slice.push(end)
      break
    }
    dist -= segs[i]
    slice.push(coords[i+1])
  }
  return slice
}

export default function UnitDetail({ units }) {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const unit      = units.find(u => u.id === id)
  const [tab, setTab]                     = useState('live')
  const [routeProgress, setRouteProgress] = useState(100)
  const [fullscreen, setFullscreen]       = useState(false)
  const mapRef   = useRef(null)
  const scrubRef = useRef(null)

  if (!unit) {
    return (
      <div className="ud-not-found">
        <span>Unit {id} not found.</span>
        <button onClick={() => navigate('/admin/unit')}>← Back to units</button>
      </div>
    )
  }

  const meta   = STATUS_META[unit.status] ?? STATUS_META.offline
  const coords = unit.routeCoords ?? []

  const playhead       = useMemo(() => interpolateRoute(coords, routeProgress), [coords, routeProgress])
  const completedCoords = useMemo(() => sliceRoute(coords, routeProgress),      [coords, routeProgress])

  // Escape key exits fullscreen
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setFullscreen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Tell Mapbox to repaint after container resize
  useEffect(() => {
    const timer = setTimeout(() => mapRef.current?.resize(), 50)
    return () => clearTimeout(timer)
  }, [fullscreen])

  // Reposition map when tab changes — map stays mounted, only view changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (tab === 'live') {
      map.flyTo({ center: [unit.lng, unit.lat], zoom: 14, duration: 700 })
    } else if (tab === 'route' && coords.length >= 2) {
      const lngs = coords.map(c => c[0])
      const lats = coords.map(c => c[1])
      map.fitBounds(
        [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
        { padding: 60, duration: 700 }
      )
    } else if (tab === 'schedule') {
      const pins = (unit.schedule ?? []).filter(s => s.lat && s.lng)
      if (pins.length > 0) {
        const lngs = pins.map(s => s.lng)
        const lats = pins.map(s => s.lat)
        map.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 80, duration: 700 }
        )
      }
    }
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleScrub(e) {
    const rect = scrubRef.current.getBoundingClientRect()
    const pct  = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    setRouteProgress(Math.round(pct))
  }

  return (
    <div className="unit-detail">
      {/* ── header ──────────────────────────────── */}
      <div className="ud-header">
        <button className="ud-back" onClick={() => navigate('/admin/unit')}>← UNITS</button>
        <div className="ud-header__main">
          <div className="ud-header__id-row">
            <span
              className="ud-header__dot"
              style={{ background: meta.color, boxShadow: `0 0 10px ${meta.color}99` }}
            />
            <span className="ud-header__id">{unit.id}</span>
            <span className="ud-header__callsign">{unit.callsign}</span>
            <span
              className="ud-header__chip"
              style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}44` }}
            >
              {meta.label}
            </span>
          </div>
          <div className="ud-header__meta">
            <MetaItem label="Principal" value={`${unit.principal} · ${unit.principalRole}`} />
            {unit.agent && unit.agent !== '—' && <MetaItem label="Agent" value={unit.agent} />}
            {unit.vehicle    && <MetaItem label="Vehicle" value={unit.vehicle} />}
            {unit.armorLevel && <MetaItem label="Armor"   value={unit.armorLevel} />}
            {unit.plate      && <MetaItem label="Plate"   value={unit.plate} mono />}
          </div>
        </div>
      </div>

      {/* ── tabs ────────────────────────────────── */}
      <div className="ud-tabs">
        {['live', 'route', 'schedule'].map(t => (
          <button
            key={t}
            className={`ud-tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'live' ? 'LIVE' : t === 'route' ? 'ROUTE HISTORY' : 'SCHEDULE'}
          </button>
        ))}
      </div>

      {/* ── map — always mounted, tab only changes what's inside ── */}
      <div className={`ud-map${fullscreen ? ' fullscreen' : ''}`}>
        <Map
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={{ longitude: unit.lng, latitude: unit.lat, zoom: 14 }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          attributionControl={false}
        >
          <NavigationControl position="bottom-right" showCompass={false} />

          {/* LIVE — unit marker with pulse */}
          {tab === 'live' && (
            <Marker longitude={unit.lng} latitude={unit.lat} anchor="center">
              <div className="ud-live-marker">
                <div className="ud-marker-dot-wrap">
                  {unit.status !== 'offline' && (
                    <span className="ud-marker-ring" style={{ background: meta.color }} />
                  )}
                  <span
                    className="ud-marker-dot"
                    style={{
                      background: meta.color,
                      boxShadow: unit.status !== 'offline' ? `0 0 14px ${meta.color}99` : 'none',
                    }}
                  />
                </div>
                <span className="ud-marker-label" style={{ borderColor: `${meta.color}55` }}>
                  {unit.id} · {unit.status === 'offline' ? '—' : `${unit.speed} MPH`}
                </span>
              </div>
            </Marker>
          )}

          {/* ROUTE — full trail + completed portion + playhead */}
          {tab === 'route' && coords.length >= 2 && (
            <>
              <Source
                id="route-full"
                type="geojson"
                data={{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }}
              >
                <Layer
                  id="route-full-line"
                  type="line"
                  paint={{ 'line-color': 'rgba(55,194,184,0.22)', 'line-width': 2, 'line-dasharray': [2, 2.5] }}
                />
              </Source>

              {completedCoords.length >= 2 && (
                <Source
                  id="route-done"
                  type="geojson"
                  data={{ type: 'Feature', geometry: { type: 'LineString', coordinates: completedCoords } }}
                >
                  <Layer
                    id="route-done-line"
                    type="line"
                    paint={{ 'line-color': '#37C2B8', 'line-width': 2.5 }}
                  />
                </Source>
              )}

              {playhead && (
                <Marker longitude={playhead[0]} latitude={playhead[1]} anchor="center">
                  <div className="ud-marker-dot-wrap">
                    <span
                      className="ud-marker-dot"
                      style={{
                        background: meta.color,
                        width: 13, height: 13,
                        boxShadow: `0 0 12px ${meta.color}88`,
                      }}
                    />
                  </div>
                </Marker>
              )}
            </>
          )}

          {/* SCHEDULE — numbered stop pins */}
          {tab === 'schedule' && unit.schedule?.map((item, i) =>
            item.lat && item.lng ? (
              <Marker key={item.id} longitude={item.lng} latitude={item.lat} anchor="center">
                <div className={`ud-schedule-pin status-${item.status}`}>
                  <span className="ud-pin-num">{i + 1}</span>
                </div>
              </Marker>
            ) : null
          )}
        </Map>

        {/* floating badge */}
        <div className="ud-map-badge">
          {tab === 'live'     && 'LIVE POSITION'}
          {tab === 'route'    && 'ROUTE HISTORY'}
          {tab === 'schedule' && 'PLANNED SCHEDULE'}
        </div>

        {/* fullscreen toggle */}
        <button
          className="ud-map-fs-btn"
          onClick={() => setFullscreen(f => !f)}
          title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
        >
          {fullscreen ? <CollapseIcon /> : <ExpandIcon />}
        </button>

        {/* route scrubber — overlaid at map bottom */}
        {tab === 'route' && (
          <div className="ud-scrubber" onClick={handleScrub} ref={scrubRef}>
            <span className="ud-scrubber__label">START</span>
            <div className="ud-scrubber__track">
              <div className="ud-scrubber__fill"  style={{ width: `${routeProgress}%` }} />
              <div className="ud-scrubber__handle" style={{ left:  `${routeProgress}%` }} />
            </div>
            <span className="ud-scrubber__label">{routeProgress}%</span>
          </div>
        )}
      </div>

      {/* ── body ────────────────────────────────── */}
      <div className="ud-body">
        <div className="ud-left">
          {tab === 'schedule' ? (
            <ScheduleView schedule={unit.schedule ?? []} />
          ) : unit.type === 'vehicle' ? (
            <VehicleDiagnostics unit={unit} />
          ) : (
            <PersonStats unit={unit} />
          )}
        </div>
        <div className="ud-right">
          <EventsLog events={unit.events ?? []} />
        </div>
      </div>
    </div>
  )
}

/* ── vehicle diagnostics ──────────────────────────────────────── */
function VehicleDiagnostics({ unit }) {
  const tiles = [
    { label: 'ENGINE',      value: unit.ignition ? 'RUNNING' : 'OFF',                                  sub: unit.ignition ? 'All nominal' : 'Ignition off',     color: unit.ignition ? '#37C2B8' : '#66727A' },
    { label: 'SPEED',       value: `${unit.speed} MPH`,                                                 sub: `HDG ${unit.heading}°`,                              color: '#DFE4E6' },
    { label: 'FUEL',        value: `${unit.fuel}%`,                                                      sub: `${Math.round(unit.fuel * 4.2)} mi est`,             color: unit.fuel < 35 ? '#E0A63C' : '#DFE4E6' },
    { label: 'BATTERY',     value: unit.battery !== null ? `${unit.battery}%` : '—',                    sub: unit.battery ? '14.2 V' : 'No telemetry',            color: unit.battery ? '#DFE4E6' : '#66727A' },
    { label: 'COOLANT',     value: unit.coolantTemp,                                                     sub: unit.faultCodes.length ? 'Elevated' : 'Normal',      color: unit.faultCodes.length ? '#E0A63C' : '#DFE4E6' },
    { label: 'ODOMETER',    value: unit.odometer?.toLocaleString() ?? '—',                              sub: 'miles',                                              color: '#DFE4E6' },
    { label: 'FAULT CODES', value: unit.faultCodes.length ? unit.faultCodes.join(' ') : 'NONE',        sub: unit.faultCodes.length ? 'Attention' : 'All clear',   color: unit.faultCodes.length ? '#E0A63C' : '#37C2B8' },
    { label: 'DOORS/LOCKS', value: unit.doorsLocked === null ? '—' : unit.doorsLocked ? 'SECURED' : 'UNLOCKED', sub: unit.doorsLocked ? 'All locked' : '—',      color: unit.doorsLocked ? '#37C2B8' : '#E0A63C' },
  ]

  return (
    <div className="ud-section">
      <span className="ud-section__title">DIAGNOSTICS</span>
      <div className="ud-diag-grid">
        {tiles.map(t => (
          <div key={t.label} className="ud-diag-tile">
            <span className="ud-diag-tile__label">{t.label}</span>
            <span className="ud-diag-tile__value" style={{ color: t.color }}>{t.value}</span>
            <span className="ud-diag-tile__sub">{t.sub}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── person stats ─────────────────────────────────────────────── */
function PersonStats({ unit }) {
  const battColor = unit.battery !== null
    ? (unit.battery < 30 ? '#E0A63C' : '#37C2B8')
    : '#66727A'

  return (
    <div className="ud-section">
      <span className="ud-section__title">DEVICE STATUS</span>
      <div className="ud-person-stats">
        <div className="ud-stat-tile">
          <span className="ud-stat-tile__label">BATTERY</span>
          <span className="ud-stat-tile__value" style={{ color: battColor }}>
            {unit.battery !== null ? `${unit.battery}%` : '—'}
          </span>
          <div className="ud-stat-tile__bar">
            <div
              className="ud-stat-tile__fill"
              style={{ width: `${unit.battery ?? 0}%`, background: battColor }}
            />
          </div>
          {unit.battery !== null && unit.battery < 30 && (
            <span className="ud-stat-tile__warn">Low battery — charge required</span>
          )}
        </div>

        <div className="ud-stat-tile">
          <span className="ud-stat-tile__label">SPEED</span>
          <span className="ud-stat-tile__value" style={{ color: '#DFE4E6' }}>
            {unit.status === 'offline' ? '—' : `${unit.speed} MPH`}
          </span>
          <span className="ud-stat-tile__sub">HDG {unit.heading}°</span>
        </div>

        <div className="ud-stat-tile">
          <span className="ud-stat-tile__label">LAST SIGNAL</span>
          <span className="ud-stat-tile__value" style={{ color: '#DFE4E6' }}>
            {unit.lastUpdated} ago
          </span>
          <span className="ud-stat-tile__sub">{unit.status === 'offline' ? 'No signal' : 'Active'}</span>
        </div>
      </div>
    </div>
  )
}

/* ── events log ───────────────────────────────────────────────── */
function EventsLog({ events }) {
  return (
    <div className="ud-section">
      <span className="ud-section__title">RECENT EVENTS</span>
      {events.length === 0 && (
        <span className="ud-events-empty">No events recorded</span>
      )}
      <ul className="ud-events">
        {events.map(ev => (
          <li key={ev.id} className="ud-event">
            <span
              className="ud-event__dot"
              style={{
                background:  SEVERITY_COLOR[ev.severity] ?? '#5D676C',
                boxShadow: `0 0 6px ${SEVERITY_COLOR[ev.severity] ?? '#5D676C'}88`,
              }}
            />
            <span className="ud-event__time">{ev.time}</span>
            <span className="ud-event__text">{ev.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── schedule view ────────────────────────────────────────────── */
function ScheduleView({ schedule }) {
  return (
    <div className="ud-section">
      <span className="ud-section__title">PLANNED SCHEDULE</span>
      <ul className="ud-schedule">
        {schedule.map((item, i) => (
          <li key={item.id} className={`ud-sched-item status-${item.status}`}>
            <div className="ud-sched-item__timeline">
              <span className={`ud-sched-item__node status-${item.status}`} />
              {i < schedule.length - 1 && <span className="ud-sched-item__line" />}
            </div>
            <div className="ud-sched-item__content">
              <div className="ud-sched-item__row">
                <span className="ud-sched-item__type">
                  {SCHEDULE_TYPE_LABEL[item.type] ?? item.type.toUpperCase()}
                </span>
                <span className="ud-sched-item__time">{item.time}</span>
                <span className={`ud-sched-item__badge status-${item.status}`}>
                  {item.status.toUpperCase()}
                </span>
              </div>
              <span className="ud-sched-item__label">{item.label}</span>
              {item.note && <span className="ud-sched-item__note">{item.note}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── icons ────────────────────────────────────────────────────── */
function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function CollapseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M5 1v4H1M9 5V1h4M9 13v-4h4M1 9h4v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

/* ── helpers ──────────────────────────────────────────────────── */
function MetaItem({ label, value, mono }) {
  return (
    <div className="ud-meta-item">
      <span className="ud-meta-item__label">{label}</span>
      <span className={`ud-meta-item__value${mono ? ' mono' : ''}`}>{value}</span>
    </div>
  )
}
