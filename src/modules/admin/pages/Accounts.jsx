import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Map, { Marker, Source, Layer } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useAccounts } from '../contexts/AccountsContext'
import UnitTriggers from '../components/UnitTriggers'
import { apiUrl, apiFetch } from '../../../shared/utils/api'
import { searchGoogle, retrieveGoogle } from '../../../shared/utils/googlePlaces'
import './Accounts.css'

/* ── constants ────────────────────────────────────────────────── */
const ACC_STATUS = {
  active:    { color: '#37C2B8', label: 'ACTIVE'    },
  inactive:  { color: '#66727A', label: 'INACTIVE'  },
  suspended: { color: '#F2495B', label: 'SUSPENDED' },
}
const UNIT_STATUS = {
  normal:  { color: '#37C2B8', label: 'SECURE'  },
  warning: { color: '#E0A63C', label: 'WARNING' },
  duress:  { color: '#F2495B', label: 'DURESS'  },
  offline: { color: '#66727A', label: 'OFFLINE' },
}
const ARMOR_LEVELS = ['B6 Armored', 'B4 Armored', 'B2 Armored', 'Soft skin']
const DEVICE_TYPES = {
  gps:    { label: 'GPS',     color: '#37C2B8' },
  camera: { label: 'Camera',  color: '#7B8FBD' },
  alert:  { label: 'Alert',   color: '#F2495B' },
  radio:  { label: 'Radio',   color: '#E0A63C' },
  phone:  { label: 'Phone',   color: '#66727A' },
  other:  { label: 'Other',   color: '#66727A' },
}
const AVATAR_PALETTE = ['#1B4F8C', '#5C3280', '#1B7A5E', '#7A4B1B', '#4A6E1B', '#1B5C7A']
const MAPBOX_TOKEN   = import.meta.env.VITE_MAPBOX_TOKEN
const PLACE_COLORS   = ['#2563eb', '#37C2B8', '#E0A63C', '#F2495B', '#7B8FBD', '#5C3280']

/* ── helpers ──────────────────────────────────────────────────── */
function avatarColor(id) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}
function fmtSince(val) {
  if (!val) return '—'
  const d = new Date(val)
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric' })
}
function alertCount(units) {
  return units.filter(u => u.status === 'warning' || u.status === 'duress').length
}
function deviceCount(units) {
  return units.reduce((n, u) => n + (u.devices?.length ?? 0), 0)
}
function resolveUnits(account, unitIds) {
  return unitIds.map(id => account.units.find(u => u.id === id)).filter(Boolean)
}

/* ── Mapbox Places helpers ────────────────────────────────────── */
function makeCircleGeoJSON(lng, lat, radiusMeters) {
  const R      = 6371000
  const coords = Array.from({ length: 64 }, (_, i) => {
    const angle = (i / 64) * 2 * Math.PI
    const dx    = radiusMeters * Math.cos(angle)
    const dy    = radiusMeters * Math.sin(angle)
    return [
      lng + (dx / R) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180),
      lat + (dy / R) * (180 / Math.PI),
    ]
  })
  coords.push(coords[0])
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} }
}

async function resolveGooglePlace(placeId) {
  const data = await retrieveGoogle(placeId)
  if (!data) return null
  return {
    name:      data.displayName?.text ?? '',
    address:   data.formattedAddress ?? '',
    mapboxId:  placeId,
    latitude:  data.location.latitude,
    longitude: data.location.longitude,
  }
}

/* ═══════════════════════════════════════════════════════════════
   SHARED — Panel, Field, ConfirmBar, AccountForm, NameForm
═══════════════════════════════════════════════════════════════ */

function Panel({ title, onClose, children, wide }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="ac-panel-backdrop" onClick={onClose}>
      <aside className={`ac-panel${wide ? ' ac-panel--wide' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="ac-panel__head">
          <span className="ac-panel__title">{title}</span>
          <button className="ac-panel__x" onClick={onClose}>×</button>
        </div>
        <div className="ac-panel__body">{children}</div>
      </aside>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="ac-field">
      <span className="ac-field__label">{label}</span>
      {children}
    </div>
  )
}

function ConfirmBar({ message, onCancel, onConfirm }) {
  return (
    <div className="ac-confirm-bar">
      <span className="ac-confirm-bar__msg">{message}</span>
      <div className="ac-confirm-bar__actions">
        <button className="ac-btn ac-btn--ghost ac-btn--sm" onClick={onCancel}>Cancel</button>
        <button className="ac-btn ac-btn--danger ac-btn--sm" onClick={onConfirm}>Delete</button>
      </div>
    </div>
  )
}

function AccountForm({ initial, onSave, onCancel }) {
  const EMPTY = { name: '', status: 'active', type: 'Corporate', industry: '', contact: { name: '', email: '', phone: '' } }
  const [form, setForm] = useState({ ...EMPTY, ...initial, contact: { ...EMPTY.contact, ...initial?.contact } })
  const ref = useRef()
  useEffect(() => { ref.current?.focus() }, [])

  const set  = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const setC = (k, v) => setForm(p => ({ ...p, contact: { ...p.contact, [k]: v } }))
  const valid = form.name.trim() && form.contact.name.trim() && form.contact.email.trim()

  return (
    <>
      <Field label="ACCOUNT NAME *">
        <input ref={ref} className="ac-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Company or client name" />
      </Field>
      <div className="ac-field-row">
        <Field label="STATUS">
          <select className="ac-input" value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
        </Field>
        <Field label="TYPE">
          <select className="ac-input" value={form.type} onChange={e => set('type', e.target.value)}>
            {['Corporate','Family','Government','NGO','Other'].map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
      </div>
      <Field label="INDUSTRY">
        <input className="ac-input" value={form.industry} onChange={e => set('industry', e.target.value)} placeholder="e.g. Finance & Investment" />
      </Field>
      <div className="ac-panel__divider">PRIMARY CONTACT</div>
      <Field label="CONTACT NAME *">
        <input className="ac-input" value={form.contact.name} onChange={e => setC('name', e.target.value)} placeholder="Full name" />
      </Field>
      <Field label="EMAIL *">
        <input className="ac-input" type="email" value={form.contact.email} onChange={e => setC('email', e.target.value)} placeholder="email@example.com" />
      </Field>
      <Field label="PHONE">
        <input className="ac-input" type="tel" value={form.contact.phone} onChange={e => setC('phone', e.target.value)} placeholder="+1 000 000 0000" />
      </Field>
      <div className="ac-form-actions">
        <button className="ac-btn ac-btn--ghost" onClick={onCancel}>Cancel</button>
        <button className="ac-btn ac-btn--primary" disabled={!valid} onClick={() => onSave(form)}>Save</button>
      </div>
    </>
  )
}

function NameForm({ label, initial, placeholder, onSave, onCancel }) {
  const [name, setName] = useState(initial ?? '')
  const ref = useRef()
  useEffect(() => { ref.current?.focus() }, [])
  const submit = () => { if (name.trim()) onSave(name.trim()) }
  return (
    <>
      <Field label={label}>
        <input ref={ref} className="ac-input" value={name} onChange={e => setName(e.target.value)}
          placeholder={placeholder} onKeyDown={e => { if (e.key === 'Enter') submit() }} />
      </Field>
      <div className="ac-form-actions">
        <button className="ac-btn ac-btn--ghost" onClick={onCancel}>Cancel</button>
        <button className="ac-btn ac-btn--primary" disabled={!name.trim()} onClick={submit}>Save</button>
      </div>
    </>
  )
}

/* ── Assign User section (inside person edit only) ───────────── */
function AssignUserSection({ principalId, accountId, currentUserId, currentUserEmail, currentUserName, onUserAssigned }) {
  const [email,     setEmail]     = useState('')
  const [phase,     setPhase]     = useState('idle') // idle | loading | found | error
  const [foundUser, setFoundUser] = useState(null)
  const [errorMsg,  setErrorMsg]  = useState('')
  const [removing,  setRemoving]  = useState(false)

  async function handleLookup() {
    if (!email.trim()) return
    setPhase('loading')
    setFoundUser(null)
    setErrorMsg('')
    try {
      const res = await apiFetch(apiUrl(`/api/users/by-email?email=${encodeURIComponent(email.trim())}`))
      if (res.status === 404) { setPhase('error'); setErrorMsg('No user found with this email address.'); return }
      const user = await res.json()
      setFoundUser(user)
      setPhase('found')
    } catch { setPhase('error'); setErrorMsg('Lookup failed — try again.') }
  }

  async function handleAssign() {
    const res = await apiFetch(apiUrl(`/api/accounts/${accountId}/principals/${principalId}`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: foundUser.id }),
    })
    if (res.status === 409) { setPhase('error'); setErrorMsg('This user is already linked to another principal.'); return }
    onUserAssigned({ userId: foundUser.id, userEmail: foundUser.email, userName: foundUser.name })
    setEmail(''); setPhase('idle'); setFoundUser(null)
  }

  async function handleRemove() {
    setRemoving(true)
    await apiFetch(apiUrl(`/api/accounts/${accountId}/principals/${principalId}`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: null }),
    })
    onUserAssigned({ userId: null, userEmail: null, userName: null })
    setRemoving(false)
  }

  return (
    <div className="ac-user-assign">
      {currentUserId ? (
        <div className="ac-user-assign__assigned">
          <div className="ac-user-assign__info">
            <span className="ac-user-assign__name">{currentUserName ?? currentUserEmail ?? '—'}</span>
            {currentUserEmail && <span className="ac-user-assign__email">{currentUserEmail}</span>}
          </div>
          <button className="ac-btn ac-btn--danger-ghost ac-btn--sm" onClick={handleRemove} disabled={removing}>
            {removing ? 'Removing…' : 'Remove'}
          </button>
        </div>
      ) : (
        <>
          <div className="ac-user-assign__input-row">
            <input
              className="ac-input ac-input--flex"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={e => { setEmail(e.target.value); if (phase !== 'idle') { setPhase('idle'); setFoundUser(null) } }}
              onKeyDown={e => { if (e.key === 'Enter') handleLookup() }}
              disabled={phase === 'loading'}
            />
            <button
              className="ac-btn ac-btn--ghost ac-btn--sm"
              onClick={handleLookup}
              disabled={!email.trim() || phase === 'loading'}
            >
              {phase === 'loading' ? 'Looking up…' : 'Look up'}
            </button>
          </div>
          {phase === 'found' && foundUser && (
            <div className="ac-user-assign__confirm">
              <span className="ac-user-assign__found-label">Found:</span>
              <span className="ac-user-assign__found-name">{foundUser.name}</span>
              <div className="ac-user-assign__confirm-actions">
                <button className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => { setPhase('idle'); setFoundUser(null) }}>Cancel</button>
                <button className="ac-btn ac-btn--primary ac-btn--sm" onClick={handleAssign}>Assign</button>
              </div>
            </div>
          )}
          {phase === 'error' && <span className="ac-user-assign__error">{errorMsg}</span>}
        </>
      )}
    </div>
  )
}

/* ── Unit form (person or vehicle) ───────────────────────────── */
const BLOOD_GROUPS = ['', 'A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−']
const EMERG_EMPTY  = { dob: '', height: '', bloodGroup: '', allergies: '', conditions: '', medications: '', contactName: '', contactPhone: '', contactRelation: '' }

function emergSummary(e) {
  if (!e) return null
  const filled = Object.values(e).filter(v => v?.trim()).length
  if (filled === 0) return null
  return { bloodGroup: e.bloodGroup, count: filled }
}

function UnitForm({ initial, accountId, onSave, onCancel, onUserAssigned }) {
  const [type, setType] = useState(initial?.type ?? 'person')
  const PERSON_EMPTY  = { name: '', role: '', phone: '', email: '', status: 'normal', emergency: { ...EMERG_EMPTY } }
  const VEHICLE_EMPTY = { name: '', make: '', model: '', plate: '', armorLevel: 'Soft skin', status: 'normal' }

  const [form,          setForm]          = useState(() => initial ? { ...initial, emergency: { ...EMERG_EMPTY, ...initial.emergency } } : { ...PERSON_EMPTY })
  const [showEmergency, setShowEmergency] = useState(() => !!emergSummary(initial?.emergency))
  const isEdit = !!initial
  const ref = useRef()
  useEffect(() => { ref.current?.focus() }, [])

  const set  = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const setE = (k, v) => setForm(p => ({ ...p, emergency: { ...EMERG_EMPTY, ...p.emergency, [k]: v } }))

  function switchType(t) {
    setType(t)
    setForm(t === 'person' ? { ...PERSON_EMPTY } : { ...VEHICLE_EMPTY })
    setShowEmergency(false)
  }

  const valid   = form.name?.trim()
  const emerg   = form.emergency ?? EMERG_EMPTY
  const summary = emergSummary(emerg)

  return (
    <>
      {type === 'person' ? (
        <>
          <Field label="FULL NAME *">
            <input ref={ref} className="ac-input" value={form.name ?? ''} onChange={e => set('name', e.target.value)} placeholder="First and last name" />
          </Field>
          <Field label="ROLE">
            <input className="ac-input" value={form.role ?? ''} onChange={e => set('role', e.target.value)} placeholder="e.g. Principal, Lead Agent" />
          </Field>
          <div className="ac-field-row">
            <Field label="PHONE">
              <input className="ac-input" type="tel" value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} placeholder="+1 000 000 0000" />
            </Field>
            <Field label="STATUS">
              <select className="ac-input" value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="normal">Normal</option>
                <option value="warning">Warning</option>
                <option value="duress">Duress</option>
                <option value="offline">Offline</option>
              </select>
            </Field>
          </div>
          <Field label="EMAIL">
            <input className="ac-input" type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)} placeholder="email@example.com" />
          </Field>

          {/* ── emergency & medical ───────────────────────────────── */}
          <button className="ac-emerg-toggle" onClick={() => setShowEmergency(v => !v)}>
            <span className="ac-emerg-toggle__label">
              <span className="ac-emerg-toggle__icon">⚕</span>
              EMERGENCY &amp; MEDICAL
              <span className="ac-emerg-toggle__note">optional</span>
            </span>
            <span className="ac-emerg-toggle__summary">
              {summary ? (
                <>
                  {summary.bloodGroup && <span className="ac-blood-chip">{summary.bloodGroup}</span>}
                  <span className="ac-emerg-toggle__count">{summary.count} field{summary.count !== 1 ? 's' : ''}</span>
                </>
              ) : (
                <span className="ac-emerg-toggle__empty">not filled</span>
              )}
              <span className={`ac-emerg-toggle__chevron${showEmergency ? ' open' : ''}`}>›</span>
            </span>
          </button>

          {showEmergency && (
            <div className="ac-emerg-body">
              <div className="ac-emerg-section-label">PHYSICAL</div>
              <div className="ac-field-row">
                <Field label="DATE OF BIRTH">
                  <input className="ac-input" type="date" value={emerg.dob} onChange={e => setE('dob', e.target.value)} />
                </Field>
                <Field label="BLOOD GROUP">
                  <select className="ac-input" value={emerg.bloodGroup} onChange={e => setE('bloodGroup', e.target.value)}>
                    {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g || '— select —'}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="HEIGHT">
                <input className="ac-input" value={emerg.height} onChange={e => setE('height', e.target.value)} placeholder={`e.g. 5'11" / 180 cm`} />
              </Field>

              <div className="ac-emerg-section-label">MEDICAL</div>
              <Field label="ALLERGIES">
                <input className="ac-input" value={emerg.allergies} onChange={e => setE('allergies', e.target.value)} placeholder="e.g. Penicillin, shellfish" />
              </Field>
              <Field label="MEDICAL CONDITIONS">
                <input className="ac-input" value={emerg.conditions} onChange={e => setE('conditions', e.target.value)} placeholder="e.g. Hypertension, diabetes" />
              </Field>
              <Field label="MEDICATIONS">
                <input className="ac-input" value={emerg.medications} onChange={e => setE('medications', e.target.value)} placeholder="Current medications" />
              </Field>

              <div className="ac-emerg-section-label">EMERGENCY CONTACT</div>
              <Field label="CONTACT NAME">
                <input className="ac-input" value={emerg.contactName} onChange={e => setE('contactName', e.target.value)} placeholder="Full name" />
              </Field>
              <div className="ac-field-row">
                <Field label="CONTACT PHONE">
                  <input className="ac-input" type="tel" value={emerg.contactPhone} onChange={e => setE('contactPhone', e.target.value)} placeholder="+1 000 000 0000" />
                </Field>
                <Field label="RELATIONSHIP">
                  <input className="ac-input" value={emerg.contactRelation} onChange={e => setE('contactRelation', e.target.value)} placeholder="e.g. Spouse, Parent" />
                </Field>
              </div>
            </div>
          )}

          {/* ── app user link ──────────────────────────────────── */}
          {isEdit && accountId && onUserAssigned && (
            <>
              <div className="ac-panel__divider">APP USER</div>
              <AssignUserSection
                principalId={initial.id}
                accountId={accountId}
                currentUserId={initial.userId ?? null}
                currentUserEmail={initial.userEmail ?? null}
                currentUserName={initial.userName ?? null}
                onUserAssigned={onUserAssigned}
              />
            </>
          )}
        </>
      ) : (
        <>
          <Field label="CALLSIGN / NAME *">
            <input ref={ref} className="ac-input" value={form.name ?? ''} onChange={e => set('name', e.target.value)} placeholder="e.g. FALCON" />
          </Field>
          <div className="ac-field-row">
            <Field label="MAKE">
              <input className="ac-input" value={form.make ?? ''} onChange={e => set('make', e.target.value)} placeholder="e.g. Cadillac" />
            </Field>
            <Field label="MODEL">
              <input className="ac-input" value={form.model ?? ''} onChange={e => set('model', e.target.value)} placeholder="e.g. Escalade ESV" />
            </Field>
          </div>
          <div className="ac-field-row">
            <Field label="PLATE">
              <input className="ac-input" value={form.plate ?? ''} onChange={e => set('plate', e.target.value)} placeholder="License plate" />
            </Field>
            <Field label="ARMOR LEVEL">
              <select className="ac-input" value={form.armorLevel ?? 'Soft skin'} onChange={e => set('armorLevel', e.target.value)}>
                {ARMOR_LEVELS.map(l => <option key={l}>{l}</option>)}
              </select>
            </Field>
          </div>
          <Field label="STATUS">
            <select className="ac-input" value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="normal">Normal</option>
              <option value="warning">Warning</option>
              <option value="duress">Duress</option>
              <option value="offline">Offline</option>
            </select>
          </Field>
        </>
      )}

      <div className="ac-form-actions">
        <button className="ac-btn ac-btn--ghost" onClick={onCancel}>Cancel</button>
        <button className="ac-btn ac-btn--primary" disabled={!valid} onClick={() => onSave({ ...form, type })}>Save</button>
      </div>
    </>
  )
}

/* ── Unit picker (add units to a group from account roster) ───── */
function UnitPicker({ account, currentUnitIds, onAdd }) {
  const [search, setSearch] = useState('')
  const available = account.units.filter(u => !currentUnitIds.includes(u.id))
  const filtered  = available.filter(u => {
    if (!search) return true
    const q = search.toLowerCase()
    return u.name.toLowerCase().includes(q) || (u.role ?? u.model ?? '').toLowerCase().includes(q)
  })

  return (
    <div className="ac-picker">
      {available.length > 4 && (
        <input className="ac-input ac-input--sm" placeholder="Search name, role or model…"
          value={search} onChange={e => setSearch(e.target.value)} />
      )}
      {filtered.length === 0 ? (
        <span className="ac-picker__empty">
          {available.length === 0
            ? 'All units in this account are already in this group'
            : 'No units match search'}
        </span>
      ) : (
        filtered.map(u => {
          const sm = UNIT_STATUS[u.status] ?? UNIT_STATUS.offline
          return (
            <div key={u.id} className="ac-picker__row">
              <span className="ac-picker__dot" style={{ background: sm.color }} />
              <span className={`ac-picker__type-chip ac-picker__type-chip--${u.type}`}>
                {u.type === 'person' ? 'PER' : 'VEH'}
              </span>
              <span className="ac-picker__name">{u.name}</span>
              <span className="ac-picker__meta">{u.type === 'person' ? u.role : `${u.make} ${u.model}`}</span>
              <button className="ac-btn ac-btn--assign ac-btn--sm" onClick={() => onAdd(u.id)}>
                + Add
              </button>
            </div>
          )
        })
      )}
    </div>
  )
}

/* ── Device form ──────────────────────────────────────────────── */
function DeviceForm({ initial, showPrimary, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: '', type: 'gps', model: '', serial: '', imei: '', status: 'online', traccarDeviceId: '',
    isPrimary: false, ...initial,
  })
  const ref = useRef()
  useEffect(() => { ref.current?.focus() }, [])
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <>
      <Field label="DEVICE NAME *">
        <input ref={ref} className="ac-input" value={form.name} onChange={e => set('name', e.target.value)}
          placeholder="e.g. GPS Tracker, Panic Button, Front Camera" />
      </Field>
      <div className="ac-field-row">
        <Field label="TYPE">
          <select className="ac-input" value={form.type} onChange={e => set('type', e.target.value)}>
            {Object.entries(DEVICE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="STATUS">
          <select className="ac-input" value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </Field>
      </div>
      <Field label="MODEL">
        <input className="ac-input" value={form.model} onChange={e => set('model', e.target.value)}
          placeholder="e.g. Queclink GV500, BlackVue DR970X" />
      </Field>
      <div className="ac-field-row">
        <Field label="IMEI">
          <input className="ac-input" value={form.imei} onChange={e => set('imei', e.target.value)}
            placeholder="15-digit IMEI" />
        </Field>
        <Field label="SERIAL / ASSET ID">
          <input className="ac-input" value={form.serial} onChange={e => set('serial', e.target.value)}
            placeholder="Serial number" />
        </Field>
      </div>
      <Field label="TRACCAR DEVICE ID">
        <input className="ac-input" value={form.traccarDeviceId} onChange={e => set('traccarDeviceId', e.target.value)}
          placeholder="Numeric ID from Traccar (e.g. 1)" />
      </Field>

      {showPrimary && (
        <label className="ac-dv-primary-toggle">
          <input type="checkbox" checked={!!form.isPrimary} onChange={e => set('isPrimary', e.target.checked)} />
          <StarIcon filled={!!form.isPrimary} />
          <span>Set as primary tracking device</span>
        </label>
      )}

      <div className="ac-form-actions">
        <button className="ac-btn ac-btn--ghost" onClick={onCancel}>Cancel</button>
        <button className="ac-btn ac-btn--primary" disabled={!form.name.trim()} onClick={() => onSave(form)}>Save</button>
      </div>
    </>
  )
}

/* ── DeviceManager — reusable device list + add/edit ─────────── */
function DeviceManager({ unit, accountId }) {
  const { createDevice, updateDevice, deleteDevice, setPrimaryDevice } = useAccounts()
  const [view,          setView]          = useState('list')
  const [editingDevice, setEditingDevice] = useState(null)
  const [confirmId,     setConfirmId]     = useState(null)

  const devices       = unit.devices ?? []
  const primaryDevice = devices.find(d => d.id === unit.primaryDeviceId) ?? null
  const otherDevices  = devices.filter(d => d.id !== unit.primaryDeviceId)

  async function handleSave(data) {
    const { isPrimary, ...deviceData } = data
    if (view === 'add') {
      createDevice(accountId, unit.id, deviceData)
    } else {
      await updateDevice(accountId, unit.id, editingDevice.id, deviceData)
      const isCurrentPrimary = unit.primaryDeviceId === editingDevice.id
      if (isPrimary && !isCurrentPrimary)  setPrimaryDevice(accountId, unit.id, editingDevice.id)
      if (!isPrimary && isCurrentPrimary)  setPrimaryDevice(accountId, unit.id, null)
    }
    setView('list')
    setEditingDevice(null)
  }
  function startEdit(dev) { setEditingDevice(dev); setView('edit') }
  function backToList()   { setView('list'); setEditingDevice(null) }

  if (view !== 'list') {
    return (
      <>
        <button className="ac-dv-back" onClick={backToList}>← Back to devices</button>
        <DeviceForm
          initial={view === 'edit' ? { ...editingDevice, isPrimary: unit.primaryDeviceId === editingDevice?.id } : undefined}
          showPrimary={view === 'edit'}
          onSave={handleSave}
          onCancel={backToList}
        />
      </>
    )
  }

  return (
    <>
      <div className="ac-dv-header">
        <span className="ac-dv-count">
          {devices.length} device{devices.length !== 1 ? 's' : ''}
          {devices.filter(d => d.status === 'online').length > 0 && (
            <span className="ac-dv-online"> · {devices.filter(d => d.status === 'online').length} online</span>
          )}
        </span>
        <button className="ac-btn ac-btn--primary ac-btn--sm" onClick={() => setView('add')}>
          + Add Device
        </button>
      </div>

      {/* ── Primary device section ── */}
      <div className="ac-dv-primary-section">
        <div className="ac-dv-primary-section__bar">
          <span className="ac-dv-primary-section__label">PRIMARY DEVICE</span>
        </div>
        {primaryDevice ? (
          <DeviceRow
            dev={primaryDevice}
            isPrimary
            onEdit={() => startEdit(primaryDevice)}
            onDelete={() => setConfirmId(primaryDevice.id)}
            isConfirm={confirmId === primaryDevice.id}
            onCancelConfirm={() => setConfirmId(null)}
            onConfirmDelete={() => { deleteDevice(accountId, unit.id, primaryDevice.id); setConfirmId(null) }}
          />
        ) : (
          <div className="ac-dv-no-primary">
            <StarIcon filled={false} />
            <span>No primary device selected — edit a device to set it as primary</span>
          </div>
        )}
        <div className="ac-dv-primary-section__bar ac-dv-primary-section__bar--bottom" />
      </div>

      {/* ── Other devices ── */}
      {otherDevices.length === 0 && devices.length === 0 && (
        <div className="ac-empty ac-empty--inline">
          <span className="ac-empty__text">No devices assigned — click "Add Device" to provision one</span>
        </div>
      )}
      {otherDevices.length > 0 && (
        <div className="ac-dv-list">
          {otherDevices.map(dev => (
            <DeviceRow
              key={dev.id}
              dev={dev}
              isPrimary={false}
              onEdit={() => startEdit(dev)}
              onDelete={() => setConfirmId(dev.id)}
              isConfirm={confirmId === dev.id}
              onCancelConfirm={() => setConfirmId(null)}
              onConfirmDelete={() => { deleteDevice(accountId, unit.id, dev.id); setConfirmId(null) }}
            />
          ))}
        </div>
      )}
    </>
  )
}

function DeviceRow({ dev, isPrimary, onEdit, onDelete, isConfirm, onCancelConfirm, onConfirmDelete }) {
  const dt       = DEVICE_TYPES[dev.type] ?? DEVICE_TYPES.other
  const isOnline = dev.status === 'online'
  return (
    <div className={`ac-dv-row${isConfirm ? ' is-confirming' : ''}${isPrimary ? ' ac-dv-row--primary' : ''}`}>
      <div className="ac-dv-row__main">
        <span className="ac-dv-dot" style={{ background: isOnline ? '#37C2B8' : '#66727A',
          boxShadow: isOnline ? '0 0 6px #37C2B888' : 'none' }} />
        <div className="ac-dv-info">
          <span className="ac-dv-name">{dev.name}</span>
          <div className="ac-dv-meta">
            <span className="ac-dv-type-chip" style={{ color: dt.color, borderColor: `${dt.color}55` }}>
              {dt.label}
            </span>
            {dev.model  && <span className="ac-dv-model">{dev.model}</span>}
            {dev.serial && <span className="ac-dv-serial">SN: {dev.serial}</span>}
          </div>
        </div>
        <div className="ac-dv-actions">
          <span className="ac-dv-status" style={{ color: isOnline ? '#37C2B8' : '#66727A' }}>
            {dev.status}
          </span>
          <button className="ac-icon-btn" title="Edit device" onClick={onEdit}>
            <EditIcon />
          </button>
          <button className="ac-icon-btn ac-icon-btn--danger" title="Delete device" onClick={onDelete}>
            <TrashIcon />
          </button>
        </div>
      </div>
      {isConfirm && (
        <ConfirmBar
          message={`Remove "${dev.name}" from this unit?`}
          onCancel={onCancelConfirm}
          onConfirm={onConfirmDelete}
        />
      )}
    </div>
  )
}

/* ── Devices panel (standalone) ───────────────────────────────── */
function DevicesPanel({ unit, accountId, onClose }) {
  return (
    <Panel title={`DEVICES — ${unit.name}`} onClose={onClose}>
      <DeviceManager unit={unit} accountId={accountId} />
    </Panel>
  )
}

/* ── Unit edit panel — DETAILS + DEVICES + TRIGGERS tabs ─────── */
function UnitEditPanel({ unit, accountId, onSave, onCancel, onUserAssigned }) {
  const [tab, setTab] = useState('details')

  const TABS = [
    { id: 'details',  label: 'DETAILS'  },
    { id: 'devices',  label: 'DEVICES'  },
    { id: 'triggers', label: 'TRIGGERS' },
  ]

  return (
    <>
      <div className="ac-edit-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`ac-edit-tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <UnitForm
          initial={unit}
          accountId={accountId}
          onSave={onSave}
          onCancel={onCancel}
          onUserAssigned={unit.type === 'person' ? onUserAssigned : undefined}
        />
      )}
      {tab === 'devices' && (
        <DeviceManager unit={unit} accountId={accountId} />
      )}
      {tab === 'triggers' && (
        <UnitTriggers unit={unit} />
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════
   PAGE 1 — Account List
═══════════════════════════════════════════════════════════════ */
export function AccountList() {
  const { accounts, createAccount, updateAccount, deleteAccount } = useAccounts()
  const navigate = useNavigate()
  const [panel,     setPanel]     = useState(null)
  const [confirmId, setConfirmId] = useState(null)

  async function handleSave(data) {
    if (panel.mode === 'create') {
      const id = await createAccount(data)
      navigate(`/admin/accounts/${id}`)
    } else {
      await updateAccount(panel.account.id, data)
    }
    setPanel(null)
  }

  const active = accounts.filter(a => a.status === 'active').length

  return (
    <div className="ac-page">
      <div className="ac-page-header">
        <div className="ac-page-header__left">
          <span className="ac-page-header__count">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</span>
          <span className="ac-page-header__meta">{active} active</span>
        </div>
        <button className="ac-btn ac-btn--primary" onClick={() => setPanel({ mode: 'create' })}>+ New Account</button>
      </div>

      <div className="ac-grid ac-grid--accounts">
        {accounts.map(account => {
          const meta      = ACC_STATUS[account.status] ?? ACC_STATUS.inactive
          const color     = avatarColor(account.id)
          const initials  = account.name.split(' ').slice(0, 2).map(w => w[0]).join('')
          const alerts    = alertCount(account.units)
          const devs      = deviceCount(account.units)
          const people    = account.units.filter(u => u.type === 'person').length
          const vehicles  = account.units.filter(u => u.type === 'vehicle').length
          const isConfirm = confirmId === account.id

          return (
            <div key={account.id}
              className={`ac-account-card${alerts > 0 ? ' has-alert' : ''}${isConfirm ? ' is-confirming' : ''}`}
              onClick={() => !isConfirm && navigate(`/admin/accounts/${account.id}`)}>

              <div className="ac-account-card__top">
                <div className="ac-account-card__avatar" style={{ background: color }}>{initials}</div>
                <div className="ac-account-card__info">
                  <div className="ac-account-card__name-row">
                    <span className="ac-account-card__name">{account.name}</span>
                    <span className="ac-chip" style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}44` }}>
                      {meta.label}
                    </span>
                  </div>
                  <span className="ac-account-card__industry">{account.industry} · {account.type}</span>
                  <span className="ac-account-card__contact">{account.contact.name}</span>
                </div>
              </div>

              <div className="ac-account-card__footer">
                <span className="ac-stat">{people} people</span>
                <span className="ac-stat">{vehicles} vehicles</span>
                <span className="ac-stat">{devs} devices</span>
                {alerts > 0 && <span className="ac-alert-badge">{alerts} alert{alerts > 1 ? 's' : ''}</span>}
                <div className="ac-account-card__actions" onClick={e => e.stopPropagation()}>
                  <button className="ac-icon-btn" title="Edit" onClick={() => setPanel({ mode: 'edit', account })}>
                    <EditIcon />
                  </button>
                  <button className="ac-icon-btn ac-icon-btn--danger" title="Delete" onClick={() => setConfirmId(account.id)}>
                    <TrashIcon />
                  </button>
                </div>
              </div>

              {isConfirm && (
                <div onClick={e => e.stopPropagation()}>
                  <ConfirmBar
                    message={`Delete "${account.name}"? All units and groups will be removed.`}
                    onCancel={() => setConfirmId(null)}
                    onConfirm={() => { deleteAccount(account.id); setConfirmId(null) }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {panel && (
        <Panel title={panel.mode === 'create' ? 'New Account' : 'Edit Account'} onClose={() => setPanel(null)}>
          <AccountForm initial={panel.account} onSave={handleSave} onCancel={() => setPanel(null)} />
        </Panel>
      )}
    </div>
  )
}

/* ── UnitAvatar ───────────────────────────────────────────────── */
function UnitAvatar({ unit }) {
  if (unit.photoUrl) {
    return <img className="ac-unit-avatar ac-unit-avatar--photo" src={unit.photoUrl} alt={unit.name} />
  }
  const initials = unit.type === 'vehicle'
    ? (unit.name ?? '?')[0].toUpperCase()
    : unit.name.split(' ').slice(0, 2).map(w => w[0]).join('')
  const bg = avatarColor(unit.id)
  return (
    <div className="ac-unit-avatar" style={{ background: bg }}>
      {initials}
    </div>
  )
}

/* ── RosterCard ───────────────────────────────────────────────── */
function RosterCard({ unit, accountId, confirmDelete, setConfirmDelete, setPanel, setDeviceUnitId, deleteUnit }) {
  const sm        = UNIT_STATUS[unit.status] ?? UNIT_STATUS.offline
  const isConfirm = confirmDelete === unit.id
  const navigate  = useNavigate()
  const unitPath  = unit.type === 'person'
    ? `/admin/unit/principal/${unit.id}`
    : `/admin/unit/vehicle/${unit.id}`
  return (
    <div
      className={`ac-roster-card${isConfirm ? ' is-confirming' : ''}`}
      style={{ '--status-color': sm.color, cursor: 'pointer' }}
      onClick={() => navigate(unitPath)}
    >
      <div className="ac-roster-card__header">
        <UnitAvatar unit={unit} />
        <div className="ac-roster-card__title-col">
          <div className="ac-roster-card__title-row">
            <span className="ac-roster-card__dot" style={{ background: sm.color, boxShadow: unit.status !== 'offline' ? `0 0 6px ${sm.color}99` : 'none' }} />
            <span className="ac-roster-card__name">{unit.name}</span>
          </div>
          {unit.type === 'person' && unit.role && <span className="ac-roster-card__role">{unit.role}</span>}
          {unit.type === 'vehicle' && <span className="ac-roster-card__role">{[unit.make, unit.model].filter(Boolean).join(' ')}</span>}
        </div>
        <div className="ac-card-actions" onClick={e => e.stopPropagation()}>
          <button className="ac-icon-btn" title="Edit" onClick={() => setPanel({ mode: 'editUnit', unit })}>
            <EditIcon />
          </button>
          <button className="ac-icon-btn ac-icon-btn--danger" title="Delete" onClick={() => setConfirmDelete(unit.id)}>
            <TrashIcon />
          </button>
        </div>
      </div>

      <div className="ac-roster-card__body">
        {unit.type === 'person' ? (
          <>
            {unit.phone && <span className="ac-roster-card__meta ac-roster-card__meta--mono">{unit.phone}</span>}
            {unit.email && <span className="ac-roster-card__meta ac-roster-card__meta--mono">{unit.email}</span>}
          </>
        ) : (
          <div className="ac-roster-card__vehicle-row">
            {unit.plate      && <span className="ac-roster-card__plate">{unit.plate}</span>}
            {unit.armorLevel && <span className="ac-roster-card__armor">{unit.armorLevel}</span>}
          </div>
        )}
      </div>

      <div className="ac-roster-card__footer">
        <span className="ac-chip ac-chip--sm" style={{ color: sm.color, background: `${sm.color}18`, borderColor: `${sm.color}44` }}>
          {sm.label}
        </span>
        {unit.type === 'person' && unit.emergency?.bloodGroup && (
          <span className="ac-blood-chip">{unit.emergency.bloodGroup}</span>
        )}
        <button className="ac-roster-card__devs-btn" onClick={e => { e.stopPropagation(); setDeviceUnitId(unit.id) }}>
          {unit.devices?.length ?? 0} device{(unit.devices?.length ?? 0) !== 1 ? 's' : ''}
        </button>
      </div>

      {isConfirm && (
        <div onClick={e => e.stopPropagation()}>
          <ConfirmBar
            message={`Remove "${unit.name}" from this account?`}
            onCancel={() => setConfirmDelete(null)}
            onConfirm={() => { deleteUnit(accountId, unit.id); setConfirmDelete(null) }}
          />
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   PLACES — PlaceForm, PlaceCard, PlacesSection
═══════════════════════════════════════════════════════════════ */

function PlaceForm({ initial, onSave, onCancel }) {
  const [sessionToken] = useState(() => crypto.randomUUID())
  const debounceRef    = useRef(null)

  const [query,       setQuery]       = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [resolved,    setResolved]    = useState(initial ? {
    latitude:  initial.latitude,  longitude: initial.longitude,
    name:      initial.name,      address:   initial.address,
    mapboxId:  initial.mapboxId,
  } : null)
  const [name,   setName]   = useState(initial?.name   ?? '')
  const [radius, setRadius] = useState(initial?.radius ?? 150)
  const [color,  setColor]  = useState(initial?.color  ?? PLACE_COLORS[0])
  const [saving, setSaving] = useState(false)

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  function handleQueryChange(q) {
    setQuery(q)
    clearTimeout(debounceRef.current)
    if (!q.trim()) { setSuggestions([]); return }
    debounceRef.current = setTimeout(async () => {
      const results = await searchGoogle(q, sessionToken)
      setSuggestions(results)
    }, 300)
  }

  async function handleSelect(suggestion) {
    setSuggestions([])
    setQuery('')
    const place = await resolveGooglePlace(suggestion.placeId)
    if (!place) return
    setResolved(place)
    if (!name || name === resolved?.name) setName(place.name)
  }

  const valid  = resolved && name.trim()
  const circle = resolved ? makeCircleGeoJSON(resolved.longitude, resolved.latitude, radius) : null

  async function handleSave() {
    if (!valid || saving) return
    setSaving(true)
    try {
      await onSave({
        name: name.trim(), address: resolved.address, mapboxId: resolved.mapboxId,
        latitude: resolved.latitude, longitude: resolved.longitude, radius, color,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Field label="SEARCH LOCATION">
        <div className="ac-place-search">
          <input
            className="ac-input"
            placeholder="Search by name or address…"
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            onBlur={() => setTimeout(() => setSuggestions([]), 150)}
            autoComplete="off"
          />
          {suggestions.length > 0 && (
            <div className="ac-place-suggestions">
              {suggestions.map(s => (
                <button
                  key={s.placeId}
                  className="ac-place-suggestion"
                  onMouseDown={e => { e.preventDefault(); handleSelect(s) }}
                >
                  <span className="ac-place-suggestion__name">{s.name}</span>
                  <span className="ac-place-suggestion__sub">{s.context}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {resolved && <span className="ac-place-resolved">✓ {resolved.address ?? resolved.name}</span>}
      </Field>

      {resolved && circle && (
        <div className="ac-place-map-preview">
          <Map
            key={`${resolved.longitude},${resolved.latitude}`}
            mapboxAccessToken={MAPBOX_TOKEN}
            initialViewState={{ longitude: resolved.longitude, latitude: resolved.latitude, zoom: 15 }}
            mapStyle="mapbox://styles/mapbox/dark-v11"
            style={{ width: '100%', height: '100%' }}
          >
            <Marker longitude={resolved.longitude} latitude={resolved.latitude} anchor="center">
              <div className="ac-place-marker" style={{ background: color }} />
            </Marker>
            <Source id="place-circle" type="geojson" data={circle}>
              <Layer id="place-circle-fill"    type="fill" paint={{ 'fill-color': color, 'fill-opacity': 0.15 }} />
              <Layer id="place-circle-outline" type="line" paint={{ 'line-color': color, 'line-width': 2 }} />
            </Source>
          </Map>
        </div>
      )}

      <Field label="PLACE NAME *">
        <input
          className="ac-input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. School, Home, Office"
        />
      </Field>

      <Field label={`GEOFENCE RADIUS — ${radius}m`}>
        <input
          type="range" className="ac-range"
          min={50} max={1000} step={25}
          value={radius}
          onChange={e => setRadius(Number(e.target.value))}
        />
      </Field>

      <Field label="COLOR">
        <div className="ac-place-colors">
          {PLACE_COLORS.map(c => (
            <button
              key={c} type="button"
              className={`ac-place-color-swatch${color === c ? ' is-active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </Field>

      <div className="ac-form-actions">
        <button className="ac-btn ac-btn--ghost" onClick={onCancel}>Cancel</button>
        <button className="ac-btn ac-btn--primary" disabled={!valid || saving} onClick={handleSave}>
          {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Place'}
        </button>
      </div>
    </>
  )
}

function PlaceCard({ place, onEdit, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <div className="ac-place-card">
      <div className="ac-place-card__header">
        <div className="ac-place-card__dot" style={{ background: place.color }} />
        <span className="ac-place-card__name">{place.name}</span>
        <div className="ac-place-card__actions">
          <button className="ac-icon-btn" title="Edit" onClick={onEdit}><EditIcon /></button>
          <button className="ac-icon-btn ac-icon-btn--danger" title="Delete" onClick={() => setConfirmDelete(true)}><TrashIcon /></button>
        </div>
      </div>
      {place.address && <span className="ac-place-card__address">{place.address}</span>}
      <span className="ac-place-card__radius">{place.radius}m radius</span>
      {confirmDelete && (
        <ConfirmBar
          message={`Delete "${place.name}"?`}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={onDelete}
        />
      )}
    </div>
  )
}

function PlacesSection({ accountId, panelMode, onPanelChange }) {
  const [places, setPlaces] = useState([])

  useEffect(() => {
    apiFetch(apiUrl(`/api/accounts/${accountId}/places`))
      .then(r => r.json())
      .then(data => setPlaces(Array.isArray(data) ? data : []))
  }, [accountId])

  async function handleSave(data) {
    if (panelMode === 'add') {
      const res   = await apiFetch(apiUrl(`/api/accounts/${accountId}/places`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const place = await res.json()
      setPlaces(p => [...p, place])
    } else {
      const res   = await apiFetch(apiUrl(`/api/accounts/${accountId}/places/${panelMode.place.id}`), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const place = await res.json()
      setPlaces(p => p.map(x => x.id === place.id ? place : x))
    }
    onPanelChange(null)
  }

  async function handleDelete(placeId) {
    await apiFetch(apiUrl(`/api/accounts/${accountId}/places/${placeId}`), { method: 'DELETE' })
    setPlaces(p => p.filter(x => x.id !== placeId))
  }

  return (
    <>
      <section className="ac-section">
        <div className="ac-section__head">
          <span className="ac-section__label">PLACES <span className="ac-section__count">{places.length}</span></span>
        </div>
        {places.length === 0 ? (
          <div className="ac-empty ac-empty--inline">
            <span className="ac-empty__text">No places yet — add named locations to use in plans</span>
          </div>
        ) : (
          <div className="ac-grid ac-grid--places">
            {places.map(place => (
              <PlaceCard
                key={place.id}
                place={place}
                onEdit={() => onPanelChange({ place })}
                onDelete={() => handleDelete(place.id)}
              />
            ))}
          </div>
        )}
      </section>

      {panelMode && (
        <Panel
          title={panelMode === 'add' ? 'Add Place' : 'Edit Place'}
          onClose={() => onPanelChange(null)}
        >
          <PlaceForm
            initial={panelMode === 'add' ? undefined : panelMode.place}
            onSave={handleSave}
            onCancel={() => onPanelChange(null)}
          />
        </Panel>
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════
   PLANS — PlanForm, PlanCard, PlansSection
═══════════════════════════════════════════════════════════════ */

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/* ── MiniPlaceForm — inline "save as place" after picking from map ─ */
function MiniPlaceForm({ resolved, onSave, onCancel }) {
  const [name,   setName]   = useState(resolved.name ?? '')
  const [radius, setRadius] = useState(150)
  const [color,  setColor]  = useState(PLACE_COLORS[0])
  const [saving, setSaving] = useState(false)
  const circle = makeCircleGeoJSON(resolved.longitude, resolved.latitude, radius)

  async function handleSave() {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      await onSave({
        name: name.trim(), address: resolved.address, mapboxId: resolved.mapboxId,
        latitude: resolved.latitude, longitude: resolved.longitude, radius, color,
      })
    } finally { setSaving(false) }
  }

  return (
    <div className="ac-loc-adding">
      <div className="ac-place-map-preview" style={{ height: 130 }}>
        <Map
          key={`mini-${resolved.longitude},${resolved.latitude}`}
          mapboxAccessToken={MAPBOX_TOKEN}
          initialViewState={{ longitude: resolved.longitude, latitude: resolved.latitude, zoom: 14 }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          style={{ width: '100%', height: '100%' }}
        >
          <Marker longitude={resolved.longitude} latitude={resolved.latitude} anchor="center">
            <div className="ac-place-marker" style={{ background: color }} />
          </Marker>
          <Source id="mini-circle" type="geojson" data={circle}>
            <Layer id="mini-circle-fill"    type="fill" paint={{ 'fill-color': color, 'fill-opacity': 0.15 }} />
            <Layer id="mini-circle-outline" type="line" paint={{ 'line-color': color, 'line-width': 2 }} />
          </Source>
        </Map>
      </div>
      <Field label="PLACE NAME *">
        <input className="ac-input" value={name} onChange={e => setName(e.target.value)} autoFocus />
      </Field>
      <Field label={`RADIUS — ${radius}m`}>
        <input type="range" className="ac-range" min={50} max={1000} step={25}
          value={radius} onChange={e => setRadius(Number(e.target.value))} />
      </Field>
      <Field label="COLOR">
        <div className="ac-place-colors">
          {PLACE_COLORS.map(c => (
            <button key={c} type="button"
              className={`ac-place-color-swatch${color === c ? ' is-active' : ''}`}
              style={{ background: c }} onClick={() => setColor(c)} />
          ))}
        </div>
      </Field>
      <div className="ac-loc-adding__actions">
        <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={onCancel}>← Back</button>
        <button type="button" className="ac-btn ac-btn--primary" disabled={!name.trim() || saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save Place'}
        </button>
      </div>
    </div>
  )
}

/* ── LocationPicker — saved places → Mapbox → inline create ─────── */
function LocationPicker({ value, onChange, places, accountId, onPlaceCreated }) {
  const [sessionToken] = useState(() => crypto.randomUUID())
  const debounceRef    = useRef(null)
  const [query,       setQuery]      = useState('')
  const [googleSuggs, setGoogleSuggs] = useState([])
  const [dropOpen,    setDropOpen]   = useState(false)
  const [addingNew,   setAddingNew]  = useState(null)

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  const selectedPlace   = value ? places.find(p => p.id === value) : null
  const matchingPlaces  = places.filter(p =>
    !query.trim() || p.name.toLowerCase().includes(query.toLowerCase())
  )

  function handleQueryChange(q) {
    setQuery(q)
    clearTimeout(debounceRef.current)
    setGoogleSuggs([])
    if (!q.trim()) return
    debounceRef.current = setTimeout(async () => {
      const results = await searchGoogle(q, sessionToken)
      setGoogleSuggs(results)
    }, 350)
  }

  function handleSelectPlace(place) {
    onChange(place.id)
    setQuery('')
    setDropOpen(false)
    setGoogleSuggs([])
  }

  async function handleSelectGoogle(suggestion) {
    const resolved = await resolveGooglePlace(suggestion.placeId)
    if (!resolved) return
    setDropOpen(false)
    setQuery('')
    setGoogleSuggs([])
    setAddingNew(resolved)
  }

  async function handleSaveNew(data) {
    const res   = await apiFetch(apiUrl(`/api/accounts/${accountId}/places`), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const place = await res.json()
    onPlaceCreated(place)
    onChange(place.id)
    setAddingNew(null)
  }

  if (addingNew) {
    return <MiniPlaceForm resolved={addingNew} onSave={handleSaveNew} onCancel={() => setAddingNew(null)} />
  }

  if (selectedPlace) {
    return (
      <div className="ac-loc-selected">
        <div className="ac-loc-selected__dot" style={{ background: selectedPlace.color }} />
        <span className="ac-loc-selected__name">{selectedPlace.name}</span>
        <button type="button" className="ac-loc-selected__clear" onClick={() => onChange(null)}>×</button>
      </div>
    )
  }

  const showDrop = dropOpen && (matchingPlaces.length > 0 || googleSuggs.length > 0)

  return (
    <div className="ac-loc-search">
      <input
        className="ac-input"
        placeholder="Search saved places or map…"
        value={query}
        onChange={e => handleQueryChange(e.target.value)}
        onFocus={() => setDropOpen(true)}
        onBlur={() => setTimeout(() => setDropOpen(false), 150)}
        autoComplete="off"
      />
      {showDrop && (
        <div className="ac-loc-dropdown">
          {matchingPlaces.length > 0 && (
            <>
              <div className="ac-loc-dropdown__section">SAVED PLACES</div>
              {matchingPlaces.map(p => (
                <button key={p.id} className="ac-loc-result" onMouseDown={e => { e.preventDefault(); handleSelectPlace(p) }}>
                  <div className="ac-loc-result__dot" style={{ background: p.color }} />
                  <div className="ac-loc-result__text">
                    <span className="ac-loc-result__name">{p.name}</span>
                    {p.address && <span className="ac-loc-result__addr">{p.address}</span>}
                  </div>
                </button>
              ))}
            </>
          )}
          {googleSuggs.length > 0 && (
            <>
              <div className="ac-loc-dropdown__section">FROM MAP — saves as a new place</div>
              {googleSuggs.map(s => (
                <button key={s.placeId} className="ac-loc-result ac-loc-result--map" onMouseDown={e => { e.preventDefault(); handleSelectGoogle(s) }}>
                  <div className="ac-loc-result__text">
                    <span className="ac-loc-result__name">{s.name}</span>
                    <span className="ac-loc-result__addr">{s.context}</span>
                  </div>
                  <span className="ac-loc-result__badge">+ New</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function emptyLeg(type) {
  return type === 'recurring'
    ? { originPlaceId: null, destinationPlaceId: null, daysOfWeek: [1, 2, 3, 4, 5], windowStart: '', windowEnd: '' }
    : { originPlaceId: null, destinationPlaceId: null, arrivalAt: '', departureAt: '' }
}

function PlanForm({ initial, accountId, units, onSave, onCancel }) {
  const [places,        setPlaces]        = useState([])
  const [name,          setName]          = useState(initial?.name  ?? '')
  const [type,          setType]          = useState(initial?.type  ?? 'recurring')
  const [notes,         setNotes]         = useState(initial?.notes ?? '')
  const [legs,          setLegs]          = useState(initial?.legs?.length > 0 ? initial.legs : [emptyLeg(initial?.type ?? 'recurring')])
  const [selectedUnits, setSelectedUnits] = useState(initial?.units?.map(u => u.unitId) ?? [])
  const [unitQuery,     setUnitQuery]     = useState('')
  const [unitDropOpen,  setUnitDropOpen]  = useState(false)
  const [saving,        setSaving]        = useState(false)

  useEffect(() => {
    apiFetch(apiUrl(`/api/accounts/${accountId}/places`))
      .then(r => r.json())
      .then(data => setPlaces(Array.isArray(data) ? data : []))
  }, [accountId])

  function toggleUnit(id) {
    setSelectedUnits(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function handleTypeChange(t) {
    setType(t)
    setLegs(ls => ls.map(() => emptyLeg(t)))
  }

  function updateLeg(i, patch) {
    setLegs(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l))
  }

  function toggleDay(legIdx, day) {
    setLegs(ls => ls.map((l, i) => {
      if (i !== legIdx) return l
      const days = l.daysOfWeek ?? []
      const next = days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort((a, b) => a - b)
      return { ...l, daysOfWeek: next }
    }))
  }

  const filteredUnits = units.filter(u =>
    !unitQuery.trim() || u.name.toLowerCase().includes(unitQuery.toLowerCase())
  )

  const valid = name.trim() && legs.length > 0 && selectedUnits.length > 0

  async function handleSave() {
    if (!valid || saving) return
    setSaving(true)
    try {
      await onSave({
        name:    name.trim(),
        type,
        enabled: initial?.enabled !== false,
        notes:   notes || null,
        legs:    legs.map((l, i) => ({ ...l, legOrder: i })),
        units:   selectedUnits.map(id => {
          const u = units.find(x => x.id === id)
          return { unitId: id, unitType: u?.type === 'vehicle' ? 'vehicle' : 'principal' }
        }),
      })
    } finally { setSaving(false) }
  }

  return (
    <>
      <Field label="PLAN NAME *">
        <input className="ac-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. School Run, Morning Commute" />
      </Field>

      <Field label="TYPE">
        <div className="ac-plan-type-toggle">
          <button type="button" className={`ac-plan-type-btn${type === 'recurring' ? ' is-active' : ''}`} onClick={() => handleTypeChange('recurring')}>Recurring</button>
          <button type="button" className={`ac-plan-type-btn${type === 'one_time'  ? ' is-active' : ''}`} onClick={() => handleTypeChange('one_time')}>One-time</button>
        </div>
      </Field>

      <Field label="NOTES">
        <input className="ac-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
      </Field>

      <div className="ac-plan-legs-header">
        <span className="ac-field__label">LEGS</span>
        <button type="button" className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setLegs(ls => [...ls, emptyLeg(type)])}>+ Add leg</button>
      </div>

      {legs.map((leg, i) => (
        <div key={i} className="ac-plan-leg">
          <div className="ac-plan-leg__head">
            <span className="ac-plan-leg__num">Leg {i + 1}</span>
            {legs.length > 1 && (
              <button type="button" className="ac-icon-btn ac-icon-btn--danger" onClick={() => setLegs(ls => ls.filter((_, idx) => idx !== i))}>
                <TrashIcon />
              </button>
            )}
          </div>

          <div className="ac-plan-leg__places">
            <Field label="FROM">
              <LocationPicker
                value={leg.originPlaceId}
                onChange={v => updateLeg(i, { originPlaceId: v })}
                places={places}
                accountId={accountId}
                onPlaceCreated={place => setPlaces(p => [...p, place])}
              />
            </Field>
            <Field label="TO">
              <LocationPicker
                value={leg.destinationPlaceId}
                onChange={v => updateLeg(i, { destinationPlaceId: v })}
                places={places}
                accountId={accountId}
                onPlaceCreated={place => setPlaces(p => [...p, place])}
              />
            </Field>
          </div>

          {type === 'recurring' ? (
            <>
              <Field label="DAYS">
                <div className="ac-plan-days">
                  {DAY_LABELS.map((label, day) => (
                    <button
                      key={day} type="button"
                      className={`ac-plan-day-btn${(leg.daysOfWeek ?? []).includes(day) ? ' is-active' : ''}`}
                      onClick={() => toggleDay(i, day)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="ac-plan-leg__time-row">
                <Field label="WINDOW START">
                  <input type="time" className="ac-input" value={leg.windowStart ?? ''} onChange={e => updateLeg(i, { windowStart: e.target.value })} />
                </Field>
                <Field label="WINDOW END">
                  <input type="time" className="ac-input" value={leg.windowEnd ?? ''} onChange={e => updateLeg(i, { windowEnd: e.target.value })} />
                </Field>
              </div>
            </>
          ) : (
            <div className="ac-plan-leg__time-row">
              <Field label="ARRIVAL">
                <input type="datetime-local" className="ac-input"
                  value={leg.arrivalAt ? leg.arrivalAt.slice(0, 16) : ''}
                  onChange={e => updateLeg(i, { arrivalAt: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                />
              </Field>
              <Field label="DEPARTURE">
                <input type="datetime-local" className="ac-input"
                  value={leg.departureAt ? leg.departureAt.slice(0, 16) : ''}
                  onChange={e => updateLeg(i, { departureAt: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                />
              </Field>
            </div>
          )}
        </div>
      ))}

      <div className="ac-plan-section-divider" />

      <Field label={`ASSIGN UNITS${selectedUnits.length > 0 ? ` — ${selectedUnits.length} selected` : ''}`}>
        {selectedUnits.length > 0 && (
          <div className="ac-plan-unit-chips">
            {selectedUnits.map(id => {
              const u = units.find(x => x.id === id)
              return (
                <span key={id} className="ac-plan-unit-chip">
                  {u?.name ?? id}
                  <button type="button" onClick={() => toggleUnit(id)}>×</button>
                </span>
              )
            })}
          </div>
        )}
        <div className="ac-plan-unit-search">
          <input
            className="ac-input"
            placeholder="Search units…"
            value={unitQuery}
            onChange={e => setUnitQuery(e.target.value)}
            onFocus={() => setUnitDropOpen(true)}
            onBlur={() => setTimeout(() => setUnitDropOpen(false), 150)}
            autoComplete="off"
          />
          {unitDropOpen && filteredUnits.length > 0 && (
            <div className="ac-plan-unit-results">
              {filteredUnits.map(u => {
                const selected = selectedUnits.includes(u.id)
                return (
                  <button
                    key={u.id} type="button"
                    className={`ac-plan-unit-result${selected ? ' is-selected' : ''}`}
                    onMouseDown={e => { e.preventDefault(); toggleUnit(u.id) }}
                  >
                    <span className="ac-plan-unit-result__name">{u.name}</span>
                    <span className="ac-plan-unit-result__type">{u.type === 'vehicle' ? 'Vehicle' : 'Person'}</span>
                    {selected && <span className="ac-plan-unit-result__check">✓</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </Field>

      <div className="ac-form-actions">
        <button className="ac-btn ac-btn--ghost" onClick={onCancel}>Cancel</button>
        <button className="ac-btn ac-btn--primary" disabled={!valid || saving} onClick={handleSave}>
          {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Plan'}
        </button>
      </div>
    </>
  )
}

function PlanCard({ plan, units, onEdit, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const planUnitNames = (plan.units ?? [])
    .map(pu => units.find(u => u.id === pu.unitId)?.name)
    .filter(Boolean)
  const firstLeg  = plan.legs?.[0]
  const isRecurr  = plan.type === 'recurring'
  const dayShorts = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
  const daysLabel = isRecurr && firstLeg?.daysOfWeek?.length > 0
    ? firstLeg.daysOfWeek.map(d => dayShorts[d]).join(' ')
    : null

  return (
    <div className={`ac-plan-card${!plan.enabled ? ' is-disabled' : ''}`}>
      <div className="ac-plan-card__header">
        <div className="ac-plan-card__title-col">
          <span className="ac-plan-card__name">{plan.name}</span>
          {planUnitNames.length > 0 && (
            <span className="ac-plan-card__unit">
              {planUnitNames.length <= 2
                ? planUnitNames.join(', ')
                : `${planUnitNames.slice(0, 2).join(', ')} +${planUnitNames.length - 2}`}
            </span>
          )}
        </div>
        <div className="ac-plan-card__actions">
          <button className="ac-icon-btn" title="Edit" onClick={onEdit}><EditIcon /></button>
          <button className="ac-icon-btn ac-icon-btn--danger" title="Delete" onClick={() => setConfirmDelete(true)}><TrashIcon /></button>
        </div>
      </div>
      <div className="ac-plan-card__meta">
        <span className={`ac-chip ac-chip--sm ac-plan-chip--${isRecurr ? 'recurring' : 'onetime'}`}>
          {isRecurr ? 'RECURRING' : 'ONE-TIME'}
        </span>
        {daysLabel && <span className="ac-plan-card__days">{daysLabel}</span>}
        {firstLeg?.windowStart && <span className="ac-plan-card__time">{firstLeg.windowStart}–{firstLeg.windowEnd}</span>}
        {plan.legs?.length > 1 && <span className="ac-plan-card__legs">{plan.legs.length} legs</span>}
        {!plan.enabled && <span className="ac-plan-card__off">OFF</span>}
      </div>
      {confirmDelete && (
        <ConfirmBar
          message={`Delete "${plan.name}"?`}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={onDelete}
        />
      )}
    </div>
  )
}

function PlansSection({ accountId, units, panelMode, onPanelChange }) {
  const [plans, setPlans] = useState([])

  useEffect(() => {
    apiFetch(apiUrl(`/api/accounts/${accountId}/plans`))
      .then(r => r.json())
      .then(data => setPlans(Array.isArray(data) ? data : []))
  }, [accountId])

  async function handleSave(data) {
    if (panelMode === 'add') {
      const res  = await apiFetch(apiUrl(`/api/accounts/${accountId}/plans`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const plan = await res.json()
      setPlans(p => [...p, plan])
    } else {
      const res  = await apiFetch(apiUrl(`/api/accounts/${accountId}/plans/${panelMode.plan.id}`), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const plan = await res.json()
      setPlans(p => p.map(x => x.id === plan.id ? plan : x))
    }
    onPanelChange(null)
  }

  async function handleDelete(planId) {
    await apiFetch(apiUrl(`/api/accounts/${accountId}/plans/${planId}`), { method: 'DELETE' })
    setPlans(p => p.filter(x => x.id !== planId))
  }

  return (
    <>
      <section className="ac-section">
        <div className="ac-section__head">
          <span className="ac-section__label">PLANS <span className="ac-section__count">{plans.length}</span></span>
        </div>
        {plans.length === 0 ? (
          <div className="ac-empty ac-empty--inline">
            <span className="ac-empty__text">No plans yet — add schedules or trips for units to follow</span>
          </div>
        ) : (
          <div className="ac-grid ac-grid--plans">
            {plans.map(plan => (
              <PlanCard
                key={plan.id}
                plan={plan}
                units={units}
                onEdit={() => onPanelChange({ plan })}
                onDelete={() => handleDelete(plan.id)}
              />
            ))}
          </div>
        )}
      </section>

      {panelMode && (
        <Panel
          title={panelMode === 'add' ? 'Add Plan' : 'Edit Plan'}
          onClose={() => onPanelChange(null)}
          wide
        >
          <PlanForm
            initial={panelMode === 'add' ? undefined : panelMode.plan}
            accountId={accountId}
            units={units}
            onSave={handleSave}
            onCancel={() => onPanelChange(null)}
          />
        </Panel>
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════
   PAGE 2 — Account Detail  (roster + groups)
═══════════════════════════════════════════════════════════════ */
export function AccountDetail() {
  const { accounts, updateAccount, deleteAccount, createUnit, updateUnit, deleteUnit, setUnitUser, createGroup } = useAccounts()
  const { accountId } = useParams()
  const navigate      = useNavigate()
  const account       = accounts.find(a => a.id === accountId)

  const [panel,         setPanel]         = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)    // 'account' | unitId
  const [deviceUnitId,  setDeviceUnitId]  = useState(null)
  const [placePanel,    setPlacePanel]    = useState(null)    // null | 'add' | { place }
  const [planPanel,     setPlanPanel]     = useState(null)    // null | 'add' | { plan }

  if (!account) return <NotFound label="Account not found" />

  const meta     = ACC_STATUS[account.status] ?? ACC_STATUS.inactive
  const color    = avatarColor(account.id)
  const initials = account.name.split(' ').slice(0, 2).map(w => w[0]).join('')
  const alerts   = alertCount(account.units)
  const devs     = deviceCount(account.units)
  const people   = account.units.filter(u => u.type === 'person').length
  const vehicles = account.units.filter(u => u.type === 'vehicle').length

  const peopleUnits   = account.units.filter(u => u.type === 'person')
  const vehicleUnits  = account.units.filter(u => u.type === 'vehicle')

  function handleSaveUnit({ userId, userEmail, userName, ...data }) {
    if (panel.mode === 'addUnit') {
      createUnit(accountId, data)
    } else {
      updateUnit(accountId, panel.unit.id, data)
    }
    setPanel(null)
  }

  return (
    <div className="ac-page">
      <div className="ac-top-bar">
        <button className="ac-back" onClick={() => navigate('/admin/accounts')}>← All accounts</button>
        <div className="ac-top-bar__actions">
          <button className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setPanel({ mode: 'addUnit', unitType: 'person' })}>
            + Person
          </button>
          <button className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setPanel({ mode: 'addUnit', unitType: 'vehicle' })}>
            + Vehicle
          </button>
          <button className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setPanel({ mode: 'createGroup' })}>
            + Group
          </button>
          <button className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setPlacePanel('add')}>
            + Place
          </button>
          <button className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setPlanPanel('add')}>
            + Plan
          </button>
          <div className="ac-top-bar__divider" />
          <button className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setPanel({ mode: 'editAccount' })}>
            <EditIcon /> Edit
          </button>
          <button className="ac-btn ac-btn--danger-ghost ac-btn--sm" onClick={() => setConfirmDelete('account')}>
            <TrashIcon /> Delete
          </button>
        </div>
      </div>

      {confirmDelete === 'account' && (
        <ConfirmBar
          message={`Permanently delete "${account.name}" and all its units?`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => { deleteAccount(accountId); navigate('/admin/accounts') }}
        />
      )}

      {/* hero */}
      <div className="ac-hero">
        <div className="ac-hero__avatar" style={{ background: color }}>{initials}</div>
        <div className="ac-hero__body">
          <div className="ac-hero__title-row">
            <h2 className="ac-hero__name">{account.name}</h2>
            <span className="ac-chip" style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}44` }}>
              {meta.label}
            </span>
          </div>
          <span className="ac-hero__sub">{account.industry} · {account.type}</span>
          <div className="ac-hero__contact-row">
            <span className="ac-hero__contact-item">{account.contact.name}</span>
            <span className="ac-hero__contact-sep">·</span>
            <span className="ac-hero__contact-item">{account.contact.email}</span>
            {account.contact.phone && <>
              <span className="ac-hero__contact-sep">·</span>
              <span className="ac-hero__contact-item">{account.contact.phone}</span>
            </>}
          </div>
        </div>
      </div>

      {/* stats */}
      <div className="ac-stats-bar">
        {[
          { value: people,                 label: 'PEOPLE'      },
          { value: vehicles,               label: 'VEHICLES'    },
          { value: devs,                   label: 'DEVICES'     },
          { value: account.groups.length,  label: 'GROUPS'      },
          { value: alerts, label: 'ALERTS', color: alerts > 0 ? '#E0A63C' : undefined },
          { value: fmtSince(account.createdAt), label: 'CLIENT SINCE', small: true },
        ].map(s => (
          <div key={s.label} className="ac-stat-block">
            <span className="ac-stat-block__value" style={{ color: s.color, fontSize: s.small ? 13 : undefined }}>
              {s.value}
            </span>
            <span className="ac-stat-block__label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* people */}
      <section className="ac-section">
        <div className="ac-section__head">
          <span className="ac-section__label">PEOPLE <span className="ac-section__count">{peopleUnits.length}</span></span>
        </div>
        {peopleUnits.length === 0 ? (
          <div className="ac-empty ac-empty--inline">
            <span className="ac-empty__text">No people added yet</span>
          </div>
        ) : (
          <div className="ac-grid ac-grid--roster">
            {peopleUnits.map(unit => <RosterCard key={unit.id} unit={unit} accountId={accountId} confirmDelete={confirmDelete} setConfirmDelete={setConfirmDelete} setPanel={setPanel} setDeviceUnitId={setDeviceUnitId} deleteUnit={deleteUnit} />)}
          </div>
        )}
      </section>

      {/* vehicles */}
      <section className="ac-section">
        <div className="ac-section__head">
          <span className="ac-section__label">VEHICLES <span className="ac-section__count">{vehicleUnits.length}</span></span>
        </div>
        {vehicleUnits.length === 0 ? (
          <div className="ac-empty ac-empty--inline">
            <span className="ac-empty__text">No vehicles added yet</span>
          </div>
        ) : (
          <div className="ac-grid ac-grid--roster">
            {vehicleUnits.map(unit => <RosterCard key={unit.id} unit={unit} accountId={accountId} confirmDelete={confirmDelete} setConfirmDelete={setConfirmDelete} setPanel={setPanel} setDeviceUnitId={setDeviceUnitId} deleteUnit={deleteUnit} />)}
          </div>
        )}
      </section>

      {/* groups */}
      <section className="ac-section">
        <div className="ac-section__head">
          <span className="ac-section__label">GROUPS</span>
        </div>

        {account.groups.length === 0 ? (
          <div className="ac-empty ac-empty--inline">
            <span className="ac-empty__text">No groups yet — create one to coordinate a subset of units</span>
          </div>
        ) : (
          <div className="ac-grid ac-grid--groups">
            {account.groups.map(group => {
              const groupUnits  = resolveUnits(account, group.unitIds)
              const groupAlerts = alertCount(groupUnits)
              const gPeople     = groupUnits.filter(u => u.type === 'person').length
              const gVehicles   = groupUnits.filter(u => u.type === 'vehicle').length

              return (
                <div key={group.id}
                  className={`ac-group-card${groupAlerts > 0 ? ' has-alert' : ''}`}
                  onClick={() => navigate(`/admin/accounts/${accountId}/${group.id}`)}>
                  <div className="ac-group-card__header">
                    <span className="ac-group-card__name">{group.name}</span>
                    <span className="ac-group-card__arrow">→</span>
                  </div>
                  <div className="ac-group-card__stats">
                    <span className="ac-stat">{gPeople} people</span>
                    <span className="ac-stat">{gVehicles} vehicles</span>
                    {groupAlerts > 0 && <span className="ac-alert-badge">{groupAlerts} alert{groupAlerts > 1 ? 's' : ''}</span>}
                  </div>
                  {groupUnits.length > 0 && (
                    <div className="ac-group-card__dots">
                      {groupUnits.map(u => {
                        const sm = UNIT_STATUS[u.status] ?? UNIT_STATUS.offline
                        return (
                          <span key={u.id} className="ac-dot"
                            style={{ background: sm.color, boxShadow: u.status !== 'offline' ? `0 0 5px ${sm.color}88` : 'none' }}
                            title={u.name} />
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* places */}
      <PlacesSection accountId={accountId} panelMode={placePanel} onPanelChange={setPlacePanel} />

      {/* plans */}
      <PlansSection accountId={accountId} units={account.units} panelMode={planPanel} onPanelChange={setPlanPanel} />

      {/* panels */}
      {panel?.mode === 'editAccount' && (
        <Panel title="Edit Account" onClose={() => setPanel(null)}>
          <AccountForm initial={account}
            onSave={data => { updateAccount(accountId, data); setPanel(null) }}
            onCancel={() => setPanel(null)} />
        </Panel>
      )}
      {panel?.mode === 'addUnit' && (
        <Panel
          title={panel.unitType === 'vehicle' ? 'Add Vehicle' : 'Add Person'}
          onClose={() => setPanel(null)}>
          <UnitForm
            initial={panel.unitType === 'vehicle' ? { type: 'vehicle' } : undefined}
            onSave={handleSaveUnit}
            onCancel={() => setPanel(null)}
          />
        </Panel>
      )}
      {panel?.mode === 'editUnit' && (() => {
        const liveUnit = account.units.find(u => u.id === panel.unit.id) ?? panel.unit
        return (
          <Panel
            title={`Edit ${liveUnit.type === 'person' ? 'Person' : 'Vehicle'}`}
            onClose={() => setPanel(null)}>
            <UnitEditPanel
              unit={liveUnit}
              accountId={accountId}
              onSave={handleSaveUnit}
              onCancel={() => setPanel(null)}
              onUserAssigned={userData => setUnitUser(accountId, liveUnit.id, userData)}
            />
          </Panel>
        )
      })()}
      {panel?.mode === 'createGroup' && (
        <Panel title="New Group" onClose={() => setPanel(null)}>
          <NameForm label="GROUP NAME *" placeholder="e.g. Family Outing, Airport Run"
            onSave={async name => {
              const id = await createGroup(accountId, name)
              setPanel(null)
              navigate(`/admin/accounts/${accountId}/${id}`)
            }}
            onCancel={() => setPanel(null)} />
        </Panel>
      )}
      {deviceUnitId && (() => {
        const du = account.units.find(u => u.id === deviceUnitId)
        return du ? <DevicesPanel unit={du} accountId={accountId} onClose={() => setDeviceUnitId(null)} /> : null
      })()}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   PAGE 3 — Group Detail
═══════════════════════════════════════════════════════════════ */
export function GroupDetail() {
  const { accounts, renameGroup, deleteGroup, addUnitToGroup, removeUnitFromGroup } = useAccounts()
  const { accountId, groupId } = useParams()
  const navigate               = useNavigate()

  const account = accounts.find(a => a.id === accountId)
  const group   = account?.groups.find(g => g.id === groupId)

  const [panel,         setPanel]         = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null) // 'group' | unitId
  const [deviceUnitId,  setDeviceUnitId]  = useState(null)

  if (!account) return <NotFound label="Account not found" />
  if (!group)   return <NotFound label="Group not found"   />

  const groupUnits  = resolveUnits(account, group.unitIds)
  const groupAlerts = alertCount(groupUnits)
  const gPeople     = groupUnits.filter(u => u.type === 'person').length
  const gVehicles   = groupUnits.filter(u => u.type === 'vehicle').length

  return (
    <div className="ac-page">
      <div className="ac-top-bar">
        <button className="ac-back" onClick={() => navigate(`/admin/accounts/${accountId}`)}>
          ← {account.name}
        </button>
        <div className="ac-top-bar__actions">
          <button className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setPanel({ mode: 'addUnits' })}>
            + Add Units
          </button>
          <button className="ac-btn ac-btn--ghost ac-btn--sm" onClick={() => setPanel({ mode: 'rename' })}>
            <EditIcon /> Rename
          </button>
          <button className="ac-btn ac-btn--danger-ghost ac-btn--sm" onClick={() => setConfirmDelete('group')}>
            <TrashIcon /> Delete
          </button>
        </div>
      </div>

      {confirmDelete === 'group' && (
        <ConfirmBar
          message={`Delete group "${group.name}"? Units remain in the account roster.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => { deleteGroup(accountId, groupId); navigate(`/admin/accounts/${accountId}`) }}
        />
      )}

      <div className="ac-section-header">
        <h2 className="ac-section-header__name">{group.name}</h2>
        <span className="ac-section-header__sub">
          {account.name} · {gPeople} people · {gVehicles} vehicles
          {groupAlerts > 0 && <span style={{ color: '#E0A63C' }}> · {groupAlerts} alert{groupAlerts > 1 ? 's' : ''}</span>}
        </span>
      </div>

      {groupUnits.length === 0 ? (
        <div className="ac-empty">
          <span className="ac-empty__icon">○</span>
          <span className="ac-empty__text">No units in this group — click "+ Add Units" to assign from the roster</span>
        </div>
      ) : (
        <div className="ac-grid ac-grid--roster">
          {groupUnits.map(unit => {
            const sm        = UNIT_STATUS[unit.status] ?? UNIT_STATUS.offline
            const isConfirm = confirmDelete === unit.id
            return (
              <div key={unit.id}
                className={`ac-roster-card${isConfirm ? ' is-confirming' : ''}`}
                style={{ '--status-color': sm.color }}>

                <div className="ac-roster-card__header">
                  <div className="ac-roster-card__title-row">
                    <span className="ac-roster-card__dot" style={{ background: sm.color, boxShadow: unit.status !== 'offline' ? `0 0 6px ${sm.color}99` : 'none' }} />
                    <span className="ac-roster-card__name">{unit.name}</span>
                    <span className={`ac-unit-type-chip ac-unit-type-chip--${unit.type}`}>
                      {unit.type === 'person' ? 'PERSON' : 'VEHICLE'}
                    </span>
                  </div>
                  <button className="ac-btn ac-btn--remove ac-btn--sm" onClick={() => setConfirmDelete(unit.id)}>
                    Remove
                  </button>
                </div>

                <div className="ac-roster-card__body">
                  <span className="ac-roster-card__meta">
                    {unit.type === 'person' ? unit.role : `${unit.make} ${unit.model}`}
                  </span>
                </div>

                <div className="ac-roster-card__footer">
                  <span className="ac-chip ac-chip--sm" style={{ color: sm.color, background: `${sm.color}18`, borderColor: `${sm.color}44` }}>
                    {sm.label}
                  </span>
                  <span className="ac-roster-card__devs">
                    {unit.devices?.length ?? 0} device{(unit.devices?.length ?? 0) !== 1 ? 's' : ''}
                  </span>
                </div>

                {isConfirm && (
                  <div onClick={e => e.stopPropagation()}>
                    <ConfirmBar
                      message={`Remove "${unit.name}" from this group?`}
                      onCancel={() => setConfirmDelete(null)}
                      onConfirm={() => { removeUnitFromGroup(accountId, groupId, unit.id); setConfirmDelete(null) }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {panel?.mode === 'rename' && (
        <Panel title="Rename Group" onClose={() => setPanel(null)}>
          <NameForm label="GROUP NAME *" initial={group.name} placeholder="Group name"
            onSave={name => { renameGroup(accountId, groupId, name); setPanel(null) }}
            onCancel={() => setPanel(null)} />
        </Panel>
      )}
      {panel?.mode === 'addUnits' && (
        <Panel title="Add Units to Group" onClose={() => setPanel(null)}>
          <UnitPicker
            account={account}
            currentUnitIds={group.unitIds}
            onAdd={unitId => addUnitToGroup(accountId, groupId, unitId)}
          />
        </Panel>
      )}
      {deviceUnitId && (() => {
        const du = account.units.find(u => u.id === deviceUnitId)
        return du ? <DevicesPanel unit={du} accountId={accountId} onClose={() => setDeviceUnitId(null)} /> : null
      })()}
    </div>
  )
}

/* ── icons ────────────────────────────────────────────────────── */
function StarIcon({ filled }) {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <path d="M6.5 1l1.545 3.13L11.5 4.635l-2.5 2.435.59 3.44L6.5 8.885l-3.09 1.625.59-3.44L1.5 4.635l3.455-.505L6.5 1z"
        stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'} />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  )
}
function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M1.5 3h9M4.5 3V2h3v1M5 5.5v3M7 5.5v3M2.5 3l.5 7h6l.5-7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function NotFound({ label }) {
  const navigate = useNavigate()
  return (
    <div className="ac-not-found">
      <span>{label}</span>
      <button onClick={() => navigate('/admin/accounts')}>← Back to accounts</button>
    </div>
  )
}
