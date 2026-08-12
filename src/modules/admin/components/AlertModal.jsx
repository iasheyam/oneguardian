import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAlarmSound } from '../hooks/useAlarmSound'
import { reverseGeocode } from '../../../shared/utils/googlePlaces'
import './AlertModal.css'

const LEVEL_META = {
  duress:  { color: '#F2495B', label: 'DURESS'  },
  warning: { color: '#E0A63C', label: 'WARNING' },
}

const ALERT_TYPE_LABELS = {
  panic:    'PANIC BUTTON ACTIVATED',
  geofence: 'GEOFENCE BREACH',
  battery:  'DEVICE BATTERY CRITICAL',
  offline:  'DEVICE SIGNAL LOST',
  speed:    'SPEED THRESHOLD EXCEEDED',
  medical:  'MEDICAL EMERGENCY',
}

const NOTIFY_ACTIONS = [
  { key: 'response_team', label: 'Notify Response Team', doneLabel: 'Response Team Notified' },
  { key: 'police',        label: 'Notify Police',         doneLabel: 'Police Notified'         },
  { key: 'nearest_unit',  label: 'Notify Nearest Unit',   doneLabel: 'Nearest Unit Notified'   },
]

function pad2(n) { return String(n).padStart(2, '0') }
function nowTime() {
  const d = new Date()
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export default function AlertModal({ alerts, onAction, onFalseAlarm, onAcknowledge, onUpdateNotes }) {
  const [selectedId, setSelectedId]       = useState(alerts[0]?.id ?? null)
  const [resolvedAddress, setResolvedAddress] = useState(null)
  const navigate = useNavigate()

  useAlarmSound(alerts.some(a => a.level === 'duress'))

  const alert = alerts.find(a => a.id === selectedId) ?? alerts[0]

  useEffect(() => {
    if (alert?.traccarAddress) { setResolvedAddress(alert.traccarAddress); return }
    setResolvedAddress(null)
    if (!alert?.lat || !alert?.lng) return
    reverseGeocode(alert.lat, alert.lng).then(addr => setResolvedAddress(addr ?? null))
  }, [alert?.id])

  if (!alert) return null

  const meta        = LEVEL_META[alert.level] ?? LEVEL_META.warning
  const notifiedKeys = new Set(alert.actionLog.filter(e => e.type === 'notify').map(e => e.key))
  const typeLabel   = ALERT_TYPE_LABELS[alert.type] ?? alert.type.toUpperCase()

  function handleNotify(key, doneLabel) {
    if (notifiedKeys.has(key)) return
    onAction(alert.id, { type: 'notify', key, label: doneLabel, time: nowTime() })
  }

  return (
    <div className="alert-overlay" role="dialog" aria-modal="true" aria-label="Active security alert">
      <div className={`alert-modal alert-modal--${alert.level}`} style={{ '--alert-color': meta.color }}>

        {/* ── multi-alert tab strip ── */}
        {alerts.length > 1 && (
          <div className="alert-tabs">
            {alerts.map(a => {
              const m = LEVEL_META[a.level] ?? LEVEL_META.warning
              return (
                <button
                  key={a.id}
                  className={`alert-tab${a.id === selectedId ? ' active' : ''}`}
                  style={{ '--tab-color': m.color }}
                  onClick={() => setSelectedId(a.id)}
                >
                  <span className="alert-tab__dot" style={{ background: m.color }} />
                  {a.unitId} · {a.callsign}
                </button>
              )
            })}
          </div>
        )}

        {/* ── header ── */}
        <div className="alert-header">
          <div className="alert-header__left">
            <span className="alert-pulse" />
            <span className="alert-header__level">{meta.label}</span>
            <span className="alert-header__sep">—</span>
            <span className="alert-header__type">{typeLabel}</span>
          </div>
          <span className="alert-header__time">{alert.timeUtc}</span>
        </div>

        {/* ── unit ── */}
        <div className="alert-unit">
          <div className="alert-unit__id">
            <span className="alert-unit__code">{alert.unitId}</span>
            <span className="alert-unit__dot-sep">·</span>
            <span className="alert-unit__callsign" style={{ color: meta.color }}>{alert.callsign}</span>
          </div>
          <div className="alert-unit__meta">
            {[alert.agent, alert.vehicle, alert.armorLevel].filter(Boolean).map((v, i) => (
              <span key={i} className="alert-unit__meta-item">{v}</span>
            ))}
            {alert.plate && <span className="alert-unit__plate">{alert.plate}</span>}
          </div>
        </div>

        {/* ── alert details ── */}
        <div className="alert-details">
          <div className="alert-detail">
            <span className="alert-detail__label">LOCATION AT ALERT</span>
            <span className="alert-detail__value">
              {resolvedAddress ?? alert.location}
              {resolvedAddress && alert.location !== '—' && (
                <span className="alert-detail__coords"> · {alert.location}</span>
              )}
            </span>
          </div>
          {alert.speed > 0 && (
            <div className="alert-detail">
              <span className="alert-detail__label">SPEED</span>
              <span className="alert-detail__value">
                {alert.speed} mph{alert.heading ? ` · heading ${alert.heading}` : ''}
              </span>
            </div>
          )}
          <div className="alert-detail">
            <span className="alert-detail__label">TRIGGERED</span>
            <span className="alert-detail__value">{alert.time} local · {alert.timeUtc}</span>
          </div>
        </div>

        {/* ── action log ── */}
        {alert.actionLog.length > 0 && (
          <div className="alert-log">
            <span className="alert-log__label">ACTIONS TAKEN</span>
            <div className="alert-log__entries">
              {alert.actionLog.map((entry, i) => (
                <div key={i} className="alert-log__entry">
                  <span className="alert-log__time">{entry.time}</span>
                  <span className="alert-log__text">{entry.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── notes ── */}
        <div className="alert-notes">
          <label className="alert-notes__label">OPERATOR NOTES</label>
          <textarea
            className="alert-notes__input"
            placeholder="Add notes — incident details, observations, response instructions..."
            value={alert.notes}
            onChange={e => onUpdateNotes(alert.id, e.target.value)}
            rows={3}
          />
        </div>

        {/* ── actions ── */}
        <div className="alert-actions">
          <div className="alert-notify-row">
            {NOTIFY_ACTIONS.map(({ key, label, doneLabel }) => {
              const done = notifiedKeys.has(key)
              return (
                <button
                  key={key}
                  className={`alert-notify-btn${done ? ' done' : ''}`}
                  onClick={() => handleNotify(key, doneLabel)}
                  disabled={done}
                >
                  {done ? <CheckIcon /> : null}
                  {done ? doneLabel : label}
                </button>
              )
            })}
          </div>

          <div className="alert-resolve-row">
            <button className="alert-false-alarm-btn" onClick={() => onFalseAlarm(alert.id)}>
              Mark as False Alarm
            </button>
            {alert.unitDbId && alert.unitType && (
              <button
                className="alert-unit-btn"
                onClick={() => {
                  const path = alert.unitType === 'principal'
                    ? `/admin/unit/principal/${alert.unitDbId}`
                    : `/admin/unit/vehicle/${alert.unitDbId}`
                  onAcknowledge()
                  navigate(path)
                }}
              >
                View Unit
              </button>
            )}
            <button className="alert-ack-btn" onClick={onAcknowledge}>
              Acknowledge
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden>
      <path d="M1 4.5L4 7.5L10 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
