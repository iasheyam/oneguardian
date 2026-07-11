import { useState, useMemo, useEffect } from 'react'
import { apiUrl } from '../../../shared/utils/api'
import { humanizeTime } from '../../../shared/utils/time'
import './LogsPage.css'

const EVENT_LABELS = {
  'user.login':           'Login',
  'user.logout':          'Logout',
  'user.invite_sent':     'Invite Sent',
  'user.password_changed':'Password Changed',
  'member.updated':       'Member Updated',
  'member.role_changed':  'Role Changed',
}

const EVENT_COLORS = {
  'user.login':           '#37C2B8',
  'user.logout':          '#66727A',
  'user.invite_sent':     '#7B8FBD',
  'user.password_changed':'#E0A63C',
  'member.updated':       '#5AA9C2',
  'member.role_changed':  '#9B6BCC',
}

const DATE_PRESETS = [
  { key: 'today',   label: 'Today'       },
  { key: '7d',      label: 'Last 7 days' },
  { key: '30d',     label: 'Last 30 days'},
  { key: 'all',     label: 'All time'    },
]

function withinPreset(createdAt, preset) {
  if (preset === 'all') return true
  const d     = new Date(createdAt)
  const now   = new Date()
  const start = new Date()
  if (preset === 'today') { start.setHours(0, 0, 0, 0) }
  if (preset === '7d')    { start.setDate(now.getDate() - 7) }
  if (preset === '30d')   { start.setDate(now.getDate() - 30) }
  return d >= start
}

export default function LogsPage() {
  const [search,      setSearch]      = useState('')
  const [eventFilter, setEventFilter] = useState('all')
  const [datePreset,  setDatePreset]  = useState('30d')
  const [logs,        setLogs]        = useState([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    fetch(apiUrl('/api/logs'))
      .then(r => r.json())
      .then(data => { setLogs(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const allEvents = ['all', ...Object.keys(EVENT_LABELS)]

  const filtered = useMemo(() => {
    return logs.filter(log => {
      if (eventFilter !== 'all' && log.event !== eventFilter) return false
      if (!withinPreset(log.createdAt, datePreset)) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchDesc  = log.description.toLowerCase().includes(q)
        const matchEvent = log.event.toLowerCase().includes(q)
        const matchActor = log.actor?.email?.toLowerCase().includes(q) || log.actor?.name?.toLowerCase().includes(q)
        if (!matchDesc && !matchEvent && !matchActor) return false
      }
      return true
    })
  }, [logs, search, eventFilter, datePreset])

  return (
    <div className="logs-page">
      {/* ── filter bar ── */}
      <div className="logs-filters">
        <div className="logs-search">
          <SearchIcon />
          <input
            className="logs-search__input"
            placeholder="Search description, event, actor…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="logs-search__clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        <div className="logs-filter-group">
          <span className="logs-filter-label">EVENT</span>
          <div className="logs-pills">
            {allEvents.map(key => (
              <button
                key={key}
                className={`logs-pill${eventFilter === key ? ' active' : ''}`}
                onClick={() => setEventFilter(key)}
                style={eventFilter === key && key !== 'all'
                  ? { borderColor: EVENT_COLORS[key], color: EVENT_COLORS[key], background: `${EVENT_COLORS[key]}18` }
                  : {}
                }
              >
                {key === 'all' ? 'All events' : EVENT_LABELS[key]}
              </button>
            ))}
          </div>
        </div>

        <div className="logs-filter-group">
          <span className="logs-filter-label">PERIOD</span>
          <div className="logs-pills">
            {DATE_PRESETS.map(p => (
              <button
                key={p.key}
                className={`logs-pill${datePreset === p.key ? ' active' : ''}`}
                onClick={() => setDatePreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── table ── */}
      <div className="logs-table-wrap">
        <div className="logs-count">
          {loading ? '—' : `${filtered.length} ${filtered.length === 1 ? 'event' : 'events'}`}
        </div>
        <table className="logs-table">
          <thead>
            <tr>
              <th>TIMESTAMP</th>
              <th>EVENT</th>
              <th>DESCRIPTION</th>
              <th>ACTOR</th>
              <th>SUBJECT</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="logs-td-empty">Loading…</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="logs-td-empty">No events match your filters.</td>
              </tr>
            ) : (
              filtered.map(log => (
                <tr key={log.id}>
                  <td className="logs-td-time" title={new Date(log.createdAt).toLocaleString()}>
                    {humanizeTime(log.createdAt)}
                  </td>
                  <td>
                    <EventChip event={log.event} />
                  </td>
                  <td className="logs-td-desc">{log.description}</td>
                  <td>
                    <PersonLink person={log.actor} />
                  </td>
                  <td>
                    <PersonLink person={log.subject} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PersonLink({ person }) {
  if (!person) return <span className="logs-td-nil">—</span>
  return (
    <a
      className="logs-person-link"
      href={`/admin/settings/members/${person.id}`}
      target="_blank"
      rel="noreferrer"
    >
      {person.name}
    </a>
  )
}

function EventChip({ event }) {
  const color = EVENT_COLORS[event] ?? '#66727A'
  const label = EVENT_LABELS[event] ?? event
  return (
    <span className="logs-event-chip" style={{ color, background: `${color}18`, borderColor: `${color}44` }}>
      {label}
    </span>
  )
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 10l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
