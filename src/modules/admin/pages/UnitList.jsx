import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import './UnitList.css'

const STATUS_META = {
  normal:  { color: '#37C2B8', label: 'SECURE'  },
  warning: { color: '#E0A63C', label: 'WARNING' },
  duress:  { color: '#F2495B', label: 'DURESS'  },
  offline: { color: '#66727A', label: 'OFFLINE' },
}

export default function UnitList({ units }) {
  const vehicles = useMemo(() => sortByStatus(units.filter(u => u.type === 'vehicle')), [units])
  const people   = useMemo(() => sortByStatus(units.filter(u => u.type === 'person')),  [units])

  return (
    <div className="unit-list-page">
      {vehicles.length > 0 && (
        <section className="ul-section">
          <div className="ul-section__header">
            <span className="ul-section__label">VEHICLES</span>
            <span className="ul-section__line" />
            <span className="ul-section__count">{vehicles.length}</span>
          </div>
          <div className="ul-grid">
            {vehicles.map(u => <UnitCard key={u.id} unit={u} />)}
          </div>
        </section>
      )}

      {people.length > 0 && (
        <section className="ul-section">
          <div className="ul-section__header">
            <span className="ul-section__label">PEOPLE</span>
            <span className="ul-section__line" />
            <span className="ul-section__count">{people.length}</span>
          </div>
          <div className="ul-grid">
            {people.map(u => <UnitCard key={u.id} unit={u} />)}
          </div>
        </section>
      )}
    </div>
  )
}

function UnitCard({ unit }) {
  const navigate = useNavigate()
  const meta     = STATUS_META[unit.status] ?? STATUS_META.offline
  const speed    = unit.status === 'offline' ? 'NO SIGNAL' : `${unit.speed} MPH`
  const next     = unit.schedule?.find(s => s.status === 'upcoming' || s.status === 'active')
  const battLabel = unit.type === 'vehicle' ? 'FUEL' : 'BATTERY'
  const battVal   = unit.type === 'vehicle' ? unit.fuel : unit.battery

  return (
    <article
      className={`ul-card status-${unit.status}`}
      onClick={() => navigate(`/admin/unit/${unit.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && navigate(`/admin/unit/${unit.id}`)}
      aria-label={`${unit.id} ${unit.callsign} — ${meta.label}`}
    >
      {/* accent bar */}
      <span className="ul-card__bar" style={{ background: meta.color }} />

      {/* top row */}
      <div className="ul-card__top">
        <div className="ul-card__id-row">
          <span
            className="ul-card__dot"
            style={{
              background: meta.color,
              boxShadow: unit.status !== 'offline' ? `0 0 8px ${meta.color}99` : 'none',
            }}
          />
          <span className="ul-card__id">{unit.id}</span>
          <span className="ul-card__callsign">{unit.callsign}</span>
        </div>
        <span
          className="ul-card__chip"
          style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}44` }}
        >
          {meta.label}
        </span>
      </div>

      {/* type icon + principal */}
      <div className="ul-card__who">
        <span className="ul-card__type-icon">
          {unit.type === 'vehicle' ? <VehicleIcon /> : <PersonIcon />}
        </span>
        <div className="ul-card__principal-block">
          <span className="ul-card__principal">{unit.principal}</span>
          <span className="ul-card__role">{unit.principalRole}</span>
        </div>
      </div>

      {/* agent (vehicles only) */}
      {unit.type === 'vehicle' && unit.agent && unit.agent !== '—' && (
        <div className="ul-card__agent">
          <AgentIcon />
          <span>{unit.agent}</span>
        </div>
      )}

      {/* vehicle info */}
      {unit.type === 'vehicle' && (
        <div className="ul-card__vehicle">{unit.vehicle} · {unit.armorLevel}</div>
      )}

      <div className="ul-card__divider" />

      {/* location + speed */}
      <div className="ul-card__location">
        <LocationIcon />
        <span className="ul-card__loc-text">{unit.location}</span>
      </div>
      <div className="ul-card__speed-row">
        <span
          className="ul-card__speed"
          style={{ color: unit.status === 'warning' ? '#E0A63C' : unit.status === 'offline' ? '#66727A' : '#DFE4E6' }}
        >
          {speed}
        </span>
        {unit.status !== 'offline' && unit.heading > 0 && (
          <span className="ul-card__heading">HDG {unit.heading}°</span>
        )}
      </div>

      {/* next schedule item */}
      {next && (
        <div className="ul-card__next">
          <ClockIcon />
          <span className="ul-card__next-time">{next.time}</span>
          <span className="ul-card__next-label">{next.label}</span>
        </div>
      )}

      {/* indicators */}
      <div className="ul-card__indicators">
        {battVal !== null && battVal !== undefined && (
          <div className="ul-card__indicator">
            <span className="ul-card__indicator-label">{battLabel}</span>
            <div className="ul-card__indicator-bar">
              <div
                className="ul-card__indicator-fill"
                style={{
                  width: `${battVal}%`,
                  background: battVal < 30 ? '#E0A63C' : '#37C2B8',
                }}
              />
            </div>
            <span
              className="ul-card__indicator-val"
              style={{ color: battVal < 30 ? '#E0A63C' : undefined }}
            >
              {battVal}%
            </span>
          </div>
        )}
        {unit.type === 'vehicle' && unit.battery !== null && (
          <div className="ul-card__indicator">
            <span className="ul-card__indicator-label">BATTERY</span>
            <div className="ul-card__indicator-bar">
              <div
                className="ul-card__indicator-fill"
                style={{ width: `${unit.battery ?? 0}%`, background: '#37C2B8' }}
              />
            </div>
            <span className="ul-card__indicator-val">{unit.battery}%</span>
          </div>
        )}
      </div>

      {/* footer */}
      <div className="ul-card__footer">
        <span className="ul-card__updated">Updated {unit.lastUpdated} ago</span>
        <span className="ul-card__cta">VIEW DETAIL →</span>
      </div>
    </article>
  )
}

function sortByStatus(units) {
  const order = { duress: 0, warning: 1, normal: 2, offline: 3 }
  return [...units].sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4))
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

function AgentIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
      <circle cx="5.5" cy="3" r="2" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M1 10c0-2 2-3.5 4.5-3.5S10 8 10 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

function LocationIcon() {
  return (
    <svg width="9" height="12" viewBox="0 0 9 12" fill="none" aria-hidden>
      <path d="M4.5 1C2.57 1 1 2.57 1 4.5c0 2.8 3.5 6.5 3.5 6.5S8 7.3 8 4.5C8 2.57 6.43 1 4.5 1Z" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="4.5" cy="4.5" r="1.2" fill="currentColor"/>
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M5 2.5V5l1.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}
