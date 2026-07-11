import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import './OrgSettings.css'
import { mockMembers, mockDevices, mockVehicles, mockGeofences, mockRoles } from '../data/mockSettings'
import { useAccounts } from '../contexts/AccountsContext'
import { useAuth } from '../../auth/AuthContext'
import { humanizeTime } from '../../../shared/utils/time'

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
  Owner:     { color: '#37C2B8' },
  Admin:     { color: '#37C2B8' },
  Operator:  { color: '#66727A' },
  Agent:     { color: '#66727A' },
  'Read-only': { color: '#66727A' },
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

const EDIT_ROLES = ['Admin', 'Operator', 'Agent', 'Read-only']

const GEO_TYPE_META = {
  'SAFE ZONE': { color: '#37C2B8' },
  'CORRIDOR':  { color: '#5AA9C2' },
  'EXCLUSION': { color: '#E0A63C' },
  'WAYPOINT':  { color: '#66727A' },
}

const ALL_PERMISSIONS = [
  { label: 'Billing',          desc: 'Manage subscription, invoices, and seats' },
  { label: 'Members',          desc: 'Invite, edit, and remove org members' },
  { label: 'Devices',          desc: 'Provision and configure tracking devices' },
  { label: 'Geofences',        desc: 'Create, edit, and delete geofence zones' },
  { label: 'Live ops',         desc: 'View and interact with the live operations map' },
  { label: 'Live ops (view)',  desc: 'View-only access to the live map' },
  { label: 'Acknowledge',      desc: 'Acknowledge and close active alert events' },
  { label: 'Escalate',         desc: 'Escalate alerts to Tier-2 response' },
  { label: 'Export footage',   desc: 'Download and export recorded video clips' },
  { label: 'Own unit',         desc: 'View own unit telemetry and position only' },
  { label: 'Trigger duress',   desc: 'Activate the duress / panic alert' },
  { label: 'Reports',          desc: 'Access operational and audit reports' },
]

const SECTIONS = [
  { key: 'members',   label: 'Members',      countKey: 'members'   },
  { key: 'devices',   label: 'Devices',      countKey: 'devices'   },
  { key: 'vehicles',  label: 'Vehicles',     countKey: 'vehicles'  },
  { key: 'geofences', label: 'Geofences',    countKey: 'geofences' },
  { key: 'roles',     label: 'Roles & access', countKey: null      },
]

function sectionFromPath(pathname) {
  if (pathname.includes('/settings/devices'))   return 'devices'
  if (pathname.includes('/settings/vehicles'))  return 'vehicles'
  if (pathname.includes('/settings/geofences')) return 'geofences'
  if (pathname.includes('/settings/roles'))     return 'roles'
  return 'members'
}

export default function OrgSettings() {
  const [dbUsers,       setDbUsers]       = useState([])
  const [dbInvitations, setDbInvitations] = useState([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [roles,     setRoles]     = useState(mockRoles)
  const [devices,   setDevices]   = useState(mockDevices)
  const [vehicles,  setVehicles]  = useState(mockVehicles)
  const [geofences, setGeofences] = useState(mockGeofences)
  const location = useLocation()
  const navigate = useNavigate()
  const active   = sectionFromPath(location.pathname)

  useEffect(() => {
    Promise.all([
      fetch('/api/users').then(r => r.json()),
      fetch('/api/invitations').then(r => r.json()),
    ]).then(([u, i]) => {
      setDbUsers(Array.isArray(u) ? u : [])
      setDbInvitations(Array.isArray(i) ? i : [])
    }).catch(console.error)
      .finally(() => setMembersLoading(false))
  }, [])

  function handleUpdateMember(updated) {
    setDbUsers(prev => prev.map(m => m.id === updated.id ? updated : m))
    navigate('/admin/settings/members')
  }

  const counts = {
    members:   dbUsers.length,
    devices:   devices.length,
    vehicles:  vehicles.length,
    geofences: geofences.length,
  }

  function handleSaveRole(updated) {
    setRoles(prev => prev.map(r => r.id === updated.id ? updated : r))
    navigate('/admin/settings/roles')
  }
  function handleCreateRole(newRole) {
    setRoles(prev => [...prev, newRole])
    navigate('/admin/settings/roles')
  }
  function handleCreateDevice(newDevice) {
    setDevices(prev => [...prev, newDevice])
    navigate('/admin/settings/devices')
  }
  function handleCreateVehicle(newVehicle) {
    setVehicles(prev => [...prev, newVehicle])
    navigate('/admin/settings/vehicles')
  }
  function handleCreateGeofence(newGeofence) {
    setGeofences(prev => [...prev, newGeofence])
    navigate('/admin/settings/geofences')
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
          <Route path="members"             element={<MembersSection dbUsers={dbUsers} dbInvitations={dbInvitations} loading={membersLoading} onEdit={id => navigate(`/admin/settings/members/${id}`)} />} />
          <Route path="members/new"         element={<MemberInviteView onSave={() => navigate('/admin/settings/members')} />} />
          <Route path="members/:memberId"   element={<MemberEditView members={dbUsers} loading={membersLoading} onSave={handleUpdateMember} />} />
          <Route path="devices"          element={<DevicesSection devices={devices} />} />
          <Route path="devices/new"      element={<DeviceCreateView onSave={handleCreateDevice} />} />
          <Route path="vehicles"         element={<VehiclesSection vehicles={vehicles} />} />
          <Route path="vehicles/new"     element={<VehicleCreateView onSave={handleCreateVehicle} />} />
          <Route path="geofences"        element={<GeofencesSection geofences={geofences} />} />
          <Route path="geofences/new"    element={<GeofenceCreateView onSave={handleCreateGeofence} />} />
          <Route path="roles"            element={<RolesSection roles={roles} />} />
          <Route path="roles/new"        element={<RoleCreateView onSave={handleCreateRole} />} />
          <Route path="roles/:roleId"    element={<RoleEditView roles={roles} onSave={handleSaveRole} />} />
        </Routes>
      </div>
    </div>
  )
}

/* ── members ──────────────────────────────────────────────────── */
function MembersSection({ dbUsers, dbInvitations, loading, onEdit }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('users')

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
              {dbUsers.length === 0
                ? <tr><td colSpan={5} className="os-td-empty">No active users yet.</td></tr>
                : dbUsers.map(u => {
                    const statusMeta = MEMBER_STATUS_META[u.status] ?? MEMBER_STATUS_META.offline
                    const roleMeta   = ROLE_CHIP_META[u.role] ?? { color: '#66727A' }
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
                        <td><Chip label={u.role} color={roleMeta.color} /></td>
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
              </tr>
            </thead>
            <tbody>
              {dbInvitations.length === 0
                ? <tr><td colSpan={4} className="os-td-empty">No pending invitations.</td></tr>
                : dbInvitations.map(inv => (
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
                      <td><Chip label={inv.role} color={ROLE_CHIP_META[inv.role]?.color ?? '#66727A'} /></td>
                      <td className="os-td-mono">{new Date(inv.invitedAt).toLocaleDateString()}</td>
                      <td><Chip label="PENDING" color="#E0A63C" dot /></td>
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

/* ── devices ──────────────────────────────────────────────────── */
function DevicesSection({ devices }) {
  const navigate    = useNavigate()
  const onlineCount = devices.filter(d => d.gpsOnline).length
  const latestFw    = '4.2.1'
  return (
    <div className="os-section">
      <div className="os-section__header">
        <div>
          <span className="os-section__title">Devices</span>
          <span className="os-section__meta">
            {devices.length} devices · {onlineCount} online · telemetry + dual camera
          </span>
        </div>
        <button className="os-action-btn" onClick={() => navigate('/admin/settings/devices/new')}>
          + Provision device
        </button>
      </div>

      <div className="os-table-wrap">
        <table className="os-table">
          <thead>
            <tr>
              <th>UNIT ID</th>
              <th>IMEI</th>
              <th>ASSIGNED TO</th>
              <th>FIRMWARE</th>
              <th>CAMERAS</th>
              <th>STATUS</th>
              <th>LAST CHECK-IN</th>
            </tr>
          </thead>
          <tbody>
            {devices.map(d => {
              const camColor = d.cameras === '—' ? '#5D676C'
                : d.cameras.startsWith('2') ? '#37C2B8'
                : d.cameras.startsWith('1') ? '#E0A63C'
                : '#66727A'
              return (
                <tr key={d.id}>
                  <td className="os-td-mono os-td-id">{d.id}</td>
                  <td className="os-td-mono os-td-imei">{d.imei}</td>
                  <td>{d.assignedTo}</td>
                  <td>
                    <span
                      className="os-td-mono"
                      style={{ color: d.firmware === latestFw ? 'var(--adm-text-muted)' : '#E0A63C' }}
                    >
                      {d.firmware}
                    </span>
                  </td>
                  <td>
                    <Chip label={d.cameras} color={camColor} />
                  </td>
                  <td>
                    <Chip
                      label={d.gpsOnline ? 'ONLINE' : 'OFFLINE'}
                      color={d.gpsOnline ? '#37C2B8' : '#66727A'}
                    />
                  </td>
                  <td className="os-td-mono">{d.lastCheckin}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── vehicles ─────────────────────────────────────────────────── */
function VehiclesSection({ vehicles }) {
  const navigate = useNavigate()
  return (
    <div className="os-section">
      <div className="os-section__header">
        <div>
          <span className="os-section__title">Vehicles</span>
          <span className="os-section__meta">
            {vehicles.length} vehicles in the protective fleet
          </span>
        </div>
        <button className="os-action-btn" onClick={() => navigate('/admin/settings/vehicles/new')}>
          + Add vehicle
        </button>
      </div>

      <div className="os-table-wrap">
        <table className="os-table">
          <thead>
            <tr>
              <th>UNIT</th>
              <th>VEHICLE</th>
              <th>PLATE</th>
              <th>ARMOR</th>
              <th>VIN</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map(v => {
              const meta = STATUS_META[v.status] ?? STATUS_META.offline
              const armorColor = v.armor === 'B6 Armored' ? '#37C2B8'
                : v.armor === 'B4 Armored' ? '#5AA9C2'
                : '#66727A'
              return (
                <tr key={v.id}>
                  <td>
                    <div className="os-unit-cell">
                      <span
                        className="os-unit-dot"
                        style={{ background: meta.color }}
                      />
                      <span className="os-td-mono os-td-id">{v.id}</span>
                      <span className="os-unit-callsign">{v.callsign}</span>
                    </div>
                  </td>
                  <td>{v.vehicle}</td>
                  <td className="os-td-mono">{v.plate}</td>
                  <td>
                    <span style={{ color: armorColor, fontSize: 12 }}>{v.armor}</span>
                  </td>
                  <td className="os-td-mono os-td-vin">{v.vin}</td>
                  <td>
                    <Chip label={meta.label} color={meta.color} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── geofences ────────────────────────────────────────────────── */
function GeofencesSection({ geofences }) {
  const navigate    = useNavigate()
  const activeCount = geofences.filter(g => g.active).length
  return (
    <div className="os-section">
      <div className="os-section__header">
        <div>
          <span className="os-section__title">Geofences</span>
          <span className="os-section__meta">
            {geofences.length} zones · safe zones, corridors and exclusion areas · {activeCount} active
          </span>
        </div>
        <button className="os-action-btn" onClick={() => navigate('/admin/settings/geofences/new')}>
          + New geofence
        </button>
      </div>

      <div className="os-table-wrap">
        <table className="os-table">
          <thead>
            <tr>
              <th>NAME</th>
              <th>TYPE</th>
              <th>SIZE</th>
              <th>LINKED UNITS</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {geofences.map(g => {
              const typeMeta = GEO_TYPE_META[g.type] ?? { color: '#66727A' }
              return (
                <tr key={g.id}>
                  <td className="os-geo-name">{g.name}</td>
                  <td>
                    <Chip label={g.type} color={typeMeta.color} />
                  </td>
                  <td className="os-td-mono" style={{ fontSize: 11 }}>{g.size}</td>
                  <td className="os-td-mono" style={{ fontSize: 11 }}>{g.linkedUnits}</td>
                  <td>
                    <Chip
                      label={g.active ? 'ACTIVE' : 'PAUSED'}
                      color={g.active ? '#37C2B8' : '#66727A'}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── roles & access ───────────────────────────────────────────── */
function RolesSection({ roles }) {
  const navigate = useNavigate()
  return (
    <div className="os-section">
      <div className="os-section__header">
        <div>
          <span className="os-section__title">Roles & access</span>
          <span className="os-section__meta">
            {roles.length} roles · least-privilege by default
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
          />
        ))}
      </div>
    </div>
  )
}

function RoleCard({ role, onEdit }) {
  return (
    <div className="os-role-card">
      <div className="os-role-card__header">
        <span className="os-role-card__dot" style={{ background: role.color }} />
        <span className="os-role-card__name" style={{ color: role.color }}>{role.name}</span>
        <span className="os-role-card__count">
          {role.memberCount} {role.memberCount === 1 ? 'member' : 'members'}
        </span>
        <button className="os-role-card__edit-btn" onClick={onEdit}>Edit →</button>
      </div>
      <p className="os-role-card__desc">{role.description}</p>
      <div className="os-role-card__perms">
        {role.permissions.map(p => <span key={p} className="os-perm-pill">{p}</span>)}
      </div>
    </div>
  )
}

function RoleCreateView({ onSave }) {
  const navigate = useNavigate()

  const [name, setName]         = useState('')
  const [desc, setDesc]         = useState('')
  const [permissions, setPerms] = useState(new Set())
  const [members, setMembers]   = useState([])
  const [showPicker, setPicker] = useState(false)

  const available = mockMembers.filter(m => !members.some(cm => cm.id === m.id))
  const canCreate = name.trim().length > 0

  function togglePerm(label) {
    setPerms(prev => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }

  function addMember(member) {
    setMembers(prev => [...prev, member])
    setPicker(false)
  }

  function removeMember(id) {
    setMembers(prev => prev.filter(m => m.id !== id))
  }

  function handleCreate() {
    if (!canCreate) return
    onSave({
      id:          `role-${Date.now()}`,
      name:        name.trim(),
      description: desc.trim() || 'Custom role.',
      color:       '#66727A',
      permissions: Array.from(permissions),
      memberCount: members.length,
    })
  }

  return (
    <div className="os-section">
      {/* ── header ── */}
      <div className="re-header">
        <button className="re-back" onClick={() => navigate('/admin/settings/roles')}>← ROLES</button>
        <div className="re-header__title">
          <span className="re-header__name" style={{ color: name ? 'var(--adm-text)' : 'var(--adm-text-dim)' }}>
            {name || 'New role'}
          </span>
        </div>
        <button className="re-save" onClick={handleCreate} disabled={!canCreate}>
          Create role
        </button>
      </div>

      {/* ── role details first — name required ── */}
      <div className="re-block">
        <span className="re-block__label">ROLE DETAILS</span>
        <div className="re-fields">
          <div className="re-field-group">
            <label className="re-field-label">
              Name <span className="re-required">*</span>
            </label>
            <input
              className="re-field-input"
              placeholder="e.g. Supervisor"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="re-field-group">
            <label className="re-field-label">Description</label>
            <input
              className="re-field-input"
              placeholder="What this role can do…"
              value={desc}
              onChange={e => setDesc(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── feature access ── */}
      <div className="re-block">
        <span className="re-block__label">FEATURE ACCESS</span>
        <div className="re-perm-grid">
          {ALL_PERMISSIONS.map(p => {
            const active = permissions.has(p.label)
            return (
              <button
                key={p.label}
                className={`re-perm-toggle${active ? ' active' : ''}`}
                onClick={() => togglePerm(p.label)}
              >
                <span className="re-perm-toggle__check">
                  {active && <CheckIcon />}
                </span>
                <div>
                  <span className="re-perm-toggle__name">{p.label}</span>
                  <span className="re-perm-toggle__desc">{p.desc}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── members ── */}
      <div className="re-block">
        <div className="re-block__header">
          <span className="re-block__label">MEMBERS</span>
          <div className="re-picker-wrap">
            <button
              className="os-action-btn"
              onClick={() => setPicker(v => !v)}
              disabled={available.length === 0}
            >
              + Add member
            </button>
            {showPicker && (
              <>
                <div className="re-picker-backdrop" onClick={() => setPicker(false)} />
                <div className="re-picker">
                  {available.map(m => (
                    <button key={m.id} className="re-picker__item" onClick={() => addMember(m)}>
                      <Avatar name={m.name} role={m.role} />
                      <div>
                        <span className="re-picker__name">{m.name}</span>
                        <span className="re-picker__role">Currently: {m.role}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {members.length === 0 ? (
          <span className="re-members-empty">No members assigned yet.</span>
        ) : (
          <div className="re-members">
            {members.map(m => {
              const sm = MEMBER_STATUS_META[m.status]
              return (
                <div key={m.id} className="re-member-row">
                  <Avatar name={m.name} role={m.role} />
                  <div className="re-member-info">
                    <span className="re-member-name">{m.name}</span>
                    <span className="re-member-email">{m.email}</span>
                  </div>
                  <Chip label={sm.label} color={sm.color} dot />
                  <button className="re-remove-btn" onClick={() => removeMember(m.id)}>
                    Remove
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function RoleEditView({ roles, onSave }) {
  const { roleId }  = useParams()
  const navigate    = useNavigate()
  const role        = roles.find(r => r.id === roleId)

  const [name, setName]         = useState(role?.name ?? '')
  const [desc, setDesc]         = useState(role?.description ?? '')
  const [permissions, setPerms] = useState(new Set(role?.permissions ?? []))
  const [members, setMembers]   = useState(() => mockMembers.filter(m => role ? m.role === role.name : false))
  const [showPicker, setPicker] = useState(false)

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

  const available = mockMembers.filter(m => !members.some(cm => cm.id === m.id))

  function togglePerm(label) {
    setPerms(prev => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }

  function addMember(member) {
    setMembers(prev => [...prev, member])
    setPicker(false)
  }

  function removeMember(id) {
    setMembers(prev => prev.filter(m => m.id !== id))
  }

  function handleSave() {
    onSave({
      ...role,
      name,
      description: desc,
      permissions: Array.from(permissions),
      memberCount: members.length,
    })
  }

  return (
    <div className="os-section">
      {/* ── header ── */}
      <div className="re-header">
        <button className="re-back" onClick={() => navigate('/admin/settings/roles')}>← ROLES</button>
        <div className="re-header__title">
          <span className="re-header__dot" style={{ background: role.color }} />
          <span className="re-header__name" style={{ color: role.color }}>{name}</span>
        </div>
        <button className="re-save" onClick={handleSave}>Save changes</button>
      </div>

      {/* ── role details ── */}
      <div className="re-block">
        <span className="re-block__label">ROLE DETAILS</span>
        <div className="re-fields">
          <div className="re-field-group">
            <label className="re-field-label">Name</label>
            <input
              className="re-field-input"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div className="re-field-group">
            <label className="re-field-label">Description</label>
            <input
              className="re-field-input"
              value={desc}
              onChange={e => setDesc(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── feature access ── */}
      <div className="re-block">
        <span className="re-block__label">FEATURE ACCESS</span>
        <div className="re-perm-grid">
          {ALL_PERMISSIONS.map(p => {
            const active = permissions.has(p.label)
            return (
              <button
                key={p.label}
                className={`re-perm-toggle${active ? ' active' : ''}`}
                onClick={() => togglePerm(p.label)}
              >
                <span className="re-perm-toggle__check">
                  {active && <CheckIcon />}
                </span>
                <div>
                  <span className="re-perm-toggle__name">{p.label}</span>
                  <span className="re-perm-toggle__desc">{p.desc}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── members ── */}
      <div className="re-block">
        <div className="re-block__header">
          <span className="re-block__label">MEMBERS</span>
          <div className="re-picker-wrap">
            <button
              className="os-action-btn"
              onClick={() => setPicker(v => !v)}
              disabled={available.length === 0}
            >
              + Add member
            </button>
            {showPicker && (
              <>
                <div className="re-picker-backdrop" onClick={() => setPicker(false)} />
                <div className="re-picker">
                  {available.map(m => (
                    <button key={m.id} className="re-picker__item" onClick={() => addMember(m)}>
                      <Avatar name={m.name} role={m.role} />
                      <div>
                        <span className="re-picker__name">{m.name}</span>
                        <span className="re-picker__role">Currently: {m.role}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {members.length === 0 ? (
          <span className="re-members-empty">No members assigned to this role.</span>
        ) : (
          <div className="re-members">
            {members.map(m => {
              const sm = MEMBER_STATUS_META[m.status]
              return (
                <div key={m.id} className="re-member-row">
                  <Avatar name={m.name} role={m.role} />
                  <div className="re-member-info">
                    <span className="re-member-name">{m.name}</span>
                    <span className="re-member-email">{m.email}</span>
                  </div>
                  <Chip label={sm.label} color={sm.color} dot />
                  <button className="re-remove-btn" onClick={() => removeMember(m.id)}>
                    Remove
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── member edit ──────────────────────────────────────────────── */
function MemberEditView({ members, loading, onSave }) {
  const { memberId } = useParams()
  const navigate     = useNavigate()
  const { accounts } = useAccounts()
  const { user }     = useAuth()
  const member       = members.find(m => m.id === memberId)

  const [name,        setName]        = useState(member?.name ?? '')
  const [email,       setEmail]       = useState(member?.email ?? '')
  const [phone,       setPhone]       = useState(member?.phone ?? '')
  const [role,        setRole]        = useState(member?.role ?? 'Operator')
  const [jobTitle,    setJobTitle]    = useState(member?.jobTitle ?? '')
  const [department,  setDepartment]  = useState(member?.department ?? '')
  const [employeeId,  setEmployeeId]  = useState(member?.employeeId ?? '')
  const [twoFactor,   setTwoFactor]   = useState(member?.twoFactor ?? false)
  const [assignments, setAssignments] = useState(
    () => (member?.assignments ?? []).map(a =>
      typeof a === 'string'
        ? { accountId: a, scope: 'account', groupIds: [], unitIds: [] }
        : a
    )
  )
  const [showPicker,    setShowPicker]    = useState(false)
  const [memberLogs,    setMemberLogs]    = useState([])
  const [logsLoading,   setLogsLoading]   = useState(false)

  useEffect(() => {
    if (!memberId) return
    setLogsLoading(true)
    fetch(`/api/users/${memberId}/logs`)
      .then(r => r.json())
      .then(data => { setMemberLogs(Array.isArray(data) ? data : []); setLogsLoading(false) })
      .catch(() => setLogsLoading(false))
  }, [memberId])

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

  const availableAccounts = accounts.filter(a => !assignments.some(x => x.accountId === a.id))
  const canSave           = name.trim().length > 0 && email.trim().includes('@')

  function addAssignment(accountId) {
    setAssignments(p => [...p, { accountId, scope: 'account', groupIds: [], unitIds: [] }])
    setShowPicker(false)
  }
  function removeAssignment(accountId) {
    setAssignments(p => p.filter(x => x.accountId !== accountId))
  }
  function setScopeForAccount(accountId, scope) {
    setAssignments(p => p.map(x => x.accountId !== accountId ? x : { ...x, scope, groupIds: [], unitIds: [] }))
  }
  function toggleGroup(accountId, groupId) {
    setAssignments(p => p.map(x => {
      if (x.accountId !== accountId) return x
      const has = x.groupIds.includes(groupId)
      return { ...x, groupIds: has ? x.groupIds.filter(id => id !== groupId) : [...x.groupIds, groupId] }
    }))
  }
  function toggleUnit(accountId, unitId) {
    setAssignments(p => p.map(x => {
      if (x.accountId !== accountId) return x
      const has = x.unitIds.includes(unitId)
      return { ...x, unitIds: has ? x.unitIds.filter(id => id !== unitId) : [...x.unitIds, unitId] }
    }))
  }

  async function handleSave() {
    if (!canSave) return
    const res = await fetch(`/api/users/${member.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        name:       name.trim(),
        email:      email.trim(),
        phone:      phone.trim(),
        role,
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

  const isOwner = member.role === 'Owner'

  return (
    <div className="me-page">
      {/* ── page header ── */}
      <div className="me-page-header">
        <button className="re-back" onClick={() => navigate('/admin/settings/members')}>← MEMBERS</button>
        <div className="me-page-header__identity">
          <Avatar name={name || member.name} role={role} size="lg" />
          <div className="me-page-header__info">
            <span className="me-page-header__name">{name || member.name}</span>
            <div className="me-page-header__chips">
              <Chip label={member.type === 'external' ? 'EXTERNAL' : 'INTERNAL'} color={member.type === 'external' ? '#7B8FBD' : '#37C2B8'} />
              <Chip label={role.toUpperCase()} color={ROLE_CHIP_META[role]?.color ?? '#66727A'} />
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
                  {isOwner
                    ? <span className="me-owner-note">Owner role cannot be changed.</span>
                    : <PillGroup options={EDIT_ROLES} value={role} onChange={setRole} />
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
              <span className="me-card__sub">Grant full account, specific groups, or individual units</span>
            </div>
            <div className="re-picker-wrap">
              <button className="os-action-btn" onClick={() => setShowPicker(v => !v)} disabled={availableAccounts.length === 0}>
                + Assign account
              </button>
              {showPicker && (
                <>
                  <div className="re-picker-backdrop" onClick={() => setShowPicker(false)} />
                  <div className="re-picker">
                    {availableAccounts.map(a => {
                      const sm = ACC_STATUS[a.status] ?? ACC_STATUS.inactive
                      return (
                        <button key={a.id} className="re-picker__item" onClick={() => addAssignment(a.id)}>
                          <span className="me-acc-avatar" style={{ background: accAvatarColor(a.id) }}>{accInitials(a.name)}</span>
                          <div>
                            <span className="re-picker__name">{a.name}</span>
                            <span className="re-picker__role">{a.type} · {a.units.length} units</span>
                          </div>
                          <span style={{ marginLeft: 'auto', fontSize: 10, color: sm.color }}>{sm.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="me-card__body">
            {assignments.length === 0 ? (
              <span className="re-members-empty">No accounts assigned. Add at least one account to grant access.</span>
            ) : (
              <div className="me-assign-cards">
                {assignments.map(assign => {
                  const account = accounts.find(a => a.id === assign.accountId)
                  if (!account) return null
                  const sm       = ACC_STATUS[account.status] ?? ACC_STATUS.inactive
                  const people   = account.units.filter(u => u.type === 'person').length
                  const vehicles = account.units.filter(u => u.type === 'vehicle').length
                  const scopeMeta = assign.scope === 'account'
                    ? `Full access · ${people}p · ${vehicles}v · ${account.groups.length}g`
                    : assign.scope === 'groups'
                      ? `${assign.groupIds.length} of ${account.groups.length} ${account.groups.length === 1 ? 'group' : 'groups'}`
                      : `${assign.unitIds.length} of ${account.units.length} ${account.units.length === 1 ? 'unit' : 'units'}`
                  return (
                    <div key={assign.accountId} className="me-assign-card">
                      <div className="me-assign-card__header">
                        <span className="me-acc-avatar" style={{ background: accAvatarColor(account.id) }}>{accInitials(account.name)}</span>
                        <div className="me-assign-info">
                          <span className="me-assign-name">{account.name}</span>
                          <span className="me-assign-meta">{scopeMeta}</span>
                        </div>
                        <div className="me-scope-tabs">
                          {[{ key: 'account', label: 'Account' }, { key: 'groups', label: 'Groups' }, { key: 'units', label: 'Units' }].map(({ key, label }) => (
                            <button key={key} className={`me-scope-tab${assign.scope === key ? ' active' : ''}`} onClick={() => setScopeForAccount(assign.accountId, key)}>
                              {label}
                            </button>
                          ))}
                        </div>
                        <button className="re-remove-btn" onClick={() => removeAssignment(assign.accountId)}>Remove</button>
                      </div>
                      {assign.scope === 'groups' && (
                        <div className="me-assign-card__body">
                          <span className="me-assign-body-label">SELECT GROUPS</span>
                          {account.groups.length === 0 ? (
                            <span className="me-no-items">This account has no groups yet.</span>
                          ) : (
                            <div className="me-item-grid">
                              {account.groups.map(g => {
                                const active = assign.groupIds.includes(g.id)
                                return (
                                  <button key={g.id} className={`me-item-pill${active ? ' active' : ''}`} onClick={() => toggleGroup(assign.accountId, g.id)}>
                                    {active && <CheckIcon />}{g.name}<span className="me-item-count">{g.unitIds.length}</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                      {assign.scope === 'units' && (
                        <div className="me-assign-card__body">
                          <span className="me-assign-body-label">SELECT UNITS</span>
                          <div className="me-item-grid">
                            {account.units.map(u => {
                              const active = assign.unitIds.includes(u.id)
                              return (
                                <button key={u.id} className={`me-item-pill${active ? ' active' : ''}`} onClick={() => toggleUnit(assign.accountId, u.id)}>
                                  {active && <CheckIcon />}
                                  <span className={`me-item-type-dot me-item-type-dot--${u.type}`} />
                                  {u.name}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
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

/* ── member invite ────────────────────────────────────────────── */
const INVITE_ROLES = ['Admin', 'Operator', 'Agent', 'Read-only']

function MemberInviteView({ onSave }) {
  const navigate    = useNavigate()
  const { user }    = useAuth()
  const [name,  setName]  = useState('')
  const [email, setEmail] = useState('')
  const [type,  setType]  = useState('internal')
  const [role,  setRole]  = useState('Operator')
  const [busy,  setBusy]  = useState(false)
  const [error, setError] = useState('')

  const canInvite = name.trim().length > 0 && email.trim().includes('@')

  async function handleInvite() {
    if (!canInvite || busy) return
    setBusy(true)
    setError('')
    try {
      const res  = await fetch('/api/users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:       name.trim(),
          email:      email.trim().toLowerCase(),
          type,
          role,
          inviterSub: user?.sub,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onSave({
        id:         data.id,
        name:       name.trim(),
        email:      email.trim().toLowerCase(),
        role,
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
          {type === 'internal' && (
            <div className="re-field-group">
              <label className="re-field-label">Role</label>
              <PillGroup options={INVITE_ROLES} value={role} onChange={setRole} />
            </div>
          )}
        </div>
        {error && <p style={{ marginTop: 12, fontSize: 13, color: '#F2495B' }}>{error}</p>}
      </div>
    </div>
  )
}

/* ── device create ────────────────────────────────────────────── */
function DeviceCreateView({ onSave }) {
  const navigate = useNavigate()
  const [unitId,      setUnitId]      = useState('')
  const [imei,        setImei]        = useState('')
  const [assignedTo,  setAssignedTo]  = useState('')
  const [firmware,    setFirmware]    = useState('')
  const [gpsOnline,   setGpsOnline]   = useState(true)

  const canCreate = unitId.trim().length > 0

  function handleCreate() {
    if (!canCreate) return
    onSave({
      id:          unitId.trim().toUpperCase(),
      imei:        imei.trim() || '—',
      assignedTo:  assignedTo.trim() || '—',
      firmware:    firmware.trim() || '—',
      gpsOnline,
      cameras:     '—',
      lastCheckin: 'Just now',
    })
  }

  return (
    <div className="os-section">
      <div className="re-header">
        <button className="re-back" onClick={() => navigate('/admin/settings/devices')}>← DEVICES</button>
        <div className="re-header__title">
          <span className="re-header__name" style={{ color: unitId ? 'var(--adm-text)' : 'var(--adm-text-dim)' }}>
            {unitId || 'New device'}
          </span>
        </div>
        <button className="re-save" onClick={handleCreate} disabled={!canCreate}>Provision device</button>
      </div>

      <div className="re-block">
        <span className="re-block__label">DEVICE DETAILS</span>
        <div className="re-fields">
          <div className="re-field-group">
            <label className="re-field-label">Unit ID <span className="re-required">*</span></label>
            <input className="re-field-input re-field-input--mono" placeholder="e.g. SP-06" value={unitId} onChange={e => setUnitId(e.target.value)} autoFocus />
          </div>
          <div className="re-field-group">
            <label className="re-field-label">IMEI</label>
            <input className="re-field-input re-field-input--mono" placeholder="15-digit IMEI" value={imei} onChange={e => setImei(e.target.value)} maxLength={15} />
          </div>
          <div className="re-field-group">
            <label className="re-field-label">Assigned To</label>
            <input className="re-field-input" placeholder="Principal · vehicle" value={assignedTo} onChange={e => setAssignedTo(e.target.value)} />
          </div>
          <div className="re-field-group">
            <label className="re-field-label">Firmware</label>
            <input className="re-field-input re-field-input--mono" placeholder="e.g. 4.2.1" value={firmware} onChange={e => setFirmware(e.target.value)} />
          </div>
          <div className="re-field-group">
            <label className="re-field-label">Status</label>
            <PillGroup
              options={['ONLINE', 'OFFLINE']}
              value={gpsOnline ? 'ONLINE' : 'OFFLINE'}
              onChange={v => setGpsOnline(v === 'ONLINE')}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── vehicle create ───────────────────────────────────────────── */
function VehicleCreateView({ onSave }) {
  const navigate = useNavigate()
  const [unitId,  setUnitId]  = useState('')
  const [vehicle, setVehicle] = useState('')
  const [plate,   setPlate]   = useState('')
  const [armor,   setArmor]   = useState('Soft skin')
  const [vin,     setVin]     = useState('')

  const canCreate = unitId.trim().length > 0

  function handleCreate() {
    if (!canCreate) return
    onSave({
      id:       unitId.trim().toUpperCase(),
      callsign: '—',
      vehicle:  vehicle.trim() || '—',
      plate:    plate.trim() || '—',
      armor,
      vin:      vin.trim() || '—',
      status:   'offline',
    })
  }

  return (
    <div className="os-section">
      <div className="re-header">
        <button className="re-back" onClick={() => navigate('/admin/settings/vehicles')}>← VEHICLES</button>
        <div className="re-header__title">
          <span className="re-header__name" style={{ color: unitId ? 'var(--adm-text)' : 'var(--adm-text-dim)' }}>
            {unitId ? `${unitId}${vehicle ? ` · ${vehicle}` : ''}` : 'New vehicle'}
          </span>
        </div>
        <button className="re-save" onClick={handleCreate} disabled={!canCreate}>Add vehicle</button>
      </div>

      <div className="re-block">
        <span className="re-block__label">VEHICLE DETAILS</span>
        <div className="re-fields">
          <div className="re-field-group">
            <label className="re-field-label">Unit ID <span className="re-required">*</span></label>
            <input className="re-field-input re-field-input--mono" placeholder="e.g. SP-06" value={unitId} onChange={e => setUnitId(e.target.value)} autoFocus />
          </div>
          <div className="re-field-group">
            <label className="re-field-label">Make / Model</label>
            <input className="re-field-input" placeholder="e.g. Cadillac Escalade ESV" value={vehicle} onChange={e => setVehicle(e.target.value)} />
          </div>
          <div className="re-field-group">
            <label className="re-field-label">Plate</label>
            <input className="re-field-input re-field-input--mono" placeholder="License plate" value={plate} onChange={e => setPlate(e.target.value)} />
          </div>
          <div className="re-field-group">
            <label className="re-field-label">Protection level</label>
            <PillGroup
              options={['B6 Armored', 'B4 Armored', 'Soft skin']}
              value={armor}
              onChange={setArmor}
            />
          </div>
          <div className="re-field-group">
            <label className="re-field-label">VIN</label>
            <input className="re-field-input re-field-input--mono" placeholder="17-character VIN" value={vin} onChange={e => setVin(e.target.value)} maxLength={17} />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── geofence create ──────────────────────────────────────────── */
function GeofenceCreateView({ onSave }) {
  const navigate = useNavigate()
  const [name,        setName]        = useState('')
  const [type,        setType]        = useState('SAFE ZONE')
  const [size,        setSize]        = useState('')
  const [linkedUnits, setLinkedUnits] = useState('')

  const canCreate = name.trim().length > 0

  function handleCreate() {
    if (!canCreate) return
    onSave({
      id:          `g${Date.now()}`,
      name:        name.trim(),
      type,
      size:        size.trim() || '—',
      linkedUnits: linkedUnits.trim() || 'All units',
      active:      true,
    })
  }

  return (
    <div className="os-section">
      <div className="re-header">
        <button className="re-back" onClick={() => navigate('/admin/settings/geofences')}>← GEOFENCES</button>
        <div className="re-header__title">
          <span className="re-header__name" style={{ color: name ? 'var(--adm-text)' : 'var(--adm-text-dim)' }}>
            {name || 'New geofence'}
          </span>
        </div>
        <button className="re-save" onClick={handleCreate} disabled={!canCreate}>Create zone</button>
      </div>

      <div className="re-block">
        <span className="re-block__label">ZONE DETAILS</span>
        <div className="re-fields">
          <div className="re-field-group">
            <label className="re-field-label">Zone name <span className="re-required">*</span></label>
            <input className="re-field-input" placeholder="e.g. Residence — Highland Park" value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
          <div className="re-field-group">
            <label className="re-field-label">Type</label>
            <PillGroup
              options={['SAFE ZONE', 'CORRIDOR', 'EXCLUSION', 'WAYPOINT']}
              value={type}
              onChange={setType}
            />
          </div>
          <div className="re-field-group">
            <label className="re-field-label">Size</label>
            <input className="re-field-input re-field-input--mono" placeholder="e.g. 400 m radius" value={size} onChange={e => setSize(e.target.value)} />
          </div>
          <div className="re-field-group">
            <label className="re-field-label">Linked units</label>
            <input className="re-field-input re-field-input--mono" placeholder="e.g. SP-01, SP-02 or All units" value={linkedUnits} onChange={e => setLinkedUnits(e.target.value)} />
          </div>
        </div>
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
  const palette = (role === 'Owner' || role === 'Admin')
    ? AVATAR_PALETTES[0]
    : AVATAR_PALETTES[2]
  return (
    <span
      className={`os-avatar${size === 'lg' ? ' os-avatar--lg' : ''}`}
      style={{ background: palette.bg, color: palette.color }}
    >
      {initials}
    </span>
  )
}
