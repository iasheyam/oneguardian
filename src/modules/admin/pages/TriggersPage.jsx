import { useState, useMemo, useEffect, useRef } from 'react'
import { apiUrl, apiFetch } from '../../../shared/utils/api'
import './TriggersPage.css'

const SEVERITY_META = {
  red_alert: { label: 'Red Alert', color: '#F43F5E' },
  warning:   { label: 'Warning',   color: '#FB923C' },
  advisory:  { label: 'Advisory',  color: '#7B8FBD' },
}

const SOURCE_META = {
  device:    { label: 'Device',    color: '#22D3EE' },
  server:    { label: 'Server',    color: '#9B6BCC' },
  scheduled: { label: 'Scheduled', color: '#64748B' },
}

const UNIT_TYPE_LABELS = {
  vehicle:   'Vehicle',
  principal: 'Principal',
  both:      'Both',
}

const CATEGORY_ORDER = [
  'panic_button', 'crash_detection', 'rollover_detection', 'duress_code',
  'gps_jamming', 'device_tampered', 'fall_detection',
  'red_zone_entry', 'motionless', 'device_offline', 'unauthorized_movement', 'ignition_outside_hours',
  'speed', 'harsh_braking', 'harsh_acceleration', 'sharp_cornering', 'idle_engine',
  'loss_of_power', 'fuel', 'low_tire_pressure', 'check_engine', 'engine_temp',
  'cabin_temp', 'door_open_moving', 'maintenance_due', 'tracker_battery',
  'heart_rate', 'blood_pressure', 'blood_oxygen', 'wearable_battery',
]

const CATEGORY_LABELS = {
  panic_button:          'Security & Safety',
  crash_detection:       'Security & Safety',
  rollover_detection:    'Security & Safety',
  duress_code:           'Security & Safety',
  gps_jamming:           'Security & Safety',
  device_tampered:       'Security & Safety',
  fall_detection:        'Security & Safety',
  red_zone_entry:        'Location & Movement',
  motionless:            'Location & Movement',
  device_offline:        'Location & Movement',
  unauthorized_movement: 'Location & Movement',
  ignition_outside_hours:'Location & Movement',
  speed:                 'Driver Behavior',
  harsh_braking:         'Driver Behavior',
  harsh_acceleration:    'Driver Behavior',
  sharp_cornering:       'Driver Behavior',
  idle_engine:           'Driver Behavior',
  loss_of_power:         'Vehicle Health',
  fuel:                  'Vehicle Health',
  low_tire_pressure:     'Vehicle Health',
  check_engine:          'Vehicle Health',
  engine_temp:           'Vehicle Health',
  cabin_temp:            'Vehicle Health',
  door_open_moving:      'Vehicle Health',
  maintenance_due:       'Vehicle Health',
  tracker_battery:       'Vehicle Health',
  heart_rate:            'Biometrics',
  blood_pressure:        'Biometrics',
  blood_oxygen:          'Biometrics',
  wearable_battery:      'Biometrics',
}

const SEVERITY_FILTERS = ['all', 'red_alert', 'warning', 'advisory']
const SOURCE_FILTERS   = ['all', 'device', 'server']
const UNIT_FILTERS     = ['all', 'vehicle', 'principal', 'both']

function formatCooldown(seconds) {
  if (seconds === null || seconds === undefined) return 'Default'
  if (seconds === 0) return 'Always'
  if (seconds < 60)  return `${seconds}s`
  if (seconds < 3600) return `${seconds / 60}m`
  return `${seconds / 3600}h`
}

function formatConditions(conditions) {
  if (!conditions || Object.keys(conditions).length === 0) return '—'
  const parts = []
  if ('operator' in conditions && 'value' in conditions) {
    parts.push(`${conditions.operator} ${conditions.value}${conditions.unit ? ` ${conditions.unit}` : ''}`)
  }
  if ('duration_seconds' in conditions) {
    const s = conditions.duration_seconds
    parts.push(`after ${s < 60 ? `${s}s` : s < 3600 ? `${s/60}m` : `${s/3600}h`}`)
  }
  if ('min' in conditions && 'max' in conditions) {
    parts.push(`${conditions.min}–${conditions.max}${conditions.unit ? ` ${conditions.unit}` : ''}`)
  }
  if ('min_speed_kmh' in conditions) {
    parts.push(`speed > ${conditions.min_speed_kmh} kmh`)
  }
  if ('interval_km' in conditions) {
    parts.push(`every ${conditions.interval_km} km`)
  }
  if ('sustained_seconds' in conditions) {
    parts.push(`for ${conditions.sustained_seconds}s`)
  }
  if ('measure' in conditions) {
    parts.push(conditions.measure)
  }
  return parts.join(', ') || '—'
}

export default function TriggersPage() {
  const [triggers,        setTriggers]        = useState([])
  const [loading,         setLoading]         = useState(true)
  const [search,          setSearch]          = useState('')
  const [severityFilter,  setSeverityFilter]  = useState('all')
  const [sourceFilter,    setSourceFilter]    = useState('all')
  const [unitFilter,      setUnitFilter]      = useState('all')
  const [groupByCategory, setGroupByCategory] = useState(true)
  const [editing,         setEditing]         = useState(null) // trigger being edited

  useEffect(() => {
    apiFetch(apiUrl('/api/triggers'))
      .then(r => r.json())
      .then(data => { setTriggers(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function handleSaved(updated) {
    setTriggers(prev => prev.map(t => t.id === updated.id ? updated : t))
    setEditing(null)
  }

  const filtered = useMemo(() => {
    return triggers.filter(t => {
      if (severityFilter !== 'all' && t.severity !== severityFilter) return false
      if (sourceFilter   !== 'all' && t.source   !== sourceFilter)   return false
      if (unitFilter     !== 'all' && t.unitType  !== unitFilter)     return false
      if (search.trim()) {
        const q = search.toLowerCase()
        if (!t.name.toLowerCase().includes(q) && !t.triggerType.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [triggers, search, severityFilter, sourceFilter, unitFilter])

  const grouped = useMemo(() => {
    if (!groupByCategory) return null
    const map = new Map()
    for (const t of filtered) {
      const cat = CATEGORY_LABELS[t.triggerType] ?? 'Other'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat).push(t)
    }
    // Sort triggers within each group by CATEGORY_ORDER then severity
    const severityRank = { red_alert: 0, warning: 1, advisory: 2 }
    map.forEach((rows, cat) => {
      rows.sort((a, b) => {
        const ai = CATEGORY_ORDER.indexOf(a.triggerType)
        const bi = CATEGORY_ORDER.indexOf(b.triggerType)
        if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
        return (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9)
      })
    })
    return map
  }, [filtered, groupByCategory])

  return (
    <div className="triggers-page">
      {/* ── filter bar ── */}
      <div className="triggers-filters">
        <div className="triggers-search">
          <SearchIcon />
          <input
            className="triggers-search__input"
            placeholder="Search by name or type…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="triggers-search__clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        <div className="triggers-filter-row">
          <FilterGroup label="SEVERITY" items={SEVERITY_FILTERS} active={severityFilter} onChange={setSeverityFilter}
            color={k => SEVERITY_META[k]?.color} labelOf={k => k === 'all' ? 'All' : SEVERITY_META[k]?.label} />
          <FilterGroup label="SOURCE"   items={SOURCE_FILTERS}   active={sourceFilter}   onChange={setSourceFilter}
            color={k => SOURCE_META[k]?.color}   labelOf={k => k === 'all' ? 'All' : SOURCE_META[k]?.label} />
          <FilterGroup label="UNIT"     items={UNIT_FILTERS}     active={unitFilter}     onChange={setUnitFilter}
            labelOf={k => k === 'all' ? 'All' : UNIT_TYPE_LABELS[k]} />

          <div className="triggers-group-toggle">
            <button
              className={`triggers-pill${groupByCategory ? ' active' : ''}`}
              onClick={() => setGroupByCategory(g => !g)}
            >
              Group by category
            </button>
          </div>
        </div>
      </div>

      {/* ── table ── */}
      <div className="triggers-table-wrap">
        <div className="triggers-count">
          {loading ? '—' : `${filtered.length} trigger${filtered.length !== 1 ? 's' : ''}`}
        </div>

        {loading ? (
          <div className="triggers-empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="triggers-empty">No triggers match your filters.</div>
        ) : groupByCategory && grouped ? (
          [...grouped.entries()].map(([cat, rows]) => (
            <div key={cat} className="triggers-group">
              <div className="triggers-group__label">{cat}</div>
              <TriggerTable rows={rows} onEdit={setEditing} />
            </div>
          ))
        ) : (
          <TriggerTable rows={filtered} onEdit={setEditing} />
        )}
      </div>

      {editing && (
        <EditPanel
          trigger={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

function TriggerTable({ rows, onEdit }) {
  return (
    <table className="triggers-table">
      <thead>
        <tr>
          <th>NAME</th>
          <th>TYPE</th>
          <th>SEVERITY</th>
          <th>CONDITIONS</th>
          <th>UNIT</th>
          <th>SOURCE</th>
          <th>SCOPE</th>
          <th>COOLDOWN</th>
          <th>STATUS</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(t => (
          <tr key={t.id} className="triggers-table__row">
            <td className="triggers-td-name">
              {t.name}
              {t.isSystem && <span className="triggers-badge triggers-badge--sys">SYSTEM</span>}
            </td>
            <td><span className="triggers-type-chip">{t.triggerType}</span></td>
            <td><SeverityChip severity={t.severity} /></td>
            <td className="triggers-td-conditions">{formatConditions(t.conditions)}</td>
            <td className="triggers-td-unit">{UNIT_TYPE_LABELS[t.unitType] ?? t.unitType}</td>
            <td><SourceChip source={t.source} /></td>
            <td>
              {t.isUniversal
                ? <span className="triggers-badge triggers-badge--universal">Universal</span>
                : <span className="triggers-badge triggers-badge--assigned">Assigned</span>
              }
            </td>
            <td className="triggers-td-cooldown">{formatCooldown(t.cooldownSeconds)}</td>
            <td>
              <span className={`triggers-status triggers-status--${t.enabled ? 'on' : 'off'}`}>
                {t.enabled ? 'Active' : 'Disabled'}
              </span>
            </td>
            <td className="triggers-td-actions">
              <button className="triggers-edit-btn" onClick={() => onEdit(t)} title="Edit trigger">
                <EditIcon />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ── Edit panel ─────────────────────────────────────────────────── */

function EditPanel({ trigger, onClose, onSaved }) {
  const [form, setForm] = useState({
    name:           trigger.name,
    severity:       trigger.severity,
    unitType:       trigger.unitType,
    source:         trigger.source,
    enabled:        trigger.enabled,
    cooldownSeconds:trigger.cooldownSeconds,
    conditions:     JSON.stringify(trigger.conditions ?? {}, null, 2),
  })
  const [condError,  setCondError]  = useState(null)
  const [saving,     setSaving]     = useState(null) // null | 'saving' | 'error'
  const [saveError,  setSaveError]  = useState(null)
  const nameRef = useRef()

  useEffect(() => { nameRef.current?.focus() }, [])
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function handleSave() {
    let parsedConditions
    try {
      parsedConditions = JSON.parse(form.conditions)
      setCondError(null)
    } catch {
      setCondError('Invalid JSON — fix before saving')
      return
    }

    setSaving('saving')
    setSaveError(null)
    try {
      const res = await apiFetch(apiUrl(`/api/triggers/${trigger.id}`), {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:           form.name.trim(),
          severity:       form.severity,
          unitType:       form.unitType,
          source:         form.source,
          enabled:        form.enabled,
          cooldownSeconds:form.cooldownSeconds,
          conditions:     parsedConditions,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        setSaving('error')
        setSaveError(text || `HTTP ${res.status}`)
        return
      }
      onSaved(await res.json())
    } catch (err) {
      setSaving('error')
      setSaveError(err.message)
    }
  }

  const cooldownRaw = form.cooldownSeconds
  const cooldownDisplay = cooldownRaw === null || cooldownRaw === undefined
    ? '' : String(cooldownRaw)

  return (
    <div className="trg-backdrop" onClick={onClose}>
      <aside className="trg-panel" onClick={e => e.stopPropagation()}>

        <div className="trg-panel__head">
          <div className="trg-panel__head-left">
            <span className="trg-panel__title">Edit Trigger</span>
            {trigger.isSystem && (
              <span className="triggers-badge triggers-badge--sys">SYSTEM</span>
            )}
          </div>
          <button className="trg-panel__x" onClick={onClose}>×</button>
        </div>

        <div className="trg-panel__body">
          <PanelField label="NAME">
            <input
              ref={nameRef}
              className="trg-input"
              value={form.name}
              onChange={e => set('name', e.target.value)}
            />
          </PanelField>

          <div className="trg-field-row">
            <PanelField label="SEVERITY">
              <select className="trg-input" value={form.severity} onChange={e => set('severity', e.target.value)}>
                <option value="advisory">Advisory</option>
                <option value="warning">Warning</option>
                <option value="red_alert">Red Alert</option>
              </select>
            </PanelField>
            <PanelField label="UNIT TYPE">
              <select className="trg-input" value={form.unitType} onChange={e => set('unitType', e.target.value)}>
                <option value="both">Both</option>
                <option value="vehicle">Vehicle</option>
                <option value="principal">Principal</option>
              </select>
            </PanelField>
          </div>

          <div className="trg-field-row">
            <PanelField label="SOURCE">
              <select className="trg-input" value={form.source} onChange={e => set('source', e.target.value)}>
                <option value="device">Device</option>
                <option value="server">Server</option>
                <option value="scheduled">Scheduled</option>
              </select>
            </PanelField>
            <PanelField label="COOLDOWN (SECONDS)">
              <input
                className="trg-input"
                type="number"
                min="0"
                placeholder="blank = system default"
                value={cooldownDisplay}
                onChange={e => set('cooldownSeconds', e.target.value === '' ? null : parseInt(e.target.value, 10))}
              />
            </PanelField>
          </div>

          <PanelField label="CONDITIONS (JSON)">
            <textarea
              className={`trg-input trg-input--code${condError ? ' trg-input--invalid' : ''}`}
              rows={6}
              value={form.conditions}
              onChange={e => { set('conditions', e.target.value); setCondError(null) }}
              spellCheck={false}
            />
            {condError && <span className="trg-field-error">{condError}</span>}
          </PanelField>

          <label className="trg-enabled-toggle">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={e => set('enabled', e.target.checked)}
            />
            <span>Enabled</span>
          </label>

          <div className="trg-type-note">
            <span className="trg-type-note__label">TYPE</span>
            <span className="triggers-type-chip">{trigger.triggerType}</span>
            <span className="trg-type-note__hint">not editable</span>
          </div>
        </div>

        <div className="trg-panel__foot">
          {saving === 'error' && (
            <span className="trg-save-error" title={saveError}>{saveError || 'Save failed — try again'}</span>
          )}
          <button className="trg-btn trg-btn--ghost" onClick={onClose}>Cancel</button>
          <button
            className="trg-btn trg-btn--primary"
            disabled={saving === 'saving' || !form.name.trim()}
            onClick={handleSave}
          >
            {saving === 'saving' ? 'Saving…' : 'Save changes'}
          </button>
        </div>

      </aside>
    </div>
  )
}

function PanelField({ label, children }) {
  return (
    <div className="trg-field">
      <span className="trg-field__label">{label}</span>
      {children}
    </div>
  )
}

function EditIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  )
}

function FilterGroup({ label, items, active, onChange, color, labelOf }) {
  return (
    <div className="triggers-filter-group">
      <span className="triggers-filter-label">{label}</span>
      <div className="triggers-pills">
        {items.map(k => {
          const c = color?.(k)
          return (
            <button
              key={k}
              className={`triggers-pill${active === k ? ' active' : ''}`}
              onClick={() => onChange(k)}
              style={active === k && c ? { borderColor: c, color: c, background: `${c}18` } : {}}
            >
              {labelOf ? labelOf(k) : k}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SeverityChip({ severity }) {
  const meta = SEVERITY_META[severity]
  if (!meta) return <span>{severity}</span>
  return (
    <span
      className="triggers-chip"
      style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}44` }}
    >
      {meta.label}
    </span>
  )
}

function SourceChip({ source }) {
  const meta = SOURCE_META[source]
  if (!meta) return <span>{source}</span>
  return (
    <span
      className="triggers-chip"
      style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}44` }}
    >
      {meta.label}
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
