import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccounts } from '../contexts/AccountsContext'
import { useLivePositions } from '../../../shared/hooks/useLivePositions'
import './UnitList.css'

import { UNIT_STATUS as STATUS_META } from '../../../shared/constants/status.js'

function sortByStatus(units) {
  const order = { duress: 0, warning: 1, normal: 2, offline: 3 }
  return [...units].sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4))
}

export default function UnitList() {
  const { accounts } = useAccounts()
  const positions    = useLivePositions()
  const [collapsedAccounts, setCollapsedAccounts] = useState(new Set())

  function toggleAccount(accountId) {
    setCollapsedAccounts(prev => {
      const next = new Set(prev)
      next.has(accountId) ? next.delete(accountId) : next.add(accountId)
      return next
    })
  }

  const allUnits = useMemo(() => {
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
          accountId:   acc.id,
          accountName: acc.name,
          deviceCount: unit.devices?.length ?? 0,
          isLive:      !!pos,
          speed:       pos ? Math.round(pos.speed * 1.852) : null,
          heading:     pos?.course ?? null,
        })
      }
    }
    return result
  }, [accounts, positions])

  const accountGroups = useMemo(() => {
    const byAccount = new globalThis.Map()
    for (const unit of allUnits) {
      if (!byAccount.has(unit.accountId)) {
        byAccount.set(unit.accountId, { accountId: unit.accountId, accountName: unit.accountName, principals: [], vehicles: [] })
      }
      const g = byAccount.get(unit.accountId)
      if (unit.type === 'person') g.principals.push(unit)
      else g.vehicles.push(unit)
    }
    return Array.from(byAccount.values()).map(g => ({
      ...g,
      principals: sortByStatus(g.principals),
      vehicles:   sortByStatus(g.vehicles),
    }))
  }, [allUnits])

  if (allUnits.length === 0 && accounts.length === 0) {
    return <div className="unit-list-page"><div className="ul-empty">Loading…</div></div>
  }

  if (allUnits.length === 0) {
    return <div className="unit-list-page"><div className="ul-empty">No units found — add units via Accounts.</div></div>
  }

  return (
    <div className="unit-list-page">
      {accountGroups.map(group => {
        const collapsed = collapsedAccounts.has(group.accountId)
        const total = group.principals.length + group.vehicles.length
        return (
          <div key={group.accountId} className="ul-account-group">
            <button
              className="ul-account-header"
              onClick={() => toggleAccount(group.accountId)}
              aria-expanded={!collapsed}
            >
              <span className="ul-account-header__name">{group.accountName}</span>
              <span className="ul-account-header__count">{total}</span>
              <span className={`ul-account-header__chevron${collapsed ? '' : ' open'}`}>›</span>
            </button>

            {!collapsed && (
              <div className="ul-account-body">
                {group.principals.length > 0 && (
                  <section className="ul-section">
                    <div className="ul-section__header">
                      <span className="ul-section__label">PRINCIPALS</span>
                      <span className="ul-section__line" />
                      <span className="ul-section__count">{group.principals.length}</span>
                    </div>
                    <div className="ul-grid">
                      {group.principals.map(u => <UnitCard key={u.id} unit={u} />)}
                    </div>
                  </section>
                )}

                {group.vehicles.length > 0 && (
                  <section className="ul-section">
                    <div className="ul-section__header">
                      <span className="ul-section__label">VEHICLES</span>
                      <span className="ul-section__line" />
                      <span className="ul-section__count">{group.vehicles.length}</span>
                    </div>
                    <div className="ul-grid">
                      {group.vehicles.map(u => <UnitCard key={u.id} unit={u} />)}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function UnitCard({ unit }) {
  const navigate   = useNavigate()
  const meta       = STATUS_META[unit.status] ?? STATUS_META.offline
  const detailPath = `/admin/unit/${unit.type === 'person' ? 'principal' : 'vehicle'}/${unit.id}`

  return (
    <article
      className={`ul-card status-${unit.status}`}
      onClick={() => navigate(detailPath)}
      role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && navigate(detailPath)}
      aria-label={`${unit.name} — ${meta.label}`}
    >
      <span className="ul-card__bar" style={{ background: meta.color }} />

      <div className="ul-card__top">
        <div className="ul-card__id-row">
          <span className="ul-card__dot" style={{ background: meta.color, boxShadow: unit.isLive ? `0 0 8px ${meta.color}99` : 'none' }} />
          <span className="ul-card__id">{unit.name}</span>
        </div>
        <span className="ul-card__chip" style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}44` }}>
          {meta.label}
        </span>
      </div>

      <div className="ul-card__who">
        <span className="ul-card__type-icon">
          {unit.type === 'vehicle' ? <VehicleIcon /> : <PersonIcon />}
        </span>
        <div className="ul-card__principal-block">
          <span className="ul-card__role">{unit.deviceCount} device{unit.deviceCount !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="ul-card__divider" />

      <div className="ul-card__location">
        <LocationIcon />
        <span className="ul-card__loc-text" style={{ color: unit.isLive ? '#22D3EE' : undefined }}>
          {unit.isLive ? 'LIVE TRACKING' : 'No signal'}
        </span>
      </div>

      {unit.isLive && (
        <div className="ul-card__speed-row">
          <span className="ul-card__speed" style={{ color: '#22D3EE' }}>{unit.speed} KPH</span>
          {unit.heading != null && unit.heading > 0 && (
            <span className="ul-card__heading">HDG {unit.heading}°</span>
          )}
        </div>
      )}

      <div className="ul-card__footer">
        <span className="ul-card__updated" style={unit.isLive ? { color: '#22D3EE' } : undefined}>
          {unit.isLive ? '● LIVE' : 'No signal'}
        </span>
        <span className="ul-card__cta">VIEW DETAIL →</span>
      </div>
    </article>
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

function LocationIcon() {
  return (
    <svg width="9" height="12" viewBox="0 0 9 12" fill="none" aria-hidden>
      <path d="M4.5 1C2.57 1 1 2.57 1 4.5c0 2.8 3.5 6.5 3.5 6.5S8 7.3 8 4.5C8 2.57 6.43 1 4.5 1Z" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="4.5" cy="4.5" r="1.2" fill="currentColor"/>
    </svg>
  )
}
