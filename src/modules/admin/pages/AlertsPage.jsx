import { useState, useMemo, useEffect } from 'react'
import { apiUrl, apiFetch } from '../../../shared/utils/api'
import { humanizeTime } from '../../../shared/utils/time'
import './AlertsPage.css'

const SEVERITY_LABELS = { red_alert: 'Red Alert', warning: 'Warning', advisory: 'Advisory' }
const SEVERITY_COLORS = { red_alert: '#F2495B', warning: '#E0A63C', advisory: '#7B8FBD' }
const STATUS_LABELS   = { active: 'Active', acknowledged: "Ack'd", resolved: 'Resolved', false_alarm: 'False Alarm' }
const STATUS_COLORS   = { active: '#F2495B', acknowledged: '#E0A63C', resolved: '#37C2B8', false_alarm: '#66727A' }

const DATE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: '7d',    label: 'Last 7 days' },
  { key: '30d',   label: 'Last 30 days' },
  { key: 'all',   label: 'All time' },
]

function withinPreset(ts, preset) {
  if (preset === 'all') return true
  const d = new Date(ts), now = new Date(), start = new Date()
  if (preset === 'today') start.setHours(0, 0, 0, 0)
  if (preset === '7d')    start.setDate(now.getDate() - 7)
  if (preset === '30d')   start.setDate(now.getDate() - 30)
  return d >= start
}

function positionSummary(pos) {
  if (!pos) return '—'
  const parts = []
  if (pos.speed !== undefined) parts.push(`${Math.round(pos.speed)} km/h`)
  if (pos.attributes?.alarm)   parts.push(pos.attributes.alarm)
  return parts.join(' · ') || '—'
}

export default function AlertsPage() {
  const [allAlerts,  setAllAlerts]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [actioningId, setActioningId] = useState(null)

  const [severityFilter, setSeverityFilter] = useState('all')
  const [statusFilter,   setStatusFilter]   = useState('all')
  const [simFilter,      setSimFilter]      = useState('all')
  const [datePreset,     setDatePreset]     = useState('30d')

  function reload() {
    setLoading(true)
    apiFetch(apiUrl('/api/alerts'))
      .then(r => r.json())
      .then(data => { setAllAlerts(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { reload() }, [])

  const filtered = useMemo(() => allAlerts.filter(a => {
    if (severityFilter !== 'all' && a.severity !== severityFilter)    return false
    if (statusFilter   !== 'all' && a.status   !== statusFilter)      return false
    if (simFilter === 'real' &&  a.isSimulation)                      return false
    if (simFilter === 'sim'  && !a.isSimulation)                      return false
    if (!withinPreset(a.firedAt, datePreset))                         return false
    return true
  }), [allAlerts, severityFilter, statusFilter, simFilter, datePreset])

  async function handleAction(alertId, newStatus) {
    setActioningId(alertId)
    try {
      const res = await apiFetch(apiUrl(`/api/alerts/${alertId}`), {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        const updated = await res.json()
        setAllAlerts(prev => prev.map(a => a.id === alertId ? { ...a, ...updated } : a))
      }
    } finally {
      setActioningId(null)
    }
  }

  return (
    <div className="alerts-page">

      <div className="alerts-filters">
        <FilterRow label="SEVERITY">
          {['all', 'red_alert', 'warning', 'advisory'].map(k => (
            <Pill key={k}
              active={severityFilter === k}
              color={k !== 'all' ? SEVERITY_COLORS[k] : undefined}
              onClick={() => setSeverityFilter(k)}
            >
              {k === 'all' ? 'All severities' : SEVERITY_LABELS[k]}
            </Pill>
          ))}
        </FilterRow>

        <FilterRow label="STATUS">
          {['all', 'active', 'acknowledged', 'resolved', 'false_alarm'].map(k => (
            <Pill key={k}
              active={statusFilter === k}
              color={k !== 'all' ? STATUS_COLORS[k] : undefined}
              onClick={() => setStatusFilter(k)}
            >
              {k === 'all' ? 'All statuses' : STATUS_LABELS[k]}
            </Pill>
          ))}
        </FilterRow>

        <div className="alerts-filter-row">
          <FilterRow label="TYPE">
            {[['all', 'All'], ['real', 'Real'], ['sim', 'Simulation']].map(([k, label]) => (
              <Pill key={k} active={simFilter === k} onClick={() => setSimFilter(k)}>{label}</Pill>
            ))}
          </FilterRow>
          <FilterRow label="PERIOD">
            {DATE_PRESETS.map(p => (
              <Pill key={p.key} active={datePreset === p.key} onClick={() => setDatePreset(p.key)}>{p.label}</Pill>
            ))}
          </FilterRow>
        </div>
      </div>

      <div className="alerts-table-wrap">
        <div className="alerts-count">
          {loading ? '—' : `${filtered.length} ${filtered.length === 1 ? 'alert' : 'alerts'}`}
        </div>
        <table className="alerts-table">
          <thead>
            <tr>
              <th>FIRED</th>
              <th>SEVERITY</th>
              <th>TRIGGER</th>
              <th>UNIT</th>
              <th>POSITION</th>
              <th>STATUS</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="alerts-td-empty">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="alerts-td-empty">No alerts match your filters.</td></tr>
            ) : filtered.map(alert => (
              <AlertRow
                key={alert.id}
                alert={alert}
                actioning={actioningId === alert.id}
                onAction={handleAction}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AlertRow({ alert, actioning, onAction }) {
  const sevColor = SEVERITY_COLORS[alert.severity] ?? '#66727A'
  const stColor  = STATUS_COLORS[alert.status]     ?? '#66727A'

  return (
    <tr>
      <td className="alerts-td-time" title={new Date(alert.firedAt).toLocaleString()}>
        {humanizeTime(alert.firedAt)}
      </td>
      <td>
        <div className="alerts-cell-stack">
          <Chip color={sevColor}>{SEVERITY_LABELS[alert.severity] ?? alert.severity}</Chip>
          {alert.isSimulation && <span className="alerts-sim-badge">SIM</span>}
        </div>
      </td>
      <td>
        <div className="alerts-trigger-cell">
          <span className="alerts-trigger-name">{alert.triggerName ?? '—'}</span>
          {alert.triggerType && (
            <span className="alerts-trigger-type">{alert.triggerType.replace(/_/g, ' ')}</span>
          )}
        </div>
      </td>
      <td>
        <div className="alerts-unit-cell">
          <span className={`alerts-unit-pill alerts-unit-pill--${alert.unitType}`}>
            {alert.unitType}
          </span>
          {alert.unitName && <span className="alerts-unit-name">{alert.unitName}</span>}
        </div>
      </td>
      <td className="alerts-td-pos">{positionSummary(alert.position)}</td>
      <td>
        <Chip color={stColor}>{STATUS_LABELS[alert.status] ?? alert.status}</Chip>
      </td>
      <td className="alerts-td-actions">
        {alert.status === 'active' && (
          <button className="alerts-action-btn" disabled={actioning}
            onClick={() => onAction(alert.id, 'acknowledged')}>
            Acknowledge
          </button>
        )}
        {alert.status === 'acknowledged' && (
          <button className="alerts-action-btn alerts-action-btn--resolve" disabled={actioning}
            onClick={() => onAction(alert.id, 'resolved')}>
            Resolve
          </button>
        )}
      </td>
    </tr>
  )
}

function FilterRow({ label, children }) {
  return (
    <div className="alerts-filter-group">
      <span className="alerts-filter-label">{label}</span>
      <div className="alerts-pills">{children}</div>
    </div>
  )
}

function Pill({ active, color, onClick, children }) {
  const style = active && color
    ? { borderColor: color, color, background: `${color}18` }
    : {}
  return (
    <button className={`alerts-pill${active ? ' active' : ''}`} style={style} onClick={onClick}>
      {children}
    </button>
  )
}

function Chip({ color, children }) {
  return (
    <span className="alerts-chip" style={{ color, background: `${color}18`, borderColor: `${color}44` }}>
      {children}
    </span>
  )
}
