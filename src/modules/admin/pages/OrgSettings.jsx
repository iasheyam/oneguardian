import { useState, useEffect, useRef, useMemo } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import './OrgSettings.css'
import { useAccounts } from '../contexts/AccountsContext'
import { useAuth } from '../../auth/AuthContext'
import { humanizeTime } from '../../../shared/utils/time'
import { apiUrl, apiFetch } from '../../../shared/utils/api'

const STATUS_META = {
  normal:  { color: '#37C2B8', label: 'SECURE'  },
  warning: { color: '#E0A63C', label: 'WARNING' },
  offline: { color: '#66727A', label: 'OFFLINE' },
}

const MEMBER_STATUS_META = {
  online:  { color: '#37C2B8', label: 'ONLINE'  },
  away:    { color: '#E0A63C', label: 'AWAY'    },
  offline: { color: '#66727A', label: 'OFFLINE' },
}

const ROLE_CHIP_META = {
  Admin:    { color: '#37C2B8' },
  Operator: { color: '#66727A' },
}

const ACC_STATUS = {
  active:   { color: '#37C2B8', label: 'ACTIVE'   },
  inactive: { color: '#66727A', label: 'INACTIVE' },
}

const ACTIVITY_TYPES = {
  login:    { label: 'LOGIN',    color: '#37C2B8' },
  ops:      { label: 'OPS',      color: '#5AA9C2' },
  alert:    { label: 'ALERT',    color: '#E0A63C' },
  export:   { label: 'EXPORT',   color: '#66727A' },
  settings: { label: 'SETTINGS', color: '#7B8FBD' },
  member:   { label: 'MEMBER',   color: '#9B6BCC' },
}

const LOG_EVENT_META = {
  'user.login':            { label: 'LOGIN',      color: '#37C2B8' },
  'user.logout':           { label: 'LOGOUT',     color: '#66727A' },
  'user.account_activated':{ label: 'ACTIVATED',  color: '#37C2B8' },
  'user.invite_sent':      { label: 'INVITED',    color: '#7B8FBD' },
  'user.password_changed': { label: 'PASSWORD',   color: '#E0A63C' },
  'member.updated':        { label: 'UPDATED',    color: '#5AA9C2' },
  'member.role_changed':   { label: 'ROLE',       color: '#9B6BCC' },
}


const GEO_TYPE_META = {
  'SAFE ZONE': { color: '#37C2B8' },
  'CORRIDOR':  { color: '#5AA9C2' },
  'EXCLUSION': { color: '#E0A63C' },
  'WAYPOINT':  { color: '#66727A' },
}

const ALL_PERMISSIONS = [
  { key: 'ops',      label: 'Ops',      desc: 'Access to the live operations map' },
  { key: 'units',    label: 'Units',    desc: 'View and manage tracked units' },
  { key: 'feed',     label: 'Feed',     desc: 'Access to the event and alert feed' },
  { key: 'accounts', label: 'Accounts', desc: 'Manage client accounts and resources' },
  { key: 'logs',     label: 'Logs',     desc: 'View audit and activity logs' },
  { key: 'admin',    label: 'Admin',    desc: 'Access to settings and organization management' },
]

const SECTIONS = [
  { key: 'members',    label: 'Members',        countKey: 'members'    },
  { key: 'devices',    label: 'Devices',        countKey: 'devices'    },
  { key: 'principals', label: 'Principals',     countKey: 'principals' },
  { key: 'vehicles',   label: 'Vehicles',       countKey: 'vehicles'   },
  { key: 'roles',      label: 'Roles & access', countKey: null         },
]

function sectionFromPath(pathname) {
  if (pathname.includes('/settings/devices'))    return 'devices'
  if (pathname.includes('/settings/principals')) return 'principals'
  if (pathname.includes('/settings/vehicles'))   return 'vehicles'
  if (pathname.includes('/settings/roles'))      return 'roles'
  return 'members'
}

export default function OrgSettings() {
  const [dbUsers,        setDbUsers]        = useState([])
  const [dbInvitations,  setDbInvitations]  = useState([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [dbRoles,        setDbRoles]        = useState([])
  const [rolesLoading,   setRolesLoading]   = useState(true)
  const { accounts } = useAccounts()
  const location = useLocation()
  const navigate = useNavigate()
  const active   = sectionFromPath(location.pathname)

  const allDevices = accounts.flatMap(acc =>
    acc.units.flatMap(unit =>
      (unit.devices ?? []).map(d => ({
        ...d,
        accountId: acc.id, unitId: unit.id,
        assignedTo: unit.name, accountName: acc.name, unitType: unit.type,
      }))
    )
  )

  const allPrincipals = accounts.flatMap(acc =>
    acc.units.filter(u => u.type === 'person').map(u => ({ ...u, accountName: acc.name }))
  )

  const allVehicles = accounts.flatMap(acc =>
    acc.units.filter(u => u.type === 'vehicle').map(u => ({ ...u, accountName: acc.name }))
  )

  useEffect(() => {
    Promise.all([
      apiFetch(apiUrl('/api/users')).then(r => r.json()),
      apiFetch(apiUrl('/api/invitations')).then(r => r.json()),
    ]).then(([u, i]) => {
      setDbUsers(Array.isArray(u) ? u : [])
      setDbInvitations(Array.isArray(i) ? i : [])
    }).catch(console.error)
      .finally(() => setMembersLoading(false))
  }, [])

  useEffect(() => {
    apiFetch(apiUrl('/api/roles'))
      .then(r => r.json())
      .then(data => setDbRoles(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setRolesLoading(false))
  }, [])

  function handleUpdateMember(updated) {
    setDbUsers(prev => prev.map(m => m.id === updated.id ? updated : m))
    navigate('/admin/settings/members')
  }

  const counts = {
    members:    dbUsers.length,
    devices:    allDevices.length,
    principals: allPrincipals.length,
    vehicles:   allVehicles.length,
  }

  async function handleSaveRole(id, payload) {
    const res = await apiFetch(apiUrl(`/api/roles/${id}`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return
    const updated = await res.json()
    setDbRoles(prev => prev.map(r => r.id === id ? updated : r))
    navigate('/admin/settings/roles')
  }

  async function handleCreateRole(payload) {
    const res = await apiFetch(apiUrl('/api/roles'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) return
    const created = await res.json()
    setDbRoles(prev => [...prev, created])
    navigate('/admin/settings/roles')
  }

  async function handleDeleteRole(id) {
    const res = await apiFetch(apiUrl(`/api/roles/${id}`), { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error ?? 'Delete failed')
      return
    }
    setDbRoles(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div className="org-settings">
      <aside className="os-sidebar">
        <span className="os-sidebar__heading">ORGANIZATION</span>
        {SECTIONS.map(s => (
          <button
            key={s.key}
            className={`os-sidebar__item${active === s.key ? ' active' : ''}`}
            onClick={() => navigate(`/admin/settings/${s.key}`)}
          >
            <span className="os-sidebar__label">{s.label}</span>
            {s.countKey != null && (
              <span className={`os-sidebar__count${active === s.key ? ' active' : ''}`}>
                {counts[s.countKey]}
              </span>
            )}
          </button>
        ))}
      </aside>

      <div className="os-content">
        <Routes>
          <Route index element={<Navigate to="members" replace />} />
          <Route path="members"           element={<MembersSection dbUsers={dbUsers} dbInvitations={dbInvitations} loading={membersLoading} onEdit={id => navigate(`/admin/settings/members/${id}`)} />} />
          <Route path="members/new"       element={<MemberInviteView roles={dbRoles} onSave={() => navigate('/admin/settings/members')} />} />
          <Route path="members/:memberId" element={<MemberEditView members={dbUsers} loading={membersLoading} roles={dbRoles} onSave={handleUpdateMember} />} />
          <Route path="devices"           element={<DevicesSection devices={allDevices} />} />
          <Route path="principals"        element={<PrincipalsSection principals={allPrincipals} />} />
          <Route path="vehicles"          element={<VehiclesSection vehicles={allVehicles} />} />
          <Route path="roles"             element={<RolesSection roles={dbRoles} loading={rolesLoading} onDelete={handleDeleteRole} />} />
          <Route path="roles/new"         element={<RoleCreateView onCreate={handleCreateRole} />} />
          <Route path="roles/:roleId"     element={<RoleEditView roles={dbRoles} onSave={handleSaveRole} dbUsers={dbUsers} onUpdateUser={u => setDbUsers(prev => prev.map(m => m.id === u.id ? u : m))} />} />
        </Routes>
      </div>
    </div>
  )
}

/* ── members ──────────────────────────────────────────────────── */
function MembersSection({ dbUsers, dbInvitations, loading, onEdit }) {
  const [resendingId, setResendingId] = useState(null)
  const [resendDone,  setResendDone]  = useState({})
  const [search,      setSearch]      = useState('')

  async function handleResend(inv) {
    setResendingId(inv.id)
    try {
      await apiFetch(apiUrl(`/api/invitations/${inv.id}/resend`), { method: 'POST' })
      setResendDone(p => ({ ...p, [inv.id]: true }))
      setTimeout(() => setResendDone(p => ({ ...p, [inv.id]: false })), 3000)
    } catch {
      // silently fail — user can retry
    } finally {
      setResendingId(null)
    }
  }
  const navigate = useNavigate()
  const [tab, setTab] = useState('users')

  const q = search.trim().toLowerCase()
  const filteredUsers = q
    ? dbUsers.filter(u => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q))
    : dbUsers
  const filteredInvites = q
    ? dbInvitations.filter(i => i.name?.toLowerCase().includes(q) || i.email?.toLowerCase().includes(q))
    : dbInvitations

  if (loading) return <div className="os-section"><span className="os-section__meta">Loading…</span></div>

  return (
    <div className="os-section">
      <div className="os-section__header">
        <div>
          <span className="os-section__title">Members</span>
          <span className="os-section__meta">
            {dbUsers.length} active · {dbInvitations.length} pending
          </span>
        </div>
        <button className="os-action-btn" onClick={() => navigate('/admin/settings/members/new')}>+ Invite member</button>
      </div>

      <div className="os-search-wrap">
        <SearchIcon />
        <input className="os-search" placeholder="Search by name, email or role…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* ── tabs ── */}
      <div className="os-member-tabs">
        <button
          className={`os-member-tab${tab === 'users' ? ' active' : ''}`}
          onClick={() => setTab('users')}
        >
          Users
          <span className="os-member-tab__count">{dbUsers.length}</span>
        </button>
        <button
          className={`os-member-tab${tab === 'invitations' ? ' active' : ''}`}
          onClick={() => setTab('invitations')}
        >
          Invitations
          {dbInvitations.length > 0 && (
            <span className="os-member-tab__count os-member-tab__count--pending">{dbInvitations.length}</span>
          )}
        </button>
      </div>

      {/* ── users tab ── */}
      {tab === 'users' && (
        <div className="os-table-wrap">
          <table className="os-table">
            <thead>
              <tr>
                <th>NAME / EMAIL</th>
                <th>TYPE</th>
                <th>ROLE</th>
                <th>2FA</th>
                <th>STATUS</th>
                <th>LAST LOGIN</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0
                ? <tr><td colSpan={7} className="os-td-empty">{q ? 'No matches.' : 'No active users yet.'}</td></tr>
                : filteredUsers.map(u => {
                    const statusMeta  = MEMBER_STATUS_META[u.status] ?? MEMBER_STATUS_META.offline
                    const roleColor   = u.roleColor ?? ROLE_CHIP_META[u.role]?.color ?? '#66727A'
                    return (
                      <tr key={u.id}>
                        <td>
                          <div className="os-member-cell">
                            <Avatar name={u.name} role={u.role} />
                            <div>
                              <span className="os-member-name">{u.name}</span>
                              <span className="os-member-email">{u.email}</span>
                            </div>
                          </div>
                        </td>
                        <td><Chip label={u.type === 'external' ? 'EXTERNAL' : 'INTERNAL'} color={u.type === 'external' ? '#7B8FBD' : '#37C2B8'} /></td>
                        <td><Chip label={u.role ?? '—'} color={roleColor} /></td>
                        <td><Chip label={u.twoFactor ? 'ON' : 'OFF'} color={u.twoFactor ? '#37C2B8' : '#E0A63C'} /></td>
                        <td><Chip label={statusMeta.label} color={statusMeta.color} dot /></td>
                        <td className="os-td-mono os-td-last-login">{humanizeTime(u.lastActiveAt)}</td>
                        <td><button className="os-row-manage-btn" onClick={() => onEdit(u.id)}>Manage</button></td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>
      )}

      {/* ── invitations tab ── */}
      {tab === 'invitations' && (
        <div className="os-table-wrap">
          <table className="os-table">
            <thead>
              <tr>
                <th>NAME / EMAIL</th>
                <th>ROLE</th>
                <th>INVITED</th>
                <th>STATUS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredInvites.length === 0
                ? <tr><td colSpan={5} className="os-td-empty">{q ? 'No matches.' : 'No pending invitations.'}</td></tr>
                : filteredInvites.map(inv => (
                    <tr key={inv.id}>
                      <td>
                        <div className="os-member-cell">
                          <Avatar name={inv.name} role={inv.role} />
                          <div>
                            <span className="os-member-name">{inv.name}</span>
                            <span className="os-member-email">{inv.email}</span>
                          </div>
                        </div>
                      </td>
                      <td><Chip label={inv.role ?? '—'} color={inv.roleColor ?? ROLE_CHIP_META[inv.role]?.color ?? '#66727A'} /></td>
                      <td className="os-td-mono">{new Date(inv.invitedAt).toLocaleDateString()}</td>
                      <td><Chip label="PENDING" color="#E0A63C" dot /></td>
                      <td>
                        <button
                          className="os-resend-btn"
                          onClick={() => handleResend(inv)}
                          disabled={resendingId === inv.id}
                        >
                          {resendDone[inv.id] ? '✓ Sent' : resendingId === inv.id ? 'Sending…' : 'Resend'}
                        </button>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const DEVICE_TYPE_LABELS = {
  gps:    'GPS',
  camera: 'Camera',
  alert:  'Panic Button',
  radio:  'Radio',
  phone:  'Phone',
  other:  'Other',
}

const DEVICE_TYPE_OPTIONS = Object.entries(DEVICE_TYPE_LABELS).map(([k, v]) => ({ value: k, label: v }))

/* ── devices ──────────────────────────────────────────────────── */
function DevicesSection({ devices }) {
  const { loading, accounts, updateDevice, deleteDevice } = useAccounts()
  const onlineCount  = devices.filter(d => d.status === 'online').length
  const [editing,    setEditing]    = useState(null)
  const [confirmId,  setConfirmId]  = useState(null)
  const [form,       setForm]       = useState({})
  const [saving,     setSaving]     = useState(false)
  const [search,     setSearch]     = useState('')

  function startEdit(d) {
    setEditing(d)
    setForm({ name: d.name, type: d.type, model: d.model || '', serial: d.serial || '',
              imei: d.imei || '', status: d.status })
    setConfirmId(null)
  }

  function cancelEdit() { setEditing(null) }

  async function handleSave() {
    setSaving(true)
    try {
      await updateDevice(editing.accountId, editing.unitId, editing.id, form)
      setEditing(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(d) {
    await deleteDevice(d.accountId, d.unitId, d.id)
    setConfirmId(null)
    if (editing?.id === d.id) setEditing(null)
  }

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // editing panel
  if (editing) {
    return (
      <div className="os-section">
        <div className="re-header">
          <button className="re-back" onClick={cancelEdit}>← DEVICES</button>
          <div className="re-header__title">
            <span className="re-header__name">{editing.name}</span>
            <span className="os-td-sub" style={{ marginTop: 0 }}>{editing.assignedTo} · {editing.accountName}</span>
          </div>
          <button className="re-save" onClick={handleSave} disabled={!form.name?.trim() || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>

        <div className="re-block">
          <span className="re-block__label">DEVICE DETAILS</span>
          <div className="re-fields">
            <div className="re-field-group">
              <label className="re-field-label">Name <span className="re-required">*</span></label>
              <input className="re-field-input" value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
            </div>
            <div className="re-fields-row">
              <div className="re-field-group">
                <label className="re-field-label">Type</label>
                <select className="re-field-input" value={form.type} onChange={e => set('type', e.target.value)}>
                  {DEVICE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="re-field-group">
                <label className="re-field-label">Status</label>
                <select className="re-field-input" value={form.status} onChange={e => set('status', e.target.value)}>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                </select>
              </div>
            </div>
            <div className="re-field-group">
              <label className="re-field-label">Model</label>
              <input className="re-field-input" value={form.model} onChange={e => set('model', e.target.value)} placeholder="e.g. Teltonika FMB920" />
            </div>
            <div className="re-fields-row">
              <div className="re-field-group">
                <label className="re-field-label">IMEI</label>
                <input className="re-field-input re-field-input--mono" value={form.imei} onChange={e => set('imei', e.target.value)} placeholder="15-digit IMEI" />
              </div>
              <div className="re-field-group">
                <label className="re-field-label">Serial / Asset ID</label>
                <input className="re-field-input re-field-input--mono" value={form.serial} onChange={e => set('serial', e.target.value)} placeholder="Serial number" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="os-section">
      <div className="os-section__header">
        <div>
          <span className="os-section__title">Devices</span>
          <span className="os-section__meta">
            {devices.length} device{devices.length !== 1 ? 's' : ''} · {onlineCount} online
          </span>
        </div>
      </div>

      {loading ? (
        <div className="os-empty">Loading…</div>
      ) : devices.length === 0 ? (
        <div className="os-empty">No devices yet — add them from a unit's edit panel in Accounts.</div>
      ) : (() => {
        const q = search.trim().toLowerCase()
        const filtered = q
          ? devices.filter(d => d.name?.toLowerCase().includes(q) || d.assignedTo?.toLowerCase().includes(q) || d.accountName?.toLowerCase().includes(q) || d.imei?.toLowerCase().includes(q) || d.serial?.toLowerCase().includes(q))
          : devices
        return (
        <>
        <div className="os-search-wrap">
          <SearchIcon />
          <input className="os-search" placeholder="Search by name, unit, account or IMEI…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="os-table-wrap">
          <table className="os-table">
            <thead>
              <tr>
                <th>NAME</th>
                <th>TYPE</th>
                <th>IMEI</th>
                <th>SERIAL</th>
                <th>ASSIGNED TO</th>
                <th>MODEL</th>
                <th>STATUS</th>
                <th>TRACCAR ID</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={9} className="os-td-empty">No matches.</td></tr>
                : filtered.map(d => (
                <>
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td className="os-td-mono">{DEVICE_TYPE_LABELS[d.type] ?? d.type}</td>
                    <td className="os-td-mono os-td-imei">{d.imei || '—'}</td>
                    <td className="os-td-mono">{d.serial || '—'}</td>
                    <td>
                      <span>{d.assignedTo}</span>
                      <span className="os-td-sub">{d.accountName}</span>
                    </td>
                    <td>{d.model || '—'}</td>
                    <td>
                      <Chip
                        label={d.status === 'online' ? 'ONLINE' : 'OFFLINE'}
                        color={d.status === 'online' ? '#37C2B8' : '#66727A'}
                      />
                    </td>
                    <td className="os-td-mono">{d.traccarDeviceId || '—'}</td>
                    <td className="os-td-actions">
                      <button className="os-icon-btn" title="Edit" onClick={() => startEdit(d)}>
                        <PencilIcon />
                      </button>
                      <button className="os-icon-btn os-icon-btn--danger" title="Delete"
                        onClick={() => setConfirmId(confirmId === d.id ? null : d.id)}>
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                  {confirmId === d.id && (
                    <tr key={`${d.id}-confirm`} className="os-confirm-row">
                      <td colSpan={9}>
                        <div className="os-confirm-bar">
                          <span>Delete "{d.name}"? This also removes it from Traccar.</span>
                          <div className="os-confirm-bar__actions">
                            <button className="os-icon-btn" onClick={() => setConfirmId(null)}>Cancel</button>
                            <button className="os-icon-btn os-icon-btn--danger" onClick={() => handleDelete(d)}>Delete</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
        </>
        )
      })()}
    </div>
  )
}

/* ── principals ───────────────────────────────────────────────── */
function PrincipalsSection({ principals }) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const filtered = q
    ? principals.filter(p => p.name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q) || p.role?.toLowerCase().includes(q) || p.accountName?.toLowerCase().includes(q))
    : principals

  return (
    <div className="os-section">
      <div className="os-section__header">
        <div>
          <span className="os-section__title">Principals</span>
          <span className="os-section__meta">{principals.length} principal{principals.length !== 1 ? 's' : ''} across all accounts</span>
        </div>
      </div>
      <div className="os-search-wrap">
        <SearchIcon />
        <input className="os-search" placeholder="Search by name, email, role or account…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {principals.length === 0 ? (
        <div className="os-empty">No principals yet — add them from the Accounts page.</div>
      ) : (
        <div className="os-table-wrap">
          <table className="os-table">
            <thead>
              <tr>
                <th>NAME</th>
                <th>ACCOUNT</th>
                <th>ROLE</th>
                <th>EMAIL</th>
                <th>PHONE</th>
                <th>STATUS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={7} className="os-td-empty">No matches.</td></tr>
                : filtered.map(p => {
                    const sc = STATUS_META[p.status] ?? STATUS_META.offline
                    return (
                      <tr key={p.id}>
                        <td>
                          <div className="os-member-cell">
                            <Avatar name={p.name} role={p.role} />
                            <span className="os-member-name">{p.name}</span>
                          </div>
                        </td>
                        <td className="os-td-sub-only">{p.accountName}</td>
                        <td>{p.role || '—'}</td>
                        <td className="os-td-mono os-td-email">{p.email || '—'}</td>
                        <td className="os-td-mono">{p.phone || '—'}</td>
                        <td><Chip label={sc.label} color={sc.color} dot /></td>
                        <td>
                          <button className="os-row-manage-btn" onClick={() => navigate(`/admin/unit/principal/${p.id}`)}>View</button>
                        </td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ── vehicles ─────────────────────────────────────────────────── */
function VehiclesSection({ vehicles }) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const filtered = q
    ? vehicles.filter(v => v.name?.toLowerCase().includes(q) || v.accountName?.toLowerCase().includes(q) || v.make?.toLowerCase().includes(q) || v.model?.toLowerCase().includes(q) || v.plate?.toLowerCase().includes(q))
    : vehicles

  return (
    <div className="os-section">
      <div className="os-section__header">
        <div>
          <span className="os-section__title">Vehicles</span>
          <span className="os-section__meta">{vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} across all accounts</span>
        </div>
      </div>
      <div className="os-search-wrap">
        <SearchIcon />
        <input className="os-search" placeholder="Search by callsign, account, make, model or plate…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {vehicles.length === 0 ? (
        <div className="os-empty">No vehicles yet — add them from the Accounts page.</div>
      ) : (
        <div className="os-table-wrap">
          <table className="os-table">
            <thead>
              <tr>
                <th>CALLSIGN</th>
                <th>ACCOUNT</th>
                <th>MAKE / MODEL</th>
                <th>PLATE</th>
                <th>ARMOR</th>
                <th>STATUS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={7} className="os-td-empty">No matches.</td></tr>
                : filtered.map(v => {
                    const sc = STATUS_META[v.status] ?? STATUS_META.offline
                    const armorColor = v.armorLevel?.startsWith('B6') ? '#37C2B8' : v.armorLevel?.startsWith('B4') ? '#5AA9C2' : '#66727A'
                    return (
                      <tr key={v.id}>
                        <td className="os-member-name">{v.name}</td>
                        <td className="os-td-sub-only">{v.accountName}</td>
                        <td>{[v.make, v.model].filter(Boolean).join(' ') || '—'}</td>
                        <td className="os-td-mono">{v.plate || '—'}</td>
                        <td><span style={{ color: armorColor, fontSize: 12 }}>{v.armorLevel || '—'}</span></td>
                        <td><Chip label={sc.label} color={sc.color} dot /></td>
                        <td>
                          <button className="os-row-manage-btn" onClick={() => navigate(`/admin/unit/vehicle/${v.id}`)}>View</button>
                        </td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ── roles & access ───────────────────────────────────────────── */
function RolesSection({ roles, loading, onDelete }) {
  const navigate = useNavigate()
  const [confirmId, setConfirmId] = useState(null)
  const [deleting,  setDeleting]  = useState(null)

  async function handleDelete(id) {
    setDeleting(id)
    await onDelete(id)
    setDeleting(null)
    setConfirmId(null)
  }

  if (loading) return <div className="os-section"><span className="os-section__meta">Loading…</span></div>

  return (
    <div className="os-section">
      <div className="os-section__header">
        <div>
          <span className="os-section__title">Roles & access</span>
          <span className="os-section__meta">
            {roles.length} role{roles.length !== 1 ? 's' : ''} · menu-level permissions
          </span>
        </div>
        <button className="os-action-btn" onClick={() => navigate('/admin/settings/roles/new')}>
          + Custom role
        </button>
      </div>
      <div className="os-roles">
        {roles.map(role => (
          <RoleCard
            key={role.id}
            role={role}
            onEdit={() => navigate(`/admin/settings/roles/${role.id}`)}
            onDelete={() => setConfirmId(role.id)}
            confirmDelete={confirmId === role.id}
            onCancelDelete={() => setConfirmId(null)}
            onConfirmDelete={() => handleDelete(role.id)}
            deleting={deleting === role.id}
          />
        ))}
      </div>
    </div>
  )
}

function RoleCard({ role, onEdit, onDelete, confirmDelete, onCancelDelete, onConfirmDelete, deleting }) {
  const permLabels = role.permissions.map(key => {
    const found = ALL_PERMISSIONS.find(p => p.key === key)
    return found ? found.label : key
  })
  return (
    <div className="os-role-card">
      <div className="os-role-card__header">
        <span className="os-role-card__dot" style={{ background: role.color }} />
        <span className="os-role-card__name" style={{ color: role.color }}>{role.name}</span>
        {role.isSystem && <span className="os-role-system-badge">SYSTEM</span>}
        <div className="os-role-card__actions">
          <button className="os-role-card__edit-btn" onClick={onEdit}>Edit →</button>
          {!role.isSystem && (
            <button className="os-icon-btn os-icon-btn--danger" onClick={onDelete} title="Delete role">
              <TrashIcon />
            </button>
          )}
        </div>
      </div>
      {role.description && <p className="os-role-card__desc">{role.description}</p>}
      <div className="os-role-card__perms">
        {permLabels.map(l => <span key={l} className="os-perm-pill">{l}</span>)}
        {permLabels.length === 0 && <span className="os-perm-pill os-perm-pill--empty">No permissions</span>}
      </div>
      {confirmDelete && (
        <div className="os-confirm-bar" style={{ marginTop: 10 }}>
          <span>Delete "{role.name}"? Members will lose this role.</span>
          <div className="os-confirm-bar__actions">
            <button className="os-icon-btn" onClick={onCancelDelete}>Cancel</button>
            <button className="os-icon-btn os-icon-btn--danger" onClick={onConfirmDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function RoleCreateView({ onCreate }) {
  const navigate = useNavigate()
  const [name,        setName]  = useState('')
  const [desc,        setDesc]  = useState('')
  const [permissions, setPerms] = useState(new Set())
  const [saving,      setSaving] = useState(false)

  const canCreate = name.trim().length > 0

  function togglePerm(key) {
    setPerms(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function handleCreate() {
    if (!canCreate || saving) return
    setSaving(true)
    await onCreate({ name: name.trim(), description: desc.trim() || null, permissions: Array.from(permissions) })
    setSaving(false)
  }

  return (
    <div className="os-section">
      <div className="re-header">
        <button className="re-back" onClick={() => navigate('/admin/settings/roles')}>← ROLES</button>
        <div className="re-header__title">
          <span className="re-header__name" style={{ color: name ? 'var(--adm-text)' : 'var(--adm-text-dim)' }}>
            {name || 'New role'}
          </span>
        </div>
        <button className="re-save" onClick={handleCreate} disabled={!canCreate || saving}>
          {saving ? 'Creating…' : 'Create role'}
        </button>
      </div>

      <div className="re-block">
        <span className="re-block__label">ROLE DETAILS</span>
        <div className="re-fields">
          <div className="re-field-group">
            <label className="re-field-label">Name <span className="re-required">*</span></label>
            <input className="re-field-input" placeholder="e.g. Supervisor" value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
          <div className="re-field-group">
            <label className="re-field-label">Description</label>
            <input className="re-field-input" placeholder="What this role can do…" value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="re-block">
        <span className="re-block__label">MENU ACCESS</span>
        <div className="re-perm-grid">
          {ALL_PERMISSIONS.map(p => {
            const active = permissions.has(p.key)
            return (
              <button key={p.key} className={`re-perm-toggle${active ? ' active' : ''}`} onClick={() => togglePerm(p.key)}>
                <span className="re-perm-toggle__check">{active && <CheckIcon />}</span>
                <div>
                  <span className="re-perm-toggle__name">{p.label}</span>
                  <span className="re-perm-toggle__desc">{p.desc}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function RoleEditView({ roles, onSave, dbUsers, onUpdateUser }) {
  const { roleId } = useParams()
  const navigate   = useNavigate()
  const role       = roles.find(r => r.id === roleId)

  const [tab,         setTab]    = useState('info')
  const [name,        setName]   = useState(role?.name ?? '')
  const [desc,        setDesc]   = useState(role?.description ?? '')
  const [permissions, setPerms]  = useState(new Set(role?.permissions ?? []))
  const [saving,      setSaving] = useState(false)
  const [showPicker,  setPicker] = useState(false)
  const [assigning,   setAssigning] = useState(null)
  const [removing,    setRemoving]  = useState(null)

  const roleMembers    = (dbUsers ?? []).filter(u => u.roleId === roleId)
  const availableUsers = (dbUsers ?? []).filter(u => u.roleId !== roleId && u.type === 'internal')
  const operatorRole   = roles.find(r => r.name === 'Operator')

  if (!role) {
    return (
      <div className="os-section">
        <div className="re-header">
          <button className="re-back" onClick={() => navigate('/admin/settings/roles')}>← ROLES</button>
        </div>
        <span style={{ fontFamily: 'var(--adm-mono)', fontSize: 12, color: 'var(--adm-text-dim)' }}>
          Role not found.
        </span>
      </div>
    )
  }

  function togglePerm(key) {
    setPerms(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    await onSave(role.id, {
      ...(!role.isSystem && { name: name.trim() }),
      description: desc.trim() || null,
      permissions: Array.from(permissions),
    })
    setSaving(false)
  }

  async function handleAssign(userId) {
    setAssigning(userId)
    const res = await apiFetch(apiUrl(`/api/users/${userId}`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId }),
    })
    if (res.ok) onUpdateUser(await res.json())
    setAssigning(null)
    setPicker(false)
  }

  async function handleRemove(userId) {
    setRemoving(userId)
    const res = await apiFetch(apiUrl(`/api/users/${userId}`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId: operatorRole?.id ?? null }),
    })
    if (res.ok) onUpdateUser(await res.json())
    setRemoving(null)
  }

  return (
    <div className="os-section">
      {/* ── header ── */}
      <div className="re-header">
        <button className="re-back" onClick={() => navigate('/admin/settings/roles')}>← ROLES</button>
        <div className="re-header__title">
          <span className="re-header__dot" style={{ background: role.color }} />
          <span className="re-header__name" style={{ color: role.color }}>{name}</span>
          {role.isSystem && <span className="os-role-system-badge">SYSTEM</span>}
        </div>
        {tab === 'info' && (
          <button className="re-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        )}
      </div>

      {/* ── tabs ── */}
      <div className="re-tabs">
        <button className={`re-tab${tab === 'info' ? ' active' : ''}`} onClick={() => setTab('info')}>
          Information
        </button>
        <button className={`re-tab${tab === 'members' ? ' active' : ''}`} onClick={() => setTab('members')}>
          Members
          <span className={`re-tab__count${tab === 'members' ? ' active' : ''}`}>{roleMembers.length}</span>
        </button>
      </div>

      {/* ── information tab ── */}
      {tab === 'info' && (
        <>
          <div className="re-block">
            <span className="re-block__label">ROLE DETAILS</span>
            <div className="re-fields">
              <div className="re-field-group">
                <label className="re-field-label">Name</label>
                <input className="re-field-input" value={name} onChange={e => setName(e.target.value)} disabled={role.isSystem} />
              </div>
              <div className="re-field-group">
                <label className="re-field-label">Description</label>
                <input className="re-field-input" value={desc} onChange={e => setDesc(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="re-block">
            <span className="re-block__label">MENU ACCESS</span>
            <div className="re-perm-grid">
              {ALL_PERMISSIONS.map(p => {
                const active = permissions.has(p.key)
                return (
                  <button key={p.key} className={`re-perm-toggle${active ? ' active' : ''}`} onClick={() => togglePerm(p.key)}>
                    <span className="re-perm-toggle__check">{active && <CheckIcon />}</span>
                    <div>
                      <span className="re-perm-toggle__name">{p.label}</span>
                      <span className="re-perm-toggle__desc">{p.desc}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* ── members tab ── */}
      {tab === 'members' && (
        <div className="re-block">
          <div className="re-block__header">
            <span className="re-block__label">ASSIGNED MEMBERS</span>
            <div className="re-picker-wrap">
              <button
                className="os-action-btn"
                onClick={() => setPicker(v => !v)}
                disabled={availableUsers.length === 0}
              >
                + Assign member
              </button>
              {showPicker && (
                <>
                  <div className="re-picker-backdrop" onClick={() => setPicker(false)} />
                  <div className="re-picker">
                    {availableUsers.map(m => {
                      const currentRole = roles.find(r => r.id === m.roleId)
                      return (
                        <button
                          key={m.id}
                          className="re-picker__item"
                          onClick={() => handleAssign(m.id)}
                          disabled={assigning === m.id}
                        >
                          <Avatar name={m.name} role={m.role} />
                          <div>
                            <span className="re-picker__name">{m.name}</span>
                            <span className="re-picker__role">Currently: {currentRole?.name ?? m.role}</span>
                          </div>
                          {assigning === m.id && <span className="re-picker__assigning">…</span>}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {roleMembers.length === 0 ? (
            <span className="re-members-empty">No members assigned to this role yet.</span>
          ) : (
            <div className="re-members">
              {roleMembers.map(m => {
                const statusMeta = MEMBER_STATUS_META[m.status] ?? MEMBER_STATUS_META.offline
                return (
                  <div key={m.id} className="re-member-row">
                    <Avatar name={m.name} role={m.role} />
                    <div className="re-member-info">
                      <span className="re-member-name">{m.name}</span>
                      <span className="re-member-email">{m.email}</span>
                    </div>
                    <Chip label={statusMeta.label} color={statusMeta.color} dot />
                    <button
                      className="re-remove-btn"
                      onClick={() => handleRemove(m.id)}
                      disabled={removing === m.id}
                    >
                      {removing === m.id ? '…' : 'Remove'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── member edit ──────────────────────────────────────────────── */
function MemberEditView({ members, loading, roles, onSave }) {
  const { memberId } = useParams()
  const navigate     = useNavigate()
  const { accounts } = useAccounts()
  const { user }     = useAuth()
  const member       = members.find(m => m.id === memberId)

  const [name,        setName]        = useState(member?.name ?? '')
  const [email,       setEmail]       = useState(member?.email ?? '')
  const [phone,       setPhone]       = useState(member?.phone ?? '')
  const [roleId,      setRoleId]      = useState(member?.roleId ?? null)
  const [jobTitle,    setJobTitle]    = useState(member?.jobTitle ?? '')
  const [department,  setDepartment]  = useState(member?.department ?? '')
  const [employeeId,  setEmployeeId]  = useState(member?.employeeId ?? '')
  const [twoFactor,   setTwoFactor]   = useState(member?.twoFactor ?? false)
  const [dbAssignments,      setDbAssignments]      = useState([])
  const [assignmentsLoading, setAssignmentsLoading] = useState(false)
  const [panelMode,          setPanelMode]          = useState(null) // null | 'add' | accountId
  const [memberLogs,         setMemberLogs]         = useState([])
  const [logsLoading,   setLogsLoading]   = useState(false)

  useEffect(() => {
    if (!memberId) return
    setLogsLoading(true)
    apiFetch(apiUrl(`/api/users/${memberId}/logs`))
      .then(r => r.json())
      .then(data => { setMemberLogs(Array.isArray(data) ? data : []); setLogsLoading(false) })
      .catch(() => setLogsLoading(false))
  }, [memberId])

  useEffect(() => {
    if (!memberId) return
    setAssignmentsLoading(true)
    apiFetch(apiUrl(`/api/users/${memberId}/assignments`))
      .then(r => r.json())
      .then(data => setDbAssignments(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setAssignmentsLoading(false))
  }, [memberId])

  async function handleAddAssignment(grants) {
    const results = await Promise.all(
      grants.map(async ({ accountId, scopeType, scopeId }) => {
        const res = await apiFetch(apiUrl(`/api/users/${memberId}/assignments`), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId, scopeType, scopeId }),
        })
        if (!res.ok) return null
        return res.json()
      })
    )
    const added = results.filter(Boolean)
    if (added.length > 0) setDbAssignments(p => [...p, ...added])
  }

  async function handleRemoveAssignments(ids) {
    await Promise.all(ids.map(id =>
      apiFetch(apiUrl(`/api/users/${memberId}/assignments/${id}`), { method: 'DELETE' })
    ))
    setDbAssignments(p => p.filter(a => !ids.includes(a.id)))
  }

  if (loading) {
    return <div style={{ padding: 28, fontFamily: 'var(--adm-mono)', fontSize: 12, color: 'var(--adm-text-dim)' }}>Loading…</div>
  }

  if (!member) {
    return (
      <div className="os-section">
        <div className="re-header">
          <button className="re-back" onClick={() => navigate('/admin/settings/members')}>← MEMBERS</button>
        </div>
        <span style={{ fontFamily: 'var(--adm-mono)', fontSize: 12, color: 'var(--adm-text-dim)' }}>
          Member not found.
        </span>
      </div>
    )
  }

  const canSave = name.trim().length > 0 && email.trim().includes('@')

  async function handleSave() {
    if (!canSave) return
    const res = await apiFetch(apiUrl(`/api/users/${member.id}`), {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        name:       name.trim(),
        email:      email.trim(),
        phone:      phone.trim(),
        roleId,
        twoFactor,
        actorSub:   user?.sub,
        ...(member.type === 'internal' && {
          jobTitle:   jobTitle.trim(),
          department: department.trim(),
          employeeId: employeeId.trim(),
        }),
      }),
    })
    if (!res.ok) return
    const updated = await res.json()
    onSave(updated)
  }

  const selectedRole = roles.find(r => r.id === roleId)
  const isAdmin      = selectedRole?.name === 'Admin'

  return (
    <>
    <div className="me-page">
      {/* ── page header ── */}
      <div className="me-page-header">
        <button className="re-back" onClick={() => navigate('/admin/settings/members')}>← MEMBERS</button>
        <div className="me-page-header__identity">
          <Avatar name={name || member.name} role={selectedRole?.name} size="lg" />
          <div className="me-page-header__info">
            <span className="me-page-header__name">{name || member.name}</span>
            <div className="me-page-header__chips">
              <Chip label={member.type === 'external' ? 'EXTERNAL' : 'INTERNAL'} color={member.type === 'external' ? '#7B8FBD' : '#37C2B8'} />
              <Chip label={(selectedRole?.name ?? '—').toUpperCase()} color={selectedRole?.color ?? '#66727A'} />
            </div>
          </div>
        </div>
        <button className="re-save" onClick={handleSave} disabled={!canSave}>Save changes</button>
      </div>

      <div className="me-sections">

        {/* ── 1. Contact Information ── */}
        <div className="me-card">
          <div className="me-card__head">
            <span className="me-card__title">Contact Information</span>
          </div>
          <div className="me-card__body">
            <div className="re-fields-row">
              <div className="re-field-group">
                <label className="re-field-label">Full name <span className="re-required">*</span></label>
                <input className="re-field-input" value={name} onChange={e => setName(e.target.value)} autoFocus />
              </div>
              <div className="re-field-group">
                <label className="re-field-label">Email address <span className="re-required">*</span></label>
                <input className="re-field-input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="re-field-group" style={{ maxWidth: '50%', paddingRight: 6 }}>
              <label className="re-field-label">Phone</label>
              <input className="re-field-input re-field-input--mono" placeholder="+1 000 000 0000" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
          </div>
        </div>

        {/* ── 2. Employee Information (internal only) ── */}
        {member.type === 'internal' && (
          <div className="me-card">
            <div className="me-card__head">
              <span className="me-card__title">Employee Information</span>
            </div>
            <div className="me-card__body">
              <div className="re-fields-row">
                <div className="re-field-group">
                  <label className="re-field-label">Job title</label>
                  <input className="re-field-input" placeholder="e.g. Operations Manager" value={jobTitle} onChange={e => setJobTitle(e.target.value)} />
                </div>
                <div className="re-field-group">
                  <label className="re-field-label">Department</label>
                  <input className="re-field-input" placeholder="e.g. Command" value={department} onChange={e => setDepartment(e.target.value)} />
                </div>
              </div>
              <div className="re-fields-row">
                <div className="re-field-group">
                  <label className="re-field-label">Employee ID</label>
                  <input className="re-field-input re-field-input--mono" placeholder="e.g. EMP-001" value={employeeId} onChange={e => setEmployeeId(e.target.value)} />
                </div>
                <div className="re-field-group">
                  <label className="re-field-label">Role</label>
                  {roles.length === 0
                    ? <span className="me-owner-note">Loading roles…</span>
                    : <PillGroup
                        options={roles.map(r => r.name)}
                        value={selectedRole?.name ?? ''}
                        onChange={name => setRoleId(roles.find(r => r.name === name)?.id ?? null)}
                      />
                  }
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 3. Account Security ── */}
        <div className="me-card">
          <div className="me-card__head">
            <span className="me-card__title">Account Security</span>
          </div>
          <div className="me-card__body">
            <div className="re-field-group">
              <label className="re-field-label">Two-factor authentication</label>
              <PillGroup
                options={['Enabled', 'Disabled']}
                value={twoFactor ? 'Enabled' : 'Disabled'}
                onChange={v => setTwoFactor(v === 'Enabled')}
              />
            </div>
          </div>
        </div>

        {/* ── 4. Access Management ── */}
        <div className="me-card">
          <div className="me-card__head">
            <div>
              <span className="me-card__title">Access Management</span>
              <span className="me-card__sub">Grant access at account, group, or unit level</span>
            </div>
            <button className="os-action-btn" onClick={() => setPanelMode('add')}>
              + Add Assignment
            </button>
          </div>
          <div className="me-card__body">
            {assignmentsLoading ? (
              <span className="re-members-empty">Loading…</span>
            ) : dbAssignments.length === 0 ? (
              <span className="re-members-empty">No access grants yet — click "Add Assignment" to grant access.</span>
            ) : (() => {
              const groupMap = new Map()
              for (const a of dbAssignments) {
                const accId = a.accountId
                if (!accId) continue
                if (!groupMap.has(accId)) groupMap.set(accId, [])
                groupMap.get(accId).push(a)
              }
              return (
                <div className="me-acc-grant-list">
                  {[...groupMap.entries()].map(([accId, grants]) => (
                    <AccountGrantRow
                      key={accId}
                      accId={accId}
                      grants={grants}
                      accounts={accounts}
                      onClick={() => setPanelMode(accId)}
                    />
                  ))}
                </div>
              )
            })()}
          </div>
        </div>

        {/* ── 4. Activity ── */}
        <div className="me-card">
          <div className="me-card__head">
            <span className="me-card__title">Activity</span>
            {!logsLoading && <span className="me-card__count">{memberLogs.length} events</span>}
          </div>
          <div className="me-card__body">
            {logsLoading ? (
              <span className="re-members-empty">Loading…</span>
            ) : memberLogs.length === 0 ? (
              <span className="re-members-empty">No activity recorded yet.</span>
            ) : (
              <div className="me-activity-list">
                {memberLogs.map(ev => {
                  const meta = LOG_EVENT_META[ev.event] ?? { label: ev.event, color: '#66727A' }
                  return (
                    <div key={ev.id} className="me-activity-row">
                      <span className="me-activity-dot" style={{ background: meta.color }} />
                      <span className="me-activity-time">{humanizeTime(ev.createdAt)}</span>
                      <span className="me-activity-type" style={{ color: meta.color }}>{meta.label}</span>
                      <span className="me-activity-desc">{ev.description}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>

    {panelMode && (
      <AssignmentPanel
        accounts={accounts}
        dbAssignments={dbAssignments}
        editAccountId={panelMode === 'add' ? null : panelMode}
        onAdd={handleAddAssignment}
        onRemove={handleRemoveAssignments}
        onClose={() => setPanelMode(null)}
      />
    )}
    </>
  )
}


function accInitials(name) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

const ACC_AVATAR_COLORS = ['#193A2E', '#192B3A', '#1A1D3A', '#2C1A2E', '#3A2C19']
function accAvatarColor(id) {
  const hash = id.split('').reduce((h, c) => h + c.charCodeAt(0), 0)
  return ACC_AVATAR_COLORS[hash % ACC_AVATAR_COLORS.length]
}

/* ── AccountGrantRow ──────────────────────────────────────────── */
function AccountGrantRow({ accId, grants, accounts, onClick }) {
  const account = accounts.find(a => a.id === accId)
  if (!account) return null

  const assignedIds   = new Set(grants.map(a => a.scopeId))
  const totalUnits    = account.units.length
  const hasFullAccess = totalUnits > 0 && account.units.every(u => assignedIds.has(u.id))
  const unitCount     = grants.length

  let summary
  if (hasFullAccess) {
    summary = 'Full account access'
  } else {
    const pCount = grants.filter(a => a.scopeType === 'principal').length
    const vCount = grants.filter(a => a.scopeType === 'vehicle').length
    const parts  = []
    if (pCount > 0) parts.push(`${pCount} ${pCount === 1 ? 'person' : 'people'}`)
    if (vCount > 0) parts.push(`${vCount} vehicle${vCount !== 1 ? 's' : ''}`)
    summary = parts.join(' · ') || '—'
  }

  return (
    <button className="me-acc-grant-row" onClick={onClick}>
      <div className="me-acc-grant-info">
        <span className="me-acc-grant-name">{account.name}</span>
        <span className="me-acc-grant-summary">{summary}</span>
      </div>
      <span className="me-acc-grant-chevron">›</span>
    </button>
  )
}

/* ── AssignmentPanel ──────────────────────────────────────────── */
const UNIT_STATUS_COLOR = { normal: '#37C2B8', warning: '#E0A63C', duress: '#F2495B', offline: '#66727A' }

function AssignmentPanel({ accounts, dbAssignments, editAccountId, onAdd, onRemove, onClose }) {
  const editAccount = editAccountId ? accounts.find(a => a.id === editAccountId) ?? null : null
  const editMode    = !!editAccount

  // Compute initial state once on mount (panel is always freshly mounted)
  const initialCheckedIds = useMemo(() => {
    if (!editAccount) return new Set()
    return new Set(dbAssignments.filter(a => a.accountId === editAccountId).map(a => a.scopeId))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const initialFullAccount = useMemo(() => {
    if (!editAccount) return false
    const assigned = dbAssignments.filter(a => a.accountId === editAccountId).map(a => a.scopeId)
    return editAccount.units.length > 0 && editAccount.units.every(u => assigned.includes(u.id))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [step,            setStep]            = useState(editMode ? 'resources' : 'account')
  const [selectedAccount, setSelectedAccount] = useState(editAccount)
  const [checkedIds,      setCheckedIds]      = useState(initialCheckedIds)
  const [fullAccount,     setFullAccount]     = useState(initialFullAccount)
  const [search,          setSearch]          = useState('')

  // In add mode, mark units from OTHER accounts as already assigned (grey them out).
  // Units in the current account are interactive (checked or unchecked).
  // In edit mode, all units are interactive.
  const assignedUnitIds = useMemo(() => {
    if (editMode || !selectedAccount) return new Set()
    return new Set(
      dbAssignments
        .filter(a => a.accountId !== selectedAccount.id)
        .map(a => a.scopeId)
    )
  }, [dbAssignments, editMode, selectedAccount])

  function goToAccount(acc) {
    setSelectedAccount(acc)
    setCheckedIds(new Set())
    setFullAccount(false)
    setSearch('')
    setStep('resources')
  }

  function goBack() {
    setStep('account')
    setSelectedAccount(null)
    setCheckedIds(new Set())
    setFullAccount(false)
    setSearch('')
  }

  function toggleFullAccount() {
    const newFull = !fullAccount
    setFullAccount(newFull)
    if (newFull && selectedAccount) {
      setCheckedIds(new Set(selectedAccount.units.map(u => u.id)))
    } else {
      setCheckedIds(new Set())
    }
  }

  function toggleUnit(unitId) {
    setFullAccount(false)
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (next.has(unitId)) next.delete(unitId); else next.add(unitId)
      return next
    })
  }

  function toggleGroup(group) {
    setFullAccount(false)
    const assignable = group.unitIds.filter(id => !assignedUnitIds.has(id))
    const allChecked = assignable.length > 0 && assignable.every(id => checkedIds.has(id))
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (allChecked) assignable.forEach(id => next.delete(id))
      else            assignable.forEach(id => next.add(id))
      return next
    })
  }

  function buildGrants(ids) {
    const grants = []
    for (const id of ids) {
      const unit = selectedAccount.units.find(u => u.id === id)
      if (!unit) continue
      grants.push({ accountId: selectedAccount.id, scopeType: unit.type === 'person' ? 'principal' : 'vehicle', scopeId: id })
    }
    return grants
  }

  async function handleAdd() {
    if (!selectedAccount || checkedIds.size === 0) return
    await onAdd(buildGrants(checkedIds))
    onClose()
  }

  async function handleSave() {
    if (!selectedAccount) return
    const toAdd       = []
    const toRemoveIds = []

    // Units newly checked
    for (const id of checkedIds) {
      if (!initialCheckedIds.has(id)) toAdd.push(...buildGrants([id]))
    }
    // Units unchecked
    for (const a of dbAssignments) {
      if (a.accountId === selectedAccount.id && !checkedIds.has(a.scopeId)) {
        toRemoveIds.push(a.id)
      }
    }

    if (toAdd.length       > 0) await onAdd(toAdd)
    if (toRemoveIds.length > 0) await onRemove(toRemoveIds)
    onClose()
  }

  const assignedAccountIds = useMemo(
    () => new Set(dbAssignments.map(a => a.accountId)),
    [dbAssignments]
  )

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return accounts
      .filter(a => !assignedAccountIds.has(a.id))
      .filter(a => !q || a.name.toLowerCase().includes(q) || a.type.toLowerCase().includes(q))
  }, [accounts, search, assignedAccountIds])

  const filteredResources = useMemo(() => {
    if (!selectedAccount) return { groups: [], people: [], vehicles: [] }
    const q = search.trim().toLowerCase()
    return {
      groups:   q ? selectedAccount.groups.filter(g => g.name.toLowerCase().includes(q)) : selectedAccount.groups,
      people:   selectedAccount.units.filter(u => u.type === 'person'  && (!q || u.name.toLowerCase().includes(q))),
      vehicles: selectedAccount.units.filter(u => u.type === 'vehicle' && (!q || u.name.toLowerCase().includes(q))),
    }
  }, [selectedAccount, search])

  return (
    <>
      <div className="ap-backdrop" onClick={onClose} />
      <div className="ap-panel">
        <div className="ap-header">
          {step === 'resources' && !editMode && (
            <button className="ap-back" onClick={goBack}>←</button>
          )}
          <div className="ap-header__title">
            <span className="ap-title">
              {step === 'account' ? 'Add Assignment' : selectedAccount.name}
            </span>
            <span className="ap-subtitle">
              {step === 'account' ? 'Select an account' : editMode ? 'Edit access for this account' : 'Select groups or units to assign'}
            </span>
          </div>
          <button className="ap-close" onClick={onClose}>×</button>
        </div>

        <div className="ap-search-wrap">
          <ApSearchIcon />
          <input
            autoFocus
            className="ap-search"
            placeholder={step === 'account' ? 'Search accounts…' : 'Search groups and units…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="ap-list">
          {step === 'account' ? (
            filteredAccounts.length === 0 ? (
              <div className="ap-empty">
                {search ? 'No accounts match your search' : 'All accounts already have access grants'}
              </div>
            ) : filteredAccounts.map(acc => {
              const p = acc.units.filter(u => u.type === 'person').length
              const v = acc.units.filter(u => u.type === 'vehicle').length
              return (
                <button key={acc.id} className="ap-item ap-item--account" onClick={() => goToAccount(acc)}>
                  <div className="ap-item__info">
                    <span className="ap-item__primary">{acc.name}</span>
                    <div className="ap-item__meta-row">
                      <span className="ap-item__secondary">{acc.type}</span>
                      <span className="ap-item__tertiary">{p}p · {v}v · {acc.groups.length}g</span>
                    </div>
                  </div>
                  <span className="ap-item__chevron">›</span>
                </button>
              )
            })
          ) : (
            <>
              {(() => {
                const assignedInAcc  = new Set(dbAssignments.filter(a => a.accountId === selectedAccount.id).map(a => a.scopeId))
                const alreadyAccount = !editMode && selectedAccount.units.length > 0 && selectedAccount.units.every(u => assignedInAcc.has(u.id))
                return (
                  <button
                    className={`ap-item ap-item--full-account${fullAccount ? ' ap-item--checked' : ''}${alreadyAccount ? ' ap-item--assigned' : ''}`}
                    onClick={() => !alreadyAccount && toggleFullAccount()}
                    disabled={alreadyAccount}
                  >
                    {!alreadyAccount && <span className={`ap-check${fullAccount ? ' checked' : ''}`} />}
                    <div className="ap-item__info">
                      <span className="ap-item__primary">Full Account Access</span>
                      <span className="ap-item__secondary">
                        {alreadyAccount ? 'Already assigned' : `All resources · ${selectedAccount.units.length} units · ${selectedAccount.groups.length} groups`}
                      </span>
                    </div>
                  </button>
                )
              })()}

              {filteredResources.groups.length > 0 && (
                <>
                  <div className="ap-section-label">GROUPS</div>
                  {filteredResources.groups.map(group => {
                    const assignable = group.unitIds.filter(id => !assignedUnitIds.has(id))
                    const allChecked = assignable.length > 0 && assignable.every(id => checkedIds.has(id))
                    const someChecked = !allChecked && assignable.some(id => checkedIds.has(id))
                    return (
                      <button
                        key={group.id}
                        className={`ap-item ap-item--group${allChecked ? ' ap-item--checked' : someChecked ? ' ap-item--partial' : ''}`}
                        onClick={() => toggleGroup(group)}
                        disabled={assignable.length === 0}
                      >
                        <span className={`ap-check${allChecked ? ' checked' : someChecked ? ' partial' : ''}`} />
                        <div className="ap-item__info">
                          <span className="ap-item__primary">{group.name}</span>
                          <span className="ap-item__secondary">{group.unitIds.length} unit{group.unitIds.length !== 1 ? 's' : ''}</span>
                        </div>
                      </button>
                    )
                  })}
                </>
              )}

              {filteredResources.people.length > 0 && (
                <>
                  <div className="ap-section-label">PEOPLE</div>
                  {filteredResources.people.map(unit => {
                    const already  = assignedUnitIds.has(unit.id)
                    const checked  = checkedIds.has(unit.id)
                    return (
                      <button
                        key={unit.id}
                        className={`ap-item${checked ? ' ap-item--checked' : ''}${already ? ' ap-item--assigned' : ''}`}
                        onClick={() => !already && toggleUnit(unit.id)}
                        disabled={already}
                      >
                        {!already && <span className={`ap-check${checked ? ' checked' : ''}`} />}
                        <div className="ap-item__info">
                          <span className="ap-item__primary">{unit.name}</span>
                          {already && <span className="ap-item__assigned-tag">Already assigned</span>}
                        </div>
                        <span className="ap-item__status" style={{ color: UNIT_STATUS_COLOR[unit.status] ?? '#66727A' }}>
                          {unit.status?.toUpperCase()}
                        </span>
                      </button>
                    )
                  })}
                </>
              )}

              {filteredResources.vehicles.length > 0 && (
                <>
                  <div className="ap-section-label">VEHICLES</div>
                  {filteredResources.vehicles.map(unit => {
                    const already  = assignedUnitIds.has(unit.id)
                    const checked  = checkedIds.has(unit.id)
                    return (
                      <button
                        key={unit.id}
                        className={`ap-item${checked ? ' ap-item--checked' : ''}${already ? ' ap-item--assigned' : ''}`}
                        onClick={() => !already && toggleUnit(unit.id)}
                        disabled={already}
                      >
                        {!already && <span className={`ap-check${checked ? ' checked' : ''}`} />}
                        <div className="ap-item__info">
                          <span className="ap-item__primary">{unit.name}</span>
                          {already && <span className="ap-item__assigned-tag">Already assigned</span>}
                        </div>
                        <span className="ap-item__status" style={{ color: UNIT_STATUS_COLOR[unit.status] ?? '#66727A' }}>
                          {unit.status?.toUpperCase()}
                        </span>
                      </button>
                    )
                  })}
                </>
              )}

              {filteredResources.groups.length === 0 && filteredResources.people.length === 0 && filteredResources.vehicles.length === 0 && (
                <div className="ap-empty">{search ? 'No matches' : 'No resources in this account'}</div>
              )}
            </>
          )}
        </div>

        {step === 'resources' && (editMode || checkedIds.size > 0 || fullAccount) && (
          <div className="ap-footer">
            <span className="ap-footer__count">
              {editMode ? `${checkedIds.size + (fullAccount ? 1 : 0)} selected` : fullAccount ? 'Full account access' : `${checkedIds.size} selected`}
            </span>
            <button className="ap-footer__done" onClick={editMode ? handleSave : handleAdd}>
              {editMode ? 'Save Changes' : fullAccount ? 'Add assignment' : `Add ${checkedIds.size} assignment${checkedIds.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function ApSearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M9 9L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}
const SearchIcon = ApSearchIcon

/* ── member invite ────────────────────────────────────────────── */
function MemberInviteView({ roles, onSave }) {
  const navigate    = useNavigate()
  const { user }    = useAuth()
  const [name,   setName]   = useState('')
  const [email,  setEmail]  = useState('')
  const [type,   setType]   = useState('internal')
  const defaultRole = roles.find(r => r.name === 'Operator') ?? roles[0] ?? null
  const [roleId, setRoleId] = useState(defaultRole?.id ?? null)
  const [busy,  setBusy]  = useState(false)
  const [error, setError] = useState('')

  const canInvite = name.trim().length > 0 && email.trim().includes('@')

  async function handleInvite() {
    if (!canInvite || busy) return
    setBusy(true)
    setError('')
    try {
      const res  = await apiFetch(apiUrl('/api/users'), {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:       name.trim(),
          email:      email.trim().toLowerCase(),
          type,
          roleId,
          inviterSub: user?.sub,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onSave({
        id:         data.id,
        name:       name.trim(),
        email:      email.trim().toLowerCase(),
        twoFactor:  false,
        status:     'offline',
        lastActive: 'Invited',
      })
      navigate('/admin/settings/members')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="os-section">
      <div className="re-header">
        <button className="re-back" onClick={() => navigate('/admin/settings/members')}>← MEMBERS</button>
        <div className="re-header__title">
          <span className="re-header__name" style={{ color: name ? 'var(--adm-text)' : 'var(--adm-text-dim)' }}>
            {name || 'Invite member'}
          </span>
        </div>
        <button className="re-save" onClick={handleInvite} disabled={!canInvite || busy}>
          {busy ? 'Sending…' : 'Send invite'}
        </button>
      </div>

      <div className="re-block">
        <span className="re-block__label">MEMBER DETAILS</span>
        <div className="re-fields">
          <div className="re-field-group">
            <label className="re-field-label">Full name <span className="re-required">*</span></label>
            <input className="re-field-input" placeholder="e.g. Jordan Reyes" value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
          <div className="re-field-group">
            <label className="re-field-label">Email address <span className="re-required">*</span></label>
            <input className="re-field-input" type="email" placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="re-field-group">
            <label className="re-field-label">Type</label>
            <PillGroup
              options={['internal', 'external']}
              value={type}
              onChange={setType}
            />
          </div>
          {type === 'internal' && roles.length > 0 && (
            <div className="re-field-group">
              <label className="re-field-label">Role</label>
              <PillGroup
                options={roles.map(r => r.name)}
                value={roles.find(r => r.id === roleId)?.name ?? ''}
                onChange={name => setRoleId(roles.find(r => r.name === name)?.id ?? null)}
              />
            </div>
          )}
        </div>
        {error && <p style={{ marginTop: 12, fontSize: 13, color: '#F2495B' }}>{error}</p>}
      </div>
    </div>
  )
}

/* ── shared helpers ───────────────────────────────────────────── */
function PillGroup({ options, value, onChange }) {
  return (
    <div className="re-pill-group">
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          className={`re-pill${value === opt ? ' active' : ''}`}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <path d="M9.5 1.5l2 2L4 11H2v-2L9.5 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <path d="M2 4h9M5 4V2.5h3V4M5.5 6v4M7.5 6v4M3 4l.7 7h5.6L10 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
      <path d="M1 4L3.5 6.5L9 1" stroke="#0A0E10" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function Chip({ label, color, dot }) {
  return (
    <span
      className="os-chip"
      style={{
        color,
        background: `${color}18`,
        borderColor: `${color}44`,
      }}
    >
      {dot && (
        <span
          className="os-chip__dot"
          style={{ background: color }}
        />
      )}
      {label}
    </span>
  )
}

const AVATAR_PALETTES = [
  { bg: 'rgba(55,194,184,0.12)', color: '#37C2B8' },
  { bg: 'rgba(90,169,194,0.12)', color: '#5AA9C2' },
  { bg: 'rgba(102,114,122,0.15)', color: '#7D8990' },
  { bg: 'rgba(224,166,60,0.12)',  color: '#E0A63C' },
]

function Avatar({ name, role, size }) {
  const parts = name.trim().split(' ')
  const initials = ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase()
  const palette = role === 'Admin' ? AVATAR_PALETTES[0] : AVATAR_PALETTES[2]
  return (
    <span
      className={`os-avatar${size === 'lg' ? ' os-avatar--lg' : ''}`}
      style={{ background: palette.bg, color: palette.color }}
    >
      {initials}
    </span>
  )
}
