import { useState, useEffect, useMemo } from 'react'
import { apiUrl, apiFetch } from '../../../shared/utils/api'
import './UnitTriggers.css'

const CATEGORY_LABELS = {
  panic_button:           'Security & Safety',
  crash_detection:        'Security & Safety',
  rollover_detection:     'Security & Safety',
  duress_code:            'Security & Safety',
  gps_jamming:            'Security & Safety',
  device_tampered:        'Security & Safety',
  fall_detection:         'Security & Safety',
  red_zone_entry:         'Location & Movement',
  motionless:             'Location & Movement',
  device_offline:         'Location & Movement',
  unauthorized_movement:  'Location & Movement',
  ignition_outside_hours: 'Location & Movement',
  speed:                  'Driver Behavior',
  harsh_braking:          'Driver Behavior',
  harsh_acceleration:     'Driver Behavior',
  sharp_cornering:        'Driver Behavior',
  idle_engine:            'Driver Behavior',
  loss_of_power:          'Vehicle Health',
  fuel:                   'Vehicle Health',
  low_tire_pressure:      'Vehicle Health',
  check_engine:           'Vehicle Health',
  engine_temp:            'Vehicle Health',
  cabin_temp:             'Vehicle Health',
  door_open_moving:       'Vehicle Health',
  maintenance_due:        'Vehicle Health',
  tracker_battery:        'Vehicle Health',
  heart_rate:             'Biometrics',
  blood_pressure:         'Biometrics',
  blood_oxygen:           'Biometrics',
  wearable_battery:       'Biometrics',
}

const CATEGORY_ORDER = [
  'Security & Safety',
  'Location & Movement',
  'Driver Behavior',
  'Vehicle Health',
  'Biometrics',
]

const SEVERITY_META = {
  red_alert: { label: 'Red Alert', color: '#F2495B' },
  warning:   { label: 'Warning',   color: '#E0A63C' },
  advisory:  { label: 'Advisory',  color: '#7B8FBD' },
}

function formatConditions(conditions) {
  if (!conditions || Object.keys(conditions).length === 0) return null
  const parts = []
  if ('operator' in conditions && 'value' in conditions) {
    parts.push(`${conditions.operator} ${conditions.value}${conditions.unit ? ` ${conditions.unit}` : ''}`)
  }
  if ('duration_seconds' in conditions) {
    const s = conditions.duration_seconds
    parts.push(`after ${s < 60 ? `${s}s` : s < 3600 ? `${s / 60}m` : `${s / 3600}h`}`)
  }
  if ('min' in conditions && 'max' in conditions) {
    parts.push(`${conditions.min}–${conditions.max}${conditions.unit ? ` ${conditions.unit}` : ''}`)
  }
  if ('min_speed_kmh' in conditions)  parts.push(`speed > ${conditions.min_speed_kmh} kmh`)
  if ('interval_km'   in conditions)  parts.push(`every ${conditions.interval_km} km`)
  if ('sustained_seconds' in conditions) parts.push(`for ${conditions.sustained_seconds}s`)
  if ('measure' in conditions)        parts.push(conditions.measure)
  return parts.join(', ') || null
}

export default function UnitTriggers({ unit }) {
  const unitType = unit.type === 'person' ? 'principal' : 'vehicle'

  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(new Set())

  useEffect(() => {
    setLoading(true)
    apiFetch(apiUrl(`/api/triggers/for-unit?unitId=${unit.id}&unitType=${unitType}`))
      .then(r => r.json())
      .then(data => { setItems(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [unit.id, unitType])

  async function toggle(trigger, checked) {
    setItems(prev => prev.map(t => t.id === trigger.id ? { ...t, assigned: checked } : t))
    setSaving(prev => new Set([...prev, trigger.id]))
    try {
      await apiFetch(apiUrl('/api/trigger-units'), {
        method:  checked ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(
          checked
            ? { triggerId: trigger.id, unitId: unit.id, unitType }
            : { triggerId: trigger.id, unitId: unit.id }
        ),
      })
    } catch {
      setItems(prev => prev.map(t => t.id === trigger.id ? { ...t, assigned: !checked } : t))
    } finally {
      setSaving(prev => { const n = new Set(prev); n.delete(trigger.id); return n })
    }
  }

  const grouped = useMemo(() => {
    const map = new Map()
    for (const t of items) {
      const cat = CATEGORY_LABELS[t.triggerType] ?? 'Other'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat).push(t)
    }
    return [...map.entries()].sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a)
      const bi = CATEGORY_ORDER.indexOf(b)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  }, [items])

  if (loading) return <div className="ut-empty">Loading…</div>
  if (items.length === 0) return <div className="ut-empty">No triggers available.</div>

  const activeCount    = items.filter(t => t.assigned).length
  const universalCount = items.filter(t => t.isUniversal).length

  return (
    <div className="ut-root">
      <div className="ut-summary">
        <span className="ut-summary__active">{activeCount} active</span>
        <span className="ut-summary__sep">·</span>
        <span className="ut-summary__note">{universalCount} universal (always on)</span>
      </div>

      {grouped.map(([cat, rows]) => (
        <div key={cat} className="ut-group">
          <div className="ut-group__label">{cat}</div>
          {rows.map(t => (
            <TriggerRow
              key={t.id}
              trigger={t}
              isSaving={saving.has(t.id)}
              onToggle={toggle}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function TriggerRow({ trigger, isSaving, onToggle }) {
  const sev    = SEVERITY_META[trigger.severity]
  const locked = trigger.isUniversal
  const conds  = formatConditions(trigger.conditions)

  return (
    <label className={`ut-row${locked ? ' ut-row--locked' : ''}${isSaving ? ' ut-row--saving' : ''}`}>
      <input
        className="ut-check"
        type="checkbox"
        checked={trigger.assigned}
        disabled={locked || isSaving}
        onChange={e => !locked && onToggle(trigger, e.target.checked)}
      />
      <div className="ut-row__body">
        <div className="ut-row__top">
          <span className="ut-row__name">{trigger.name}</span>
          <div className="ut-row__tags">
            {locked && <span className="ut-lock">Universal</span>}
            {sev && (
              <span className="ut-sev" style={{ color: sev.color, background: `${sev.color}16` }}>
                {sev.label}
              </span>
            )}
          </div>
        </div>
        {conds && <span className="ut-row__conds">{conds}</span>}
      </div>
    </label>
  )
}
