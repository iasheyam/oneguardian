import { useState, useRef, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Map, { Marker, Source, Layer } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useAccounts } from '../contexts/AccountsContext'
import { useLivePositions } from '../../../shared/hooks/useLivePositions'
import { apiUrl, apiFetch } from '../../../shared/utils/api'
import { reverseGeocode, getTimezoneId } from '../../../shared/utils/googlePlaces'
import { MapControls, MAP_STYLES } from '../components/MapControls'
import ZoneLayers from '../components/ZoneLayers'
import MarkerPins from '../components/MarkerPins'
import './UnitDetail.css'

function toLocalDt(date) {
  const p = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`
}

function interpolateRoute(coords, progress) {
  if (!coords || coords.length === 0) return null
  if (coords.length === 1) return coords[0]
  const t = Math.max(0, Math.min(1, progress / 100))
  const segs = []; let total = 0
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

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const INITIAL_VIEW = { longitude: -90.5069, latitude: 14.5980, zoom: 13 }
const STATUS_META = {
  normal:  { color: '#37C2B8', label: 'SECURE'  },
  warning: { color: '#E0A63C', label: 'WARNING' },
  duress:  { color: '#F2495B', label: 'DURESS'  },
  offline: { color: '#66727A', label: 'OFFLINE' },
}

export default function PrincipalDetail() {
  const { id }       = useParams()
  const navigate     = useNavigate()
  const { accounts } = useAccounts()
  const positions    = useLivePositions()

  const [tab, setTab]           = useState('live')
  const [mapStyle, setMapStyle] = useState('dark')
  const [fullscreen, setFullscreen] = useState(false)
  const [routeCoords,   setRouteCoords]   = useState([])
  const [routeProgress, setRouteProgress] = useState(100)
  const [loadingRoute,  setLoadingRoute]  = useState(false)
  const [fromDt, setFromDt] = useState(() => toLocalDt(new Date(Date.now() - 8 * 60 * 60 * 1000)))
  const [toDt,   setToDt]   = useState(() => toLocalDt(new Date()))
  const [fetchTrigger, setFetchTrigger] = useState(0)
  const mapRef   = useRef(null)
  const scrubRef = useRef(null)

  const [address,  setAddress]  = useState(null)
  const [timezone, setTimezone] = useState(null)
  const [now,      setNow]      = useState(() => Date.now())

  // Find unit across all accounts where type === 'person'
  const { unit, accountName } = useMemo(() => {
    for (const acc of accounts) {
      const found = acc.units?.find(u => u.id === id && u.type === 'person')
      if (found) return { unit: found, accountId: acc.id, accountName: acc.name }
    }
    return { unit: null, accountId: null, accountName: null }
  }, [accounts, id])

  // All devices that have a Traccar ID and a live position
  const liveDevices = useMemo(() => {
    if (!unit?.devices) return []
    return unit.devices
      .filter(d => d.traccarDeviceId && positions[d.traccarDeviceId])
      .map(d => ({ device: d, pos: positions[d.traccarDeviceId], isPrimary: d.id === unit.primaryDeviceId }))
  }, [unit, positions])

  // Primary device (for stats, fly-to, history)
  const primaryLive     = liveDevices.find(ld => ld.isPrimary) ?? liveDevices[0] ?? null
  const livePos         = primaryLive?.pos ?? null
  const isLive          = liveDevices.length > 0

  // For history route fetching: use primary device's Traccar ID, fallback to first
  const traccarDeviceId = (
    unit?.devices?.find(d => d.id === unit.primaryDeviceId)?.traccarDeviceId
    ?? unit?.devices?.find(d => d.traccarDeviceId)?.traccarDeviceId
  )

  const meta     = STATUS_META[unit?.status ?? 'offline'] ?? STATUS_META.offline
  const speedKph = livePos ? (livePos.speed * 1.852).toFixed(1) : null

  // Escape key exits fullscreen
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setFullscreen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Resize map after fullscreen toggle
  useEffect(() => {
    const timer = setTimeout(() => mapRef.current?.resize(), 50)
    return () => clearTimeout(timer)
  }, [fullscreen])

  // Clock — ticks every second, drives local time + signal age displays
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Reverse-geocode + timezone — only refetches when position moves ~100 m
  const geoLat = livePos ? +(livePos.latitude.toFixed(3))  : null
  const geoLng = livePos ? +(livePos.longitude.toFixed(3)) : null
  useEffect(() => {
    if (!geoLat || !geoLng) { setAddress(null); return }
    reverseGeocode(geoLat, geoLng).then(setAddress).catch(() => {})
    getTimezoneId(geoLat, geoLng).then(setTimezone).catch(() => {})
  }, [geoLat, geoLng]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fly to primary live device when position arrives — only on live tab
  useEffect(() => {
    const map = mapRef.current
    if (!map || !livePos || tab !== 'live') return
    map.flyTo({ center: [livePos.longitude, livePos.latitude], zoom: 14, duration: 700 })
  }, [livePos?.latitude, livePos?.longitude, tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-trigger first load when switching to history tab
  useEffect(() => {
    if (tab === 'history') setFetchTrigger(t => t + 1)
  }, [tab])

  // Fetch route history on trigger (tab switch or manual Load)
  useEffect(() => {
    if (tab !== 'history' || !traccarDeviceId || fetchTrigger === 0) return
    setLoadingRoute(true)
    setRouteCoords([])
    setRouteProgress(100)
    const from = new Date(fromDt).toISOString()
    const to   = new Date(toDt).toISOString()
    apiFetch(apiUrl(`/api/traccar/positions/${traccarDeviceId}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`))
      .then(r => r.json())
      .then(positions => setRouteCoords(positions.map(p => [p.longitude, p.latitude])))
      .catch(() => {})
      .finally(() => setLoadingRoute(false))
  }, [fetchTrigger, traccarDeviceId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fit map to route bounds when route loads
  useEffect(() => {
    if (tab !== 'history' || routeCoords.length < 2 || !mapRef.current) return
    const lngs = routeCoords.map(c => c[0])
    const lats  = routeCoords.map(c => c[1])
    mapRef.current.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 60, duration: 700 }
    )
  }, [routeCoords, tab])

  const playhead        = useMemo(() => interpolateRoute(routeCoords, routeProgress), [routeCoords, routeProgress])
  const completedCoords = useMemo(() => sliceRoute(routeCoords, routeProgress),       [routeCoords, routeProgress])

  function handleScrub(e) {
    const rect = scrubRef.current.getBoundingClientRect()
    const pct  = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    setRouteProgress(Math.round(pct))
  }

  // Loading / not-found guards (after all hooks)
  if (accounts.length === 0) return null

  if (!unit) {
    return (
      <div className="ud-not-found">
        <span>Principal {id} not found.</span>
        <button onClick={() => navigate(-1)}>← Back</button>
      </div>
    )
  }

  const initials = (unit.name ?? '?')
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="unit-detail">
      {/* ── header ────────────────────────────────── */}
      <div className="ud-header">
        <button className="ud-back" onClick={() => navigate(-1)}>← PRINCIPALS</button>
        <div className="ud-header__main">
          <div className="ud-header__id-row">
            {/* Avatar */}
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: '#1A2226',
              border: '2px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--adm-mono)', fontSize: 16, fontWeight: 700,
              color: '#AEB8BD', flexShrink: 0, overflow: 'hidden',
            }}>
              {unit.photoUrl
                ? <img src={unit.photoUrl} alt={unit.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span>{initials}</span>
              }
            </div>

            <span
              className="ud-header__dot"
              style={{ background: meta.color, boxShadow: `0 0 10px ${meta.color}99` }}
            />
            <span className="ud-header__id">{unit.name}</span>
            {unit.role && <span className="ud-header__callsign">{unit.role}</span>}
            <span
              className="ud-header__chip"
              style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}44` }}
            >
              {meta.label}
            </span>
            {isLive && (
              <span style={{
                fontFamily: 'var(--adm-mono)',
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.08em',
                color: '#37C2B8',
                background: 'rgba(55,194,184,0.12)',
                border: '1px solid rgba(55,194,184,0.35)',
                padding: '2px 7px',
                borderRadius: 4,
              }}>
                LIVE
              </span>
            )}
          </div>

        </div>
      </div>

      {/* ── tabs ──────────────────────────────────── */}
      <div className="ud-tabs">
        {[['live', 'LIVE'], ['history', 'HISTORY'], ['profile', 'PROFILE'], ['devices', 'DEVICES']].map(([t, label]) => (
          <button key={t} className={`ud-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>

      {/* ── history date-range bar ────────────────────────────────── */}
      {tab === 'history' && (
        <div className="ud-history-bar">
          <div className="ud-history-bar__group">
            <label className="ud-history-bar__label">FROM</label>
            <input
              type="datetime-local"
              className="ud-history-bar__input"
              value={fromDt}
              max={toDt}
              onChange={e => setFromDt(e.target.value)}
            />
          </div>
          <span className="ud-history-bar__sep">→</span>
          <div className="ud-history-bar__group">
            <label className="ud-history-bar__label">TO</label>
            <input
              type="datetime-local"
              className="ud-history-bar__input"
              value={toDt}
              min={fromDt}
              onChange={e => setToDt(e.target.value)}
            />
          </div>
          <button
            className="ud-history-bar__load"
            disabled={loadingRoute || !fromDt || !toDt}
            onClick={() => setFetchTrigger(t => t + 1)}
          >
            {loadingRoute ? 'Loading…' : 'Load'}
          </button>
        </div>
      )}

      {/* ── map — always mounted, tab only changes what's inside ── */}
      <div className={`ud-map${fullscreen ? ' fullscreen' : ''}`}>
        <Map
          ref={mapRef}
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={INITIAL_VIEW}
          style={{ width: '100%', height: '100%' }}
          mapStyle={MAP_STYLES[mapStyle]}
          attributionControl={false}
        >
          <MapControls mapStyle={mapStyle} onStyleChange={setMapStyle} />
          <ZoneLayers />
          <MarkerPins />

          {/* LIVE — one marker per device with a live position */}
          {tab === 'live' && liveDevices.map(({ device, pos }) => {
            const spd        = (pos.speed * 1.852).toFixed(1)
            const isMainMarker = device.id === primaryLive?.device.id
            return isMainMarker ? (
              <Marker key={device.id} longitude={pos.longitude} latitude={pos.latitude} anchor="center">
                <div className="ud-live-marker">
                  <div className="ud-marker-dot-wrap">
                    <span className="ud-marker-ring" style={{ background: meta.color }} />
                    <span className="ud-marker-dot" style={{ background: meta.color, boxShadow: `0 0 14px ${meta.color}99` }} />
                  </div>
                  <span className="ud-marker-label" style={{ borderColor: `${meta.color}55` }}>
                    {device.name} · {spd} kph
                  </span>
                </div>
              </Marker>
            ) : (
              <Marker key={device.id} longitude={pos.longitude} latitude={pos.latitude} anchor="center">
                <div className="ud-live-marker">
                  <div className="ud-marker-dot-wrap">
                    <span className="ud-marker-dot" style={{ background: '#E0A63C', boxShadow: '0 0 10px #E0A63C88', width: 10, height: 10 }} />
                  </div>
                  <span className="ud-marker-label" style={{ borderColor: '#E0A63C55', color: '#E0A63C' }}>
                    {device.name} · {spd} kph
                  </span>
                </div>
              </Marker>
            )
          })}

          {/* HISTORY — trail + scrubber playhead */}
          {tab === 'history' && routeCoords.length >= 2 && (
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

        {/* floating badge */}
        <div className="ud-map-badge">
          {tab === 'live'    && (isLive ? 'LIVE POSITION' : 'NO SIGNAL')}
          {tab === 'history' && 'LOCATION HISTORY'}
          {tab === 'profile' && 'PROFILE'}
          {tab === 'devices' && 'DEVICES'}
        </div>

        {/* fullscreen toggle */}
        <button
          className="ud-map-fs-btn"
          onClick={() => setFullscreen(f => !f)}
          title={fullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
        >
          {fullscreen ? <CollapseIcon /> : <ExpandIcon />}
        </button>

        {tab === 'history' && routeCoords.length >= 2 && (
          <div className="ud-scrubber" onClick={handleScrub} ref={scrubRef}>
            <span className="ud-scrubber__label">START</span>
            <div className="ud-scrubber__track">
              <div className="ud-scrubber__fill"   style={{ width: `${routeProgress}%` }} />
              <div className="ud-scrubber__handle" style={{ left: `${routeProgress}%` }} />
            </div>
            <span className="ud-scrubber__label">{routeProgress}%</span>
          </div>
        )}

        {tab === 'history' && loadingRoute && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,14,16,0.6)', color: '#AEB8BD', fontFamily: 'var(--adm-mono)', fontSize: 11, letterSpacing: '0.1em' }}>
            LOADING HISTORY…
          </div>
        )}
      </div>

      {/* ── body ──────────────────────────────────── */}
      <div className="ud-body">
        <div className="ud-left">
          {tab === 'live'    && <PersonStats livePos={livePos} liveDeviceCount={liveDevices.length} address={address} timezone={timezone} now={now} />}
          {tab === 'history' && !loadingRoute && (
            <div className="ud-section">
              <span className="ud-section__title">ROUTE STATS</span>
              {routeCoords.length < 2 ? (
                <span className="ud-events-empty">
                  {traccarDeviceId ? 'No location history for the last 8 hours' : 'No tracking device linked to this principal'}
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
          {tab === 'profile' && <ProfileLeft unit={unit} />}
          {tab === 'devices' && <DevicesDetail devices={unit.devices ?? []} />}
        </div>
        <div className="ud-right">
          {tab === 'live'    && <LiveRight livePos={livePos} liveDeviceCount={liveDevices.length} now={now} />}
          {tab === 'history' && (
            <div className="ud-section">
              <span className="ud-section__title">DEVICES</span>
              {(!unit.devices || unit.devices.length === 0)
                ? <span className="ud-events-empty">No devices linked</span>
                : (
                  <ul className="ud-events">
                    {unit.devices.map(dev => (
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
          {tab === 'profile' && <ProfileRight unit={unit} accountName={accountName} />}
          {tab === 'devices' && <DevicesRight devices={unit.devices ?? []} />}
        </div>
      </div>
    </div>
  )
}

/* ── PersonStats ─────────────────────────────────────────────── */
function PersonStats({ livePos, liveDeviceCount, address, timezone, now }) {
  const speedKph = livePos ? (livePos.speed * 1.852).toFixed(1) : null
  const attrs    = livePos?.attributes ?? {}
  const battery  = attrs.batteryLevel !== undefined ? Math.round(attrs.batteryLevel) : null
  const motion   = attrs.motion !== undefined ? (attrs.motion ? 'Moving' : 'Stationary') : null

  const localTime = timezone
    ? new Date(now).toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
    : null

  const signalSecs = livePos?.serverTime
    ? Math.floor((now - new Date(livePos.serverTime).getTime()) / 1000)
    : null

  const batteryColor = battery === null ? '#66727A'
    : battery < 20 ? '#F2495B'
    : battery < 40 ? '#E0A63C'
    : '#37C2B8'

  return (
    <div className="ud-section">
      <span className="ud-section__title">LIVE TELEMETRY</span>

      {/* Address */}
      <div className="ud-address-card">
        {address
          ? <>
              <span className="ud-address-card__text">{address}</span>
              {signalSecs !== null && (
                <span className="ud-address-card__sub">
                  Updated {signalSecs < 60 ? `${signalSecs}s` : `${Math.floor(signalSecs / 60)}m ${signalSecs % 60}s`} ago
                  {livePos.fixTime && ` · ${new Date(livePos.fixTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} UTC`}
                </span>
              )}
            </>
          : <span className="ud-address-card__sub">{livePos ? 'Resolving address…' : 'No signal'}</span>
        }
      </div>

      <div className="ud-person-stats">
        <div className="ud-stat-tile">
          <span className="ud-stat-tile__label">LOCAL TIME</span>
          <span className="ud-stat-tile__value" style={{ color: '#DFE4E6', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
            {localTime ?? '—'}
          </span>
          <span className="ud-stat-tile__sub">{timezone ? timezone.replace(/_/g, ' ') : 'At location'}</span>
        </div>

        <div className="ud-stat-tile">
          <span className="ud-stat-tile__label">SPEED</span>
          <span className="ud-stat-tile__value" style={{ color: '#DFE4E6' }}>
            {speedKph ?? '—'}
          </span>
          <span className="ud-stat-tile__sub">{livePos ? 'kph' : 'No signal'}</span>
        </div>

        <div className="ud-stat-tile">
          <span className="ud-stat-tile__label">MOTION</span>
          <span className="ud-stat-tile__value"
            style={{ color: motion === 'Moving' ? '#37C2B8' : motion === 'Stationary' ? '#AEB8BD' : '#66727A', fontSize: 14 }}>
            {motion ?? '—'}
          </span>
          <span className="ud-stat-tile__sub">State</span>
        </div>

        <div className="ud-stat-tile">
          <span className="ud-stat-tile__label">BATTERY</span>
          <span className="ud-stat-tile__value" style={{ color: batteryColor }}>
            {battery !== null ? `${battery}%` : '—'}
          </span>
          <span className="ud-stat-tile__sub">{battery !== null ? 'Device' : 'No data'}</span>
        </div>
      </div>
    </div>
  )
}

/* ── LiveRight ────────────────────────────────────────────────── */
function LiveRight({ livePos, liveDeviceCount, now }) {
  if (!livePos) return (
    <div className="ud-section">
      <span className="ud-section__title">POSITION DATA</span>
      <span className="ud-events-empty">No live data</span>
    </div>
  )

  const attrs      = livePos.attributes ?? {}
  const signalSecs = Math.floor((now - new Date(livePos.serverTime).getTime()) / 1000)
  const signalColor = signalSecs < 30 ? '#37C2B8' : signalSecs < 120 ? '#E0A63C' : '#F2495B'
  const signalText  = signalSecs < 60
    ? `${signalSecs}s ago`
    : `${Math.floor(signalSecs / 60)}m ${signalSecs % 60}s ago`

  const rows = [
    ['LATITUDE',   `${livePos.latitude.toFixed(6)}°`,                   null],
    ['LONGITUDE',  `${livePos.longitude.toFixed(6)}°`,                  null],
    ['ALTITUDE',   livePos.altitude != null ? `${livePos.altitude} m` : '—', null],
    ['ACCURACY',   livePos.accuracy  != null ? `±${livePos.accuracy.toFixed(0)} m` : '—', null],
    ['HEADING',    livePos.course    != null ? `${livePos.course}°`   : '—', null],
    ['SATELLITES', attrs.sat         != null ? `${attrs.sat}`         : '—', null],
    ['TRACKING',   liveDeviceCount > 0 ? `${liveDeviceCount} device${liveDeviceCount > 1 ? 's' : ''}` : '—', null],
    ['SIGNAL',     signalText,                                          signalColor],
    ['FIX TIME',   new Date(livePos.fixTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' UTC', null],
  ]

  return (
    <div className="ud-section">
      <span className="ud-section__title">POSITION DATA</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {rows.map(([label, value, color]) => (
          <div key={label} className="ud-pos-row">
            <span className="ud-pos-row__label">{label}</span>
            <span className="ud-pos-row__value" style={color ? { color } : undefined}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── DevicesDetail (left col) ────────────────────────────────── */
function DevicesDetail({ devices }) {
  return (
    <div className="ud-section">
      <span className="ud-section__title">LINKED DEVICES</span>
      {devices.length === 0 && <span className="ud-events-empty">No devices assigned</span>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {devices.map(dev => (
          <DeviceCard key={dev.id} dev={dev} />
        ))}
      </div>
    </div>
  )
}

/* ── DevicesRight (right col) ────────────────────────────────── */
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

/* ── DeviceCard ──────────────────────────────────────────────── */
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

/* ── ProfileLeft ─────────────────────────────────────────────── */
function ProfileLeft({ unit }) {
  const hasMedical = unit.bloodGroup || unit.allergies || unit.conditions || unit.medications
  return (
    <>
      <ProfileSection title="CONTACT">
        {unit.phone && <ProfileField label="Phone" value={unit.phone} mono />}
        {unit.email && <ProfileField label="Email" value={unit.email} mono />}
        {unit.dob   && <ProfileField label="Date of Birth" value={unit.dob} />}
        {unit.height && <ProfileField label="Height" value={unit.height} />}
        {!unit.phone && !unit.email && <ProfileField label="—" value="No contact info on file" />}
      </ProfileSection>

      {(unit.emergContactName || unit.emergContactPhone || unit.emergContactRelation) && (
        <ProfileSection title="EMERGENCY CONTACT">
          {unit.emergContactName     && <ProfileField label="Name"     value={unit.emergContactName} />}
          {unit.emergContactPhone    && <ProfileField label="Phone"    value={unit.emergContactPhone} mono />}
          {unit.emergContactRelation && <ProfileField label="Relation" value={unit.emergContactRelation} />}
        </ProfileSection>
      )}

      {hasMedical && (
        <ProfileSection title="MEDICAL">
          {unit.bloodGroup  && <ProfileField label="Blood Group"  value={unit.bloodGroup}  highlight />}
          {unit.allergies   && <ProfileField label="Allergies"    value={unit.allergies} />}
          {unit.conditions  && <ProfileField label="Conditions"   value={unit.conditions} />}
          {unit.medications && <ProfileField label="Medications"  value={unit.medications} />}
        </ProfileSection>
      )}
    </>
  )
}

/* ── ProfileRight ────────────────────────────────────────────── */
function ProfileRight({ unit, accountName }) {
  return (
    <>
      <ProfileSection title="ASSIGNMENT">
        {accountName && <ProfileField label="Account" value={accountName} />}
        {!accountName && <ProfileField label="—" value="No account assigned" />}
      </ProfileSection>

      {unit.groups?.length > 0 && (
        <ProfileSection title="GROUPS">
          {unit.groups.map((g, i) => (
            <ProfileField key={i} label={`Group ${i + 1}`} value={g} />
          ))}
        </ProfileSection>
      )}
    </>
  )
}


/* ── ProfileSection ──────────────────────────────────────────── */
function ProfileSection({ title, children }) {
  return (
    <div className="ud-section">
      <span className="ud-section__title">{title}</span>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '12px 20px',
      }}>
        {children}
      </div>
    </div>
  )
}

/* ── ProfileField ────────────────────────────────────────────── */
function ProfileField({ label, value, mono, highlight }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{
        fontFamily: 'var(--adm-mono)',
        fontSize: '8.5px',
        fontWeight: 600,
        letterSpacing: '0.1em',
        color: 'var(--adm-text-dim)',
        textTransform: 'uppercase',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 13,
        lineHeight: 1.4,
        color: highlight ? '#F2495B' : 'var(--adm-text-muted)',
        fontWeight: highlight ? 600 : 400,
        fontFamily: mono ? 'var(--adm-mono)' : undefined,
        letterSpacing: mono ? '0.04em' : undefined,
      }}>
        {value}
      </span>
    </div>
  )
}

/* ── icons ───────────────────────────────────────────────────── */
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

