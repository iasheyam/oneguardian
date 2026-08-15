import { useState, useEffect } from 'react'
import { apiUrl, apiFetch } from '../../../shared/utils/api'
import './TestingPage.css'

const ALARM_OPTIONS = [
  { value: '',                label: 'None' },
  { value: 'sos',             label: 'SOS / Panic Button' },
  { value: 'crash',           label: 'Crash Detected' },
  { value: 'accident',        label: 'Rollover Detected' },
  { value: 'jamming',         label: 'GPS Jamming' },
  { value: 'tampering',       label: 'Device Tampered' },
  { value: 'fall',            label: 'Fall Detected' },
  { value: 'duress',          label: 'Duress Code' },
  { value: 'powerCut',        label: 'Loss of Power' },
  { value: 'lowTirePressure', label: 'Low Tire Pressure' },
  { value: 'checkEngine',     label: 'Check Engine' },
]

const SEVERITY_COLORS = {
  red_alert: '#F43F5E',
  warning:   '#FB923C',
  advisory:  '#7B8FBD',
}

const SEVERITY_LABELS = {
  red_alert: 'Red Alert',
  warning:   'Warning',
  advisory:  'Advisory',
}

export default function TestingPage() {
  const [units,        setUnits]        = useState([])
  const [loadingUnits, setLoadingUnits] = useState(true)
  const [form, setForm] = useState({
    unitIndex:    '',
    speed:        '',
    latitude:     '',
    longitude:    '',
    alarm:        '',
    fuel:         '',
    batteryLevel: '',
    engineTemp:   '',
    doorOpen:     false,
  })
  const [sending, setSending] = useState(false)
  const [log,     setLog]     = useState([])

  useEffect(() => {
    apiFetch(apiUrl('/api/dev/simulatable-units'))
      .then(r => r.json())
      .then(data => {
        setUnits(Array.isArray(data) ? data : [])
        setLoadingUnits(false)
      })
      .catch(err => {
        console.error('[TestingPage] failed to load units:', err)
        setLoadingUnits(false)
      })
  }, [])

  const set          = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const selectedUnit = form.unitIndex !== '' ? units[parseInt(form.unitIndex, 10)] : null

  async function handleSend() {
    if (!selectedUnit) return

    const attributes = {}
    if (form.alarm)               attributes.alarm        = form.alarm
    if (form.fuel !== '')         attributes.fuel         = parseFloat(form.fuel)
    if (form.batteryLevel !== '') attributes.batteryLevel = parseFloat(form.batteryLevel)
    if (form.engineTemp !== '')   attributes.temp1        = parseFloat(form.engineTemp)
    if (form.doorOpen)            attributes.door         = true

    const position = {
      deviceId:  selectedUnit.traccarDeviceId,
      speed:     form.speed     !== '' ? parseFloat(form.speed)     : 0,
      latitude:  form.latitude  !== '' ? parseFloat(form.latitude)  : 0,
      longitude: form.longitude !== '' ? parseFloat(form.longitude) : 0,
      attributes,
    }

    setSending(true)
    try {
      const res = await apiFetch(apiUrl('/api/dev/simulate-positions'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ positions: [position] }),
      })
      const data = res.ok ? await res.json() : { error: await res.text() }
      setLog(prev => [{
        id:        Date.now(),
        timestamp: new Date(),
        unit:      selectedUnit,
        position,
        results:   data.results ?? null,
        error:     data.error   ?? null,
      }, ...prev])
    } catch (err) {
      setLog(prev => [{
        id:        Date.now(),
        timestamp: new Date(),
        unit:      selectedUnit,
        position,
        results:   null,
        error:     err.message,
      }, ...prev])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="testing-page">

      {/* ── left: simulator form ── */}
      <div className="testing-simulator">
        <div className="testing-panel-title">POSITION SIMULATOR</div>

        <SimField label="UNIT">
          {loadingUnits ? (
            <div className="testing-hint">Loading units…</div>
          ) : units.length === 0 ? (
            <div className="testing-hint testing-hint--warn">No units with Traccar devices found.</div>
          ) : (
            <select className="testing-input" value={form.unitIndex} onChange={e => set('unitIndex', e.target.value)}>
              <option value="">Select a unit…</option>
              {units.map((u, i) => (
                <option key={u.unitId} value={i}>
                  {u.name} ({u.unitType}) — Device #{u.traccarDeviceId}
                </option>
              ))}
            </select>
          )}
          {selectedUnit && (
            <div className="testing-unit-meta">
              <span className={`testing-unit-pill testing-unit-pill--${selectedUnit.unitType}`}>
                {selectedUnit.unitType}
              </span>
              <span className="testing-device-id">Device #{selectedUnit.traccarDeviceId}</span>
            </div>
          )}
        </SimField>

        <div className="testing-divider" />

        <div className="testing-section-label">POSITION</div>
        <div className="testing-row">
          <SimField label="SPEED (km/h)">
            <input className="testing-input" type="number" min="0" placeholder="0"
              value={form.speed} onChange={e => set('speed', e.target.value)} />
          </SimField>
          <SimField label="LATITUDE">
            <input className="testing-input" type="number" step="any" placeholder="0.000000"
              value={form.latitude} onChange={e => set('latitude', e.target.value)} />
          </SimField>
          <SimField label="LONGITUDE">
            <input className="testing-input" type="number" step="any" placeholder="0.000000"
              value={form.longitude} onChange={e => set('longitude', e.target.value)} />
          </SimField>
        </div>

        <div className="testing-divider" />

        <div className="testing-section-label">ATTRIBUTES</div>
        <SimField label="ALARM TYPE">
          <select className="testing-input" value={form.alarm} onChange={e => set('alarm', e.target.value)}>
            {ALARM_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </SimField>
        <div className="testing-row">
          <SimField label="FUEL (%)">
            <input className="testing-input" type="number" min="0" max="100" placeholder="—"
              value={form.fuel} onChange={e => set('fuel', e.target.value)} />
          </SimField>
          <SimField label="BATTERY (%)">
            <input className="testing-input" type="number" min="0" max="100" placeholder="—"
              value={form.batteryLevel} onChange={e => set('batteryLevel', e.target.value)} />
          </SimField>
          <SimField label="ENGINE TEMP (°C)">
            <input className="testing-input" type="number" placeholder="—"
              value={form.engineTemp} onChange={e => set('engineTemp', e.target.value)} />
          </SimField>
        </div>
        <label className="testing-checkbox">
          <input type="checkbox" checked={form.doorOpen} onChange={e => set('doorOpen', e.target.checked)} />
          <span>Door open</span>
        </label>

        <div className="testing-divider" />

        <button
          className="testing-send-btn"
          disabled={sending || !selectedUnit}
          onClick={handleSend}
        >
          {sending ? 'Sending…' : 'Send Position'}
        </button>
      </div>

      {/* ── right: simulation log ── */}
      <div className="testing-log">
        <div className="testing-log-header">
          <span className="testing-panel-title">SIMULATION LOG</span>
          {log.length > 0 && (
            <button className="testing-clear-btn" onClick={() => setLog([])}>Clear</button>
          )}
        </div>

        {log.length === 0 ? (
          <div className="testing-log-empty">Send a position to see results here.</div>
        ) : (
          <div className="testing-log-entries">
            {log.map(entry => <LogEntry key={entry.id} entry={entry} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function SimField({ label, children }) {
  return (
    <div className="testing-field">
      <span className="testing-label">{label}</span>
      {children}
    </div>
  )
}

function LogEntry({ entry }) {
  const result = entry.results?.[0]
  const time   = entry.timestamp.toLocaleTimeString()

  return (
    <div className={`testing-entry${entry.error ? ' testing-entry--err' : ''}`}>
      <div className="testing-entry__head">
        <span className="testing-entry__time">{time}</span>
        <span className="testing-entry__unit">{entry.unit.name}</span>
        <span className={`testing-unit-pill testing-unit-pill--${entry.unit.unitType}`}>
          {entry.unit.unitType}
        </span>
        <span className="testing-sim-badge">SIM</span>
      </div>

      <div className="testing-entry__pos">
        Speed <strong>{entry.position.speed} km/h</strong>
        {entry.position.attributes.alarm && (
          <> · Alarm <strong>{entry.position.attributes.alarm}</strong></>
        )}
        {entry.position.attributes.fuel !== undefined && (
          <> · Fuel <strong>{entry.position.attributes.fuel}%</strong></>
        )}
        {entry.position.attributes.batteryLevel !== undefined && (
          <> · Battery <strong>{entry.position.attributes.batteryLevel}%</strong></>
        )}
        {entry.position.attributes.temp1 !== undefined && (
          <> · Temp <strong>{entry.position.attributes.temp1}°C</strong></>
        )}
        {entry.position.attributes.door && (
          <> · <strong>Door open</strong></>
        )}
      </div>

      {entry.error && (
        <div className="testing-entry__error">{entry.error}</div>
      )}

      {result && (
        <div className="testing-entry__results">
          {result.fired.length > 0 && (
            <div className="testing-result-group">
              <span className="testing-result-label testing-result-label--fired">FIRED</span>
              <div className="testing-chips">
                {result.fired.map(t => (
                  <span key={t.id} className="testing-chip" style={{ '--chip': SEVERITY_COLORS[t.severity] }}>
                    {t.name}
                    <em>{SEVERITY_LABELS[t.severity]}</em>
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.fired.length === 0 && (
            <div className="testing-entry__none">No triggers matched.</div>
          )}
        </div>
      )}
    </div>
  )
}
