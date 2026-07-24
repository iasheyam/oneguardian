import { useState, useRef, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Map, { Marker, Source, Layer } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useAccounts } from '../contexts/AccountsContext'
import { useLivePositions } from '../../../shared/hooks/useLivePositions'
import { apiUrl, apiFetch } from '../../../shared/utils/api'
import { MapControls, MAP_STYLES } from '../components/MapControls'
import ZoneLayers from '../components/ZoneLayers'
import MarkerPins from '../components/MarkerPins'
import './UnitDetail.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const INITIAL_VIEW = { longitude: -90.5069, latitude: 14.5980, zoom: 13 }

const STATUS_META = {
  normal:  { color: '#37C2B8', label: 'SECURE'  },
  warning: { color: '#E0A63C', label: 'WARNING' },
  duress:  { color: '#F2495B', label: 'DURESS'  },
  offline: { color: '#66727A', label: 'OFFLINE' },
}

function interpolateRoute(coords, progress) {
  if (!coords || coords.length === 0) return null
  if (coords.length === 1) return coords[0]
  const t = Math.max(0, Math.min(1, progress / 100))
  const segs = []
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    const d = Math.hypot(coords[i][0] - coords[i-1][0], coords[i][1] - coords[i-1][1])
    segs.push(d); total += d
  }
  let dist = t * total
  for (let i = 0; i < segs.length; i++) {
    if (dist <= segs[i]) {
      const f = segs[i] > 0 ? dist / segs[i] : 0
      return [coords[i][0] + (coords[i+1][0] - coords[i][0]) * f, coords[i][1] + (coords[i+1][1] - coords[i][1]) * f]
    }
    dist -= segs[i]
  }
  return coords[coords.length - 1]
}

function sliceRoute(coords, progress) {
  if (!coords || coords.length < 2) return coords ?? []
  const end = interpolateRoute(coords, progress)
  const t = Math.max(0, Math.min(1, progress / 100))
  const segs = []; let total = 0
  for (let i = 1; i < coords.length; i++) {
    const d = Math.hypot(coords[i][0] - coords[i-1][0], coords[i][1] - coords[i-1][1])
    segs.push(d); total += d
  }
  let dist = t * total
  const slice = [coords[0]]
  for (let i = 0; i < segs.length; i++) {
    if (dist <= segs[i]) { slice.push(end); break }
    dist -= segs[i]; slice.push(coords[i+1])
  }
  return slice
}

export default function VehicleDetail() {
  const { id }        = useParams()
  const navigate      = useNavigate()
  const { accounts }  = useAccounts()

  const { vehicle, account } = useMemo(() => {
    for (const acc of accounts) {
      const v = acc.units?.find(u => u.id === id && u.type === 'vehicle')
      if (v) return { vehicle: v, account: acc }
    }
    return { vehicle: null, account: null }
  }, [accounts, id])

  const traccarDeviceId = useMemo(() => (
    vehicle?.devices?.find(d => d.id === vehicle.primaryDeviceId)?.traccarDeviceId
    ?? vehicle?.devices?.find(d => d.traccarDeviceId)?.traccarDeviceId
    ?? null
  ), [vehicle])

  const livePositions = useLivePositions()
  const livePos       = traccarDeviceId ? livePositions[traccarDeviceId] : null
  const isLive        = !!livePos

  const lat     = livePos?.latitude  ?? null
  const lng     = livePos?.longitude ?? null
  const speed   = livePos ? Math.round(livePos.speed * 1.852) : null
  const heading = livePos?.course ?? null
  const attrs   = livePos?.attributes ?? {}

  const [tab,           setTab]           = useState('live')
  const [mapStyle,      setMapStyle]      = useState('dark')
  const [routeCoords,   setRouteCoords]   = useState([])
  const [routeProgress, setRouteProgress] = useState(100)
  const [loadingRoute,  setLoadingRoute]  = useState(false)
  const [fullscreen,    setFullscreen]    = useState(false)
  const mapRef   = useRef(null)
  const scrubRef = useRef(null)

  useEffect(() => {
    if (tab !== 'route' || !traccarDeviceId) return
    setLoadingRoute(true)
    const from = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()
    const to   = new Date().toISOString()
    apiFetch(apiUrl(`/api/traccar/positions/${traccarDeviceId}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`))
      .then(r => r.json())
      .then(positions => setRouteCoords(positions.map(p => [p.longitude, p.latitude])))
      .catch(() => {})
      .finally(() => setLoadingRoute(false))
  }, [tab, traccarDeviceId])

  useEffect(() => {
    if (livePos && mapRef.current && tab === 'live') {
      mapRef.current.flyTo({ center: [livePos.longitude, livePos.latitude], zoom: 14, duration: 500 })
    }
  }, [livePos, tab])

  useEffect(() => {
    if (tab !== 'route' || routeCoords.length < 2 || !mapRef.current) return
    const lngs = routeCoords.map(c => c[0])
    const lats = routeCoords.map(c => c[1])
    mapRef.current.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 60, duration: 700 }
    )
  }, [routeCoords, tab])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setFullscreen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.resize(), 50)
    return () => clearTimeout(t)
  }, [fullscreen])

  function handleScrub(e) {
    const rect = scrubRef.current.getBoundingClientRect()
    const pct  = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    setRouteProgress(Math.round(pct))
  }

  if (accounts.length > 0 && !vehicle) {
    return (
      <div className="ud-not-found">
        <span>Vehicle {id} not found.</span>
        <button onClick={() => navigate(-1)}>← Back</button>
      </div>
    )
  }
  if (!vehicle) return null

  const meta            = STATUS_META[vehicle.status] ?? STATUS_META.offline
  const playhead        = useMemo(() => interpolateRoute(routeCoords, routeProgress), [routeCoords, routeProgress])
  const completedCoords = useMemo(() => sliceRoute(routeCoords, routeProgress),       [routeCoords, routeProgress])

  const diagTiles = [
    {
      label: 'IGNITION',
      value: attrs.ignition !== undefined ? (attrs.ignition ? 'ON' : 'OFF') : '—',
      sub:   attrs.ignition ? 'Engine running' : 'Engine off',
      color: attrs.ignition ? '#37C2B8' : '#66727A',
    },
    {
      label: 'SPEED',
      value: speed !== null ? `${speed} KPH` : '—',
      sub:   heading !== null ? `HDG ${Math.round(heading)}°` : 'No signal',
      color: '#DFE4E6',
    },
    {
      label: 'FUEL',
      value: attrs.fuel !== undefined ? `${Math.round(attrs.fuel)}%` : '—',
      sub:   'Fuel level',
      color: attrs.fuel !== undefined && attrs.fuel < 35 ? '#E0A63C' : '#DFE4E6',
    },
    {
      label: 'BATTERY',
      value: attrs.batteryLevel !== undefined ? `${Math.round(attrs.batteryLevel)}%` : '—',
      sub:   '12V system',
      color: attrs.batteryLevel !== undefined && attrs.batteryLevel < 30 ? '#E0A63C' : '#DFE4E6',
    },
    {
      label: 'ALTITUDE',
      value: livePos?.altitude !== undefined ? `${Math.round(livePos.altitude)} m` : '—',
      sub:   'Above sea level',
      color: '#DFE4E6',
    },
    {
      label: 'ARMOR',
      value: vehicle.armorLevel ?? '—',
      sub:   'Protection rating',
      color: '#DFE4E6',
    },
    {
      label: 'PLATE',
      value: vehicle.plate ?? '—',
      sub:   vehicle.make ? `${vehicle.make} ${vehicle.model ?? ''}`.trim() : 'License plate',
      color: '#AEB8BD',
    },
    {
      label: 'SIGNAL',
      value: isLive ? 'LIVE' : 'OFFLINE',
      sub:   isLive ? 'Receiving updates' : 'No GPS signal',
      color: isLive ? '#37C2B8' : '#66727A',
    },
  ]

  return (
    <div className="unit-detail">
      {/* ── header ──────────────────────────────── */}
      <div className="ud-header">
        <button className="ud-back" onClick={() => navigate(-1)}>← BACK</button>
        <div className="ud-header__main">
          <div className="ud-header__id-row">
            <span className="ud-header__dot" style={{ background: meta.color, boxShadow: `0 0 10px ${meta.color}99` }} />
            <span className="ud-header__id">{vehicle.callsign ?? vehicle.id.slice(0, 8).toUpperCase()}</span>
            <span className="ud-header__callsign">{[vehicle.make, vehicle.model].filter(Boolean).join(' ')}</span>
            <span className="ud-header__chip" style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}44` }}>
              {meta.label}
            </span>
            {isLive && (
              <span style={{ fontFamily: 'var(--adm-mono)', fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: '#37C2B8', marginLeft: 4 }}>
                ● LIVE
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── tabs ────────────────────────────────── */}
      <div className="ud-tabs">
        {[['live', 'LIVE'], ['route', 'ROUTE HISTORY'], ['schedule', 'SCHEDULE'], ['profile', 'PROFILE'], ['devices', 'DEVICES']].map(([t, label]) => (
          <button key={t} className={`ud-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>

      {/* ── map ─────────────────────────────────── */}
      <div className={`ud-map${fullscreen ? ' fullscreen' : ''}`}>
        <Map
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={lat && lng ? { latitude: lat, longitude: lng, zoom: 14 } : INITIAL_VIEW}
          style={{ width: '100%', height: '100%' }}
          mapStyle={MAP_STYLES[mapStyle]}
          attributionControl={false}
        >
          <MapControls mapStyle={mapStyle} onStyleChange={setMapStyle} />
          <ZoneLayers />
          <MarkerPins />

          {/* LIVE — position marker */}
          {tab === 'live' && lat && lng && (
            <Marker longitude={lng} latitude={lat} anchor="center">
              <div className="ud-live-marker">
                <div className="ud-marker-dot-wrap">
                  {vehicle.status !== 'offline' && (
                    <span className="ud-marker-ring" style={{ background: meta.color }} />
                  )}
                  <span className="ud-marker-dot" style={{ background: meta.color, boxShadow: `0 0 14px ${meta.color}99` }} />
                </div>
                <span className="ud-marker-label" style={{ borderColor: `${meta.color}55` }}>
                  {vehicle.callsign} · {speed !== null ? `${speed} KPH` : '—'}
                </span>
              </div>
            </Marker>
          )}

          {/* ROUTE — trail + playhead */}
          {tab === 'route' && routeCoords.length >= 2 && (
            <>
              <Source id="route-full" type="geojson" data={{ type: 'Feature', geometry: { type: 'LineString', coordinates: routeCoords } }}>
                <Layer id="route-full-line" type="line" paint={{ 'line-color': 'rgba(55,194,184,0.22)', 'line-width': 2, 'line-dasharray': [2, 2.5] }} />
              </Source>
              {completedCoords.length >= 2 && (
                <Source id="route-done" type="geojson" data={{ type: 'Feature', geometry: { type: 'LineString', coordinates: completedCoords } }}>
                  <Layer id="route-done-line" type="line" paint={{ 'line-color': '#37C2B8', 'line-width': 2.5 }} />
                </Source>
              )}
              {playhead && (
                <Marker longitude={playhead[0]} latitude={playhead[1]} anchor="center">
                  <div className="ud-marker-dot-wrap">
                    <span className="ud-marker-dot" style={{ background: meta.color, width: 13, height: 13, boxShadow: `0 0 12px ${meta.color}88` }} />
                  </div>
                </Marker>
              )}
            </>
          )}
        </Map>

        <div className="ud-map-badge">
          {tab === 'live'     && (isLive ? 'LIVE POSITION' : 'NO SIGNAL')}
          {tab === 'route'    && 'ROUTE HISTORY'}
          {tab === 'schedule' && 'PLANNED SCHEDULE'}
          {tab === 'profile'  && 'PROFILE'}
          {tab === 'devices'  && 'DEVICES'}
        </div>

        <button className="ud-map-fs-btn" onClick={() => setFullscreen(f => !f)} title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
          {fullscreen ? <CollapseIcon /> : <ExpandIcon />}
        </button>

        {tab === 'route' && routeCoords.length >= 2 && (
          <div className="ud-scrubber" onClick={handleScrub} ref={scrubRef}>
            <span className="ud-scrubber__label">START</span>
            <div className="ud-scrubber__track">
              <div className="ud-scrubber__fill"  style={{ width: `${routeProgress}%` }} />
              <div className="ud-scrubber__handle" style={{ left: `${routeProgress}%` }} />
            </div>
            <span className="ud-scrubber__label">{routeProgress}%</span>
          </div>
        )}

        {tab === 'route' && loadingRoute && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,14,16,0.6)', color: '#AEB8BD', fontFamily: 'var(--adm-mono)', fontSize: 11, letterSpacing: '0.1em' }}>
            LOADING ROUTE…
          </div>
        )}
      </div>

      {/* ── body ────────────────────────────────── */}
      <div className="ud-body">
        <div className="ud-left">
          {tab === 'live' && (
            <div className="ud-section">
              <span className="ud-section__title">DIAGNOSTICS</span>
              <div className="ud-diag-grid">
                {diagTiles.map(t => (
                  <div key={t.label} className="ud-diag-tile">
                    <span className="ud-diag-tile__label">{t.label}</span>
                    <span className="ud-diag-tile__value" style={{ color: t.color }}>{t.value}</span>
                    <span className="ud-diag-tile__sub">{t.sub}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'route' && !loadingRoute && (
            <div className="ud-section">
              <span className="ud-section__title">ROUTE STATS</span>
              {routeCoords.length < 2 ? (
                <span className="ud-events-empty">
                  {traccarDeviceId ? 'No route data for the last 8 hours' : 'No tracking device linked to this vehicle'}
                </span>
              ) : (
                <div className="ud-person-stats">
                  <div className="ud-stat-tile">
                    <span className="ud-stat-tile__label">POSITIONS</span>
                    <span className="ud-stat-tile__value" style={{ color: '#DFE4E6' }}>{routeCoords.length}</span>
                    <span className="ud-stat-tile__sub">Recorded in last 8h</span>
                  </div>
                  <div className="ud-stat-tile">
                    <span className="ud-stat-tile__label">PLAYBACK</span>
                    <span className="ud-stat-tile__value" style={{ color: '#37C2B8' }}>{routeProgress}%</span>
                    <span className="ud-stat-tile__sub">Use scrubber to replay</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'schedule' && (
            <div className="ud-section">
              <span className="ud-section__title">SCHEDULE</span>
              <span className="ud-events-empty">No schedule assigned</span>
            </div>
          )}
          {tab === 'profile'  && <VehicleProfileLeft vehicle={vehicle} />}
          {tab === 'devices' && <DevicesDetail devices={vehicle.devices ?? []} />}
        </div>

        <div className="ud-right">
          {(tab === 'live' || tab === 'route' || tab === 'schedule') && (
            <div className="ud-section">
              <span className="ud-section__title">DEVICES</span>
              {(!vehicle.devices || vehicle.devices.length === 0)
                ? <span className="ud-events-empty">No devices linked</span>
                : (
                  <ul className="ud-events">
                    {vehicle.devices.map(dev => (
                      <li key={dev.id} className="ud-event" style={{ alignItems: 'center' }}>
                        <span className="ud-event__dot" style={{ background: dev.status === 'online' ? '#37C2B8' : '#66727A', boxShadow: dev.status === 'online' ? '0 0 6px #37C2B888' : 'none', flexShrink: 0 }} />
                        <span className="ud-event__time" style={{ textTransform: 'uppercase' }}>{dev.type}</span>
                        <span className="ud-event__text">{dev.name}{dev.serial ? ` · ${dev.serial}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                )
              }
            </div>
          )}
          {tab === 'profile'  && <VehicleProfileRight vehicle={vehicle} account={account} />}
          {tab === 'devices' && <DevicesRight devices={vehicle.devices ?? []} />}
        </div>
      </div>
    </div>
  )
}

function DevicesDetail({ devices }) {
  return (
    <div className="ud-section">
      <span className="ud-section__title">LINKED DEVICES</span>
      {devices.length === 0 && <span className="ud-events-empty">No devices assigned</span>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {devices.map(dev => <DeviceCard key={dev.id} dev={dev} />)}
      </div>
    </div>
  )
}

function DevicesRight({ devices }) {
  const online  = devices.filter(d => d.status === 'online').length
  const offline = devices.filter(d => d.status === 'offline').length
  return (
    <div className="ud-section">
      <span className="ud-section__title">SUMMARY</span>
      <div className="ud-person-stats">
        <div className="ud-stat-tile">
          <span className="ud-stat-tile__label">TOTAL</span>
          <span className="ud-stat-tile__value" style={{ color: '#DFE4E6' }}>{devices.length}</span>
          <span className="ud-stat-tile__sub">Assigned devices</span>
        </div>
        <div className="ud-stat-tile">
          <span className="ud-stat-tile__label">ONLINE</span>
          <span className="ud-stat-tile__value" style={{ color: online > 0 ? '#37C2B8' : '#66727A' }}>{online}</span>
          <span className="ud-stat-tile__sub">Active</span>
        </div>
        <div className="ud-stat-tile">
          <span className="ud-stat-tile__label">OFFLINE</span>
          <span className="ud-stat-tile__value" style={{ color: offline > 0 ? '#E0A63C' : '#66727A' }}>{offline}</span>
          <span className="ud-stat-tile__sub">No signal</span>
        </div>
      </div>
    </div>
  )
}

function DeviceCard({ dev }) {
  const isOnline = dev.status === 'online'
  return (
    <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: `1px solid ${isOnline ? 'rgba(55,194,184,0.2)' : 'rgba(255,255,255,0.05)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? '#37C2B8' : '#66727A', boxShadow: isOnline ? '0 0 6px #37C2B888' : 'none', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#EEF2F3', flex: 1 }}>{dev.name}</span>
        <span style={{ fontFamily: 'var(--adm-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: isOnline ? '#37C2B8' : '#66727A' }}>{dev.status}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
        {[
          ['Type',     dev.type],
          ['Model',    dev.model],
          ['Serial',   dev.serial],
          ['IMEI',     dev.imei],
          ['Firmware', dev.firmware],
          ['Traccar',  dev.traccarDeviceId ? `ID ${dev.traccarDeviceId}` : null],
        ].filter(([, v]) => v).map(([label, value]) => (
          <div key={label}>
            <div style={{ fontFamily: 'var(--adm-mono)', fontSize: 8, fontWeight: 600, letterSpacing: '0.1em', color: '#4A5A62', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
            <div style={{ fontFamily: 'var(--adm-mono)', fontSize: 11, color: '#AEB8BD' }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function VehicleProfileLeft({ vehicle }) {
  return (
    <>
      <ProfileSection title="VEHICLE">
        {vehicle.plate      && <ProfileField label="Plate"       value={vehicle.plate} mono />}
        {vehicle.make       && <ProfileField label="Make"        value={vehicle.make} />}
        {vehicle.model      && <ProfileField label="Model"       value={vehicle.model} />}
        {vehicle.year       && <ProfileField label="Year"        value={vehicle.year} />}
        {vehicle.color      && <ProfileField label="Color"       value={vehicle.color} />}
        {vehicle.armorLevel && <ProfileField label="Armor Level" value={vehicle.armorLevel} />}
        {!vehicle.plate && !vehicle.make && <ProfileField label="—" value="No vehicle info on file" />}
      </ProfileSection>
    </>
  )
}

function VehicleProfileRight({ vehicle, account }) {
  return (
    <>
      <ProfileSection title="ASSIGNMENT">
        {account?.name && <ProfileField label="Account" value={account.name} />}
        {!account?.name && <ProfileField label="—" value="No account assigned" />}
      </ProfileSection>
    </>
  )
}

function ProfileSection({ title, children }) {
  return (
    <div className="ud-section">
      <span className="ud-section__title">{title}</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px 20px' }}>
        {children}
      </div>
    </div>
  )
}

function ProfileField({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontFamily: 'var(--adm-mono)', fontSize: '8.5px', fontWeight: 600, letterSpacing: '0.1em', color: 'var(--adm-text-dim)', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--adm-text-muted)', fontFamily: mono ? 'var(--adm-mono)' : undefined, letterSpacing: mono ? '0.04em' : undefined }}>
        {value}
      </span>
    </div>
  )
}

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
