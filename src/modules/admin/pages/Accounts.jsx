import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAccounts } from '../contexts/AccountsContext'
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

/* ═══════════════════════════════════════════════════════════════
   SHARED — Panel, Field, ConfirmBar, AccountForm, NameForm
═══════════════════════════════════════════════════════════════ */

function Panel({ title, onClose, children }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="ac-panel-backdrop" onClick={onClose}>
      <aside className="ac-panel" onClick={e => e.stopPropagation()}>
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

/* ── Unit form (person or vehicle) ───────────────────────────── */
const BLOOD_GROUPS = ['', 'A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−']
const EMERG_EMPTY  = { dob: '', height: '', bloodGroup: '', allergies: '', conditions: '', medications: '', contactName: '', contactPhone: '', contactRelation: '' }

function emergSummary(e) {
  if (!e) return null
  const filled = Object.values(e).filter(v => v?.trim()).length
  if (filled === 0) return null
  return { bloodGroup: e.bloodGroup, count: filled }
}

function UnitForm({ initial, onSave, onCancel }) {
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
function DeviceForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: '', type: 'gps', model: '', serial: '', imei: '', status: 'online', ...initial,
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
      <div className="ac-form-actions">
        <button className="ac-btn ac-btn--ghost" onClick={onCancel}>Cancel</button>
        <button className="ac-btn ac-btn--primary" disabled={!form.name.trim()} onClick={() => onSave(form)}>Save</button>
      </div>
    </>
  )
}

/* ── DeviceManager — reusable device list + add/edit ─────────── */
function DeviceManager({ unit, accountId }) {
  const { createDevice, updateDevice, deleteDevice } = useAccounts()
  const [view,          setView]          = useState('list')
  const [editingDevice, setEditingDevice] = useState(null)
  const [confirmId,     setConfirmId]     = useState(null)

  const devices = unit.devices ?? []

  function handleSave(data) {
    if (view === 'add') createDevice(accountId, unit.id, data)
    else                updateDevice(accountId, unit.id, editingDevice.id, data)
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
          initial={view === 'edit' ? editingDevice : undefined}
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

      {devices.length === 0 ? (
        <div className="ac-empty ac-empty--inline">
          <span className="ac-empty__text">No devices assigned — click "Add Device" to provision one</span>
        </div>
      ) : (
        <div className="ac-dv-list">
          {devices.map(dev => {
            const dt        = DEVICE_TYPES[dev.type] ?? DEVICE_TYPES.other
            const isOnline  = dev.status === 'online'
            const isConfirm = confirmId === dev.id
            return (
              <div key={dev.id} className={`ac-dv-row${isConfirm ? ' is-confirming' : ''}`}>
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
                    <button className="ac-icon-btn" title="Edit device" onClick={() => startEdit(dev)}>
                      <EditIcon />
                    </button>
                    <button className="ac-icon-btn ac-icon-btn--danger" title="Delete device"
                      onClick={() => setConfirmId(dev.id)}>
                      <TrashIcon />
                    </button>
                  </div>
                </div>
                {isConfirm && (
                  <ConfirmBar
                    message={`Remove "${dev.name}" from this unit?`}
                    onCancel={() => setConfirmId(null)}
                    onConfirm={() => { deleteDevice(accountId, unit.id, dev.id); setConfirmId(null) }}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
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

/* ── Unit edit panel — DETAILS + DEVICES tabs ─────────────────── */
function UnitEditPanel({ unit, accountId, onSave, onCancel }) {
  const [tab, setTab] = useState('details')

  const TABS = [
    { id: 'details', label: 'DETAILS' },
    { id: 'devices', label: 'DEVICES' },
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
        <UnitForm initial={unit} onSave={onSave} onCancel={onCancel} />
      )}
      {tab === 'devices' && (
        <DeviceManager unit={unit} accountId={accountId} />
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
   PAGE 2 — Account Detail  (roster + groups)
═══════════════════════════════════════════════════════════════ */
export function AccountDetail() {
  const { accounts, updateAccount, deleteAccount, createUnit, updateUnit, deleteUnit, createGroup } = useAccounts()
  const { accountId } = useParams()
  const navigate      = useNavigate()
  const account       = accounts.find(a => a.id === accountId)

  const [panel,         setPanel]         = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)    // 'account' | unitId
  const [deviceUnitId,  setDeviceUnitId]  = useState(null)

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

  function handleSaveUnit(data) {
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
      {panel?.mode === 'editUnit' && (
        <Panel
          title={`Edit ${panel.unit.type === 'person' ? 'Person' : 'Vehicle'}`}
          onClose={() => setPanel(null)}>
          <UnitEditPanel
            unit={panel.unit}
            accountId={accountId}
            onSave={handleSaveUnit}
            onCancel={() => setPanel(null)}
          />
        </Panel>
      )}
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
