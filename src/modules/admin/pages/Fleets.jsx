import { useNavigate, useParams } from 'react-router-dom'
import { mockFleets } from '../data/mockFleets'
import { mockUnits  } from '../data/mockUnits'
import './Fleets.css'

const FLEET_STATUS_META = {
  active:   { color: '#37C2B8', label: 'ACTIVE'   },
  standby:  { color: '#E0A63C', label: 'STANDBY'  },
  inactive: { color: '#66727A', label: 'INACTIVE' },
}

const UNIT_STATUS_META = {
  normal:  { color: '#37C2B8', label: 'SECURE'  },
  warning: { color: '#E0A63C', label: 'WARNING' },
  duress:  { color: '#F2495B', label: 'DURESS'  },
  offline: { color: '#66727A', label: 'OFFLINE' },
}

/* ── helpers ──────────────────────────────────────────────────── */
function fleetUnitIds(fleet) {
  return [
    ...fleet.subgroups.flatMap(sg => sg.units),
    ...(fleet.units ?? []),
  ]
}

function resolveUnits(ids) {
  return ids.map(id => mockUnits.find(u => u.id === id)).filter(Boolean)
}

function alertCount(units) {
  return units.filter(u => u.status === 'warning' || u.status === 'duress').length
}

/* ══════════════════════════════════════════════════════════════
   PAGE 1 — Fleet Groups
══════════════════════════════════════════════════════════════ */
export function FleetGroups() {
  const navigate = useNavigate()

  return (
    <div className="fl-page">
      <div className="fl-page-header">
        <span className="fl-page-header__label">
          {mockFleets.length} fleet groups
        </span>
      </div>

      <div className="fl-grid fl-grid--groups">
        {mockFleets.map(fleet => {
          const meta    = FLEET_STATUS_META[fleet.status] ?? FLEET_STATUS_META.inactive
          const units   = resolveUnits(fleetUnitIds(fleet))
          const alerts  = alertCount(units)

          return (
            <button
              key={fleet.id}
              className={`fl-group-card${alerts > 0 ? ' has-alert' : ''}`}
              onClick={() => navigate(`/admin/fleets/${fleet.id}`)}
            >
              <div className="fl-group-card__top">
                <span className="fl-group-card__name">{fleet.name}</span>
                <span
                  className="fl-chip"
                  style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}44` }}
                >
                  {meta.label}
                </span>
              </div>

              <span className="fl-group-card__client">{fleet.client} · {fleet.industry}</span>
              <p className="fl-group-card__desc">{fleet.description}</p>

              <div className="fl-group-card__footer">
                <span className="fl-stat">{units.length} units</span>
                {fleet.subgroups.length > 0 && (
                  <span className="fl-stat">{fleet.subgroups.length} subgroups</span>
                )}
                {alerts > 0 && (
                  <span className="fl-alert-badge">{alerts} alert{alerts > 1 ? 's' : ''}</span>
                )}
                <span className="fl-group-card__arrow">→</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   PAGE 2 — Subgroups
══════════════════════════════════════════════════════════════ */
export function FleetSubgroups() {
  const { fleetId } = useParams()
  const navigate    = useNavigate()
  const fleet       = mockFleets.find(f => f.id === fleetId)

  if (!fleet) return <NotFound label="Fleet not found" />

  const meta       = FLEET_STATUS_META[fleet.status] ?? FLEET_STATUS_META.inactive
  const directIds  = fleet.units ?? []
  const hasSubgroups = fleet.subgroups.length > 0

  // Build the cards to show — real subgroups + a virtual "direct" card if needed
  const cards = [
    ...fleet.subgroups.map(sg => ({ id: sg.id, name: sg.name, unitIds: sg.units })),
    ...(directIds.length > 0 && !hasSubgroups
      ? [{ id: 'direct', name: 'All Vehicles', unitIds: directIds }]
      : directIds.length > 0
      ? [{ id: 'direct', name: 'Unassigned', unitIds: directIds }]
      : []),
  ]

  return (
    <div className="fl-page">
      <button className="fl-back" onClick={() => navigate('/admin/fleets')}>
        ← All groups
      </button>

      <div className="fl-section-header">
        <div className="fl-section-header__title-row">
          <h2 className="fl-section-header__name">{fleet.name}</h2>
          <span
            className="fl-chip"
            style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}44` }}
          >
            {meta.label}
          </span>
        </div>
        <span className="fl-section-header__sub">{fleet.client} · {fleet.industry}</span>
      </div>

      <div className="fl-grid fl-grid--subgroups">
        {cards.map(card => {
          const units  = resolveUnits(card.unitIds)
          const alerts = alertCount(units)

          return (
            <button
              key={card.id}
              className={`fl-subgroup-card${alerts > 0 ? ' has-alert' : ''}`}
              onClick={() => navigate(`/admin/fleets/${fleet.id}/${card.id}`)}
            >
              <div className="fl-subgroup-card__header">
                <span className="fl-subgroup-card__name">{card.name}</span>
                <span className="fl-subgroup-card__arrow">→</span>
              </div>

              <span className="fl-stat fl-subgroup-card__count">
                {units.length} unit{units.length !== 1 ? 's' : ''}
              </span>

              {alerts > 0 && (
                <span className="fl-alert-badge fl-subgroup-card__alert">
                  {alerts} alert{alerts > 1 ? 's' : ''}
                </span>
              )}

              {/* unit dots preview */}
              <div className="fl-subgroup-card__dots">
                {units.map(u => {
                  const m = UNIT_STATUS_META[u.status] ?? UNIT_STATUS_META.offline
                  return (
                    <span
                      key={u.id}
                      className="fl-subgroup-card__dot"
                      style={{
                        background: m.color,
                        boxShadow: u.status !== 'offline' ? `0 0 5px ${m.color}88` : 'none',
                      }}
                      title={`${u.id} · ${m.label}`}
                    />
                  )
                })}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   PAGE 3 — Vehicles
══════════════════════════════════════════════════════════════ */
export function FleetVehicles() {
  const { fleetId, subgroupId } = useParams()
  const navigate                = useNavigate()
  const fleet                   = mockFleets.find(f => f.id === fleetId)

  if (!fleet) return <NotFound label="Fleet not found" />

  const subgroup = subgroupId === 'direct'
    ? { id: 'direct', name: fleet.subgroups.length > 0 ? 'Unassigned' : 'All Vehicles', unitIds: fleet.units ?? [] }
    : (() => {
        const sg = fleet.subgroups.find(s => s.id === subgroupId)
        return sg ? { ...sg, unitIds: sg.units } : null
      })()

  if (!subgroup) return <NotFound label="Subgroup not found" />

  const units = resolveUnits(subgroup.unitIds)

  return (
    <div className="fl-page">
      <button className="fl-back" onClick={() => navigate(`/admin/fleets/${fleet.id}`)}>
        ← {fleet.name}
      </button>

      <div className="fl-section-header">
        <h2 className="fl-section-header__name">{subgroup.name}</h2>
        <span className="fl-section-header__sub">
          {fleet.name} · {units.length} unit{units.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="fl-grid fl-grid--vehicles">
        {units.map(unit => (
          <VehicleCard key={unit.id} unit={unit} />
        ))}
      </div>
    </div>
  )
}

/* ── vehicle card ─────────────────────────────────────────────── */
function VehicleCard({ unit }) {
  const navigate = useNavigate()
  const meta     = UNIT_STATUS_META[unit.status] ?? UNIT_STATUS_META.offline

  return (
    <button
      className={`fl-vehicle-card status-${unit.status}`}
      style={{ '--status-color': meta.color }}
      onClick={() => navigate(`/admin/unit/${unit.id}`)}
    >
      <div className="fl-vehicle-card__top">
        <div className="fl-vehicle-card__id-row">
          <span
            className="fl-vehicle-card__dot"
            style={{
              background: meta.color,
              boxShadow: unit.status !== 'offline' ? `0 0 8px ${meta.color}99` : 'none',
            }}
          />
          <span className="fl-vehicle-card__id">{unit.id}</span>
          <span className="fl-vehicle-card__callsign">{unit.callsign}</span>
        </div>
        <span
          className="fl-chip"
          style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}44` }}
        >
          {meta.label}
        </span>
      </div>

      <div className="fl-vehicle-card__body">
        <div className="fl-vehicle-card__row">
          <span className="fl-vehicle-card__field-label">PRINCIPAL</span>
          <span className="fl-vehicle-card__field-value">{unit.principal}</span>
        </div>
        {unit.vehicle && (
          <div className="fl-vehicle-card__row">
            <span className="fl-vehicle-card__field-label">VEHICLE</span>
            <span className="fl-vehicle-card__field-value">{unit.vehicle}</span>
          </div>
        )}
        <div className="fl-vehicle-card__row">
          <span className="fl-vehicle-card__field-label">LOCATION</span>
          <span className="fl-vehicle-card__field-value">{unit.location}</span>
        </div>
        <div className="fl-vehicle-card__row">
          <span className="fl-vehicle-card__field-label">SPEED</span>
          <span className="fl-vehicle-card__field-value mono">
            {unit.status === 'offline' ? '— NO SIGNAL' : `${unit.speed} MPH · HDG ${unit.heading}°`}
          </span>
        </div>
      </div>

      <div className="fl-vehicle-card__footer">
        <span className="fl-vehicle-card__updated">Updated {unit.lastUpdated} ago</span>
        <span className="fl-vehicle-card__open">OPEN DETAIL →</span>
      </div>
    </button>
  )
}

/* ── not found ────────────────────────────────────────────────── */
function NotFound({ label }) {
  const navigate = useNavigate()
  return (
    <div className="fl-not-found">
      <span>{label}</span>
      <button onClick={() => navigate('/admin/fleets')}>← Back to fleets</button>
    </div>
  )
}
