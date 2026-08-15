import { useMemo, useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAccounts } from '../contexts/AccountsContext'
import { useAuth } from '../../auth/AuthContext'
import NavRail from './NavRail'
import TopBar from './TopBar'
import AlertModal from './AlertModal'
import Dashboard from '../pages/Dashboard'
import UnitList from '../pages/UnitList'
import VehicleDetail from '../pages/VehicleDetail'
import PrincipalDetail from '../pages/PrincipalDetail'
import OrgSettings from '../pages/OrgSettings'
import LogsPage from '../pages/LogsPage'
import { AccountList, AccountDetail, GroupDetail } from '../pages/Accounts'
import Feed from '../pages/Feed'
import TriggersPage from '../pages/TriggersPage'
import TestingPage from '../pages/TestingPage'
import AlertsPage from '../pages/AlertsPage'
import MapStudioPage from '../pages/MapStudioPage'
import { apiUrl, apiFetch, getToken } from '../../../shared/utils/api'
import './AdminShell.css'

const TRIGGER_TYPE_MAP = {
  speed:           'speed',
  panic_button:    'panic',
  fuel:            'battery',
  tracker_battery: 'battery',
  device_offline:  'offline',
  gps_jamming:     'offline',
  red_zone_entry:  'geofence',
  zone_entry:      'geofence',
  zone_exit:       'geofence',
  heart_rate:      'medical',
  blood_pressure:  'medical',
  blood_oxygen:    'medical',
}

function dbAlertToModal(a) {
  const firedAt = new Date(a.firedAt)
  const hh = (n) => String(n).padStart(2, '0')
  return {
    id:        a.id,
    level:     a.severity === 'red_alert' ? 'duress' : 'warning',
    type:      TRIGGER_TYPE_MAP[a.triggerType] ?? 'speed',
    unitId:    a.unitType ? a.unitType.toUpperCase() : 'UNIT',
    unitDbId:  a.unitId,
    unitType:  a.unitType,
    callsign:  a.unitName ?? '—',
    agent:     null,
    vehicle:   null,
    armorLevel:null,
    plate:     null,
    lat:            a.position?.latitude  ?? null,
    lng:            a.position?.longitude ?? null,
    traccarAddress: a.position?.address   ?? null,
    location:  a.position?.address ?? (
      a.position?.latitude != null
        ? `${Number(a.position.latitude).toFixed(4)}°, ${Number(a.position.longitude).toFixed(4)}°`
        : '—'
    ),
    speed:     a.position?.speed ?? 0,
    heading:   null,
    time:      firedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    timeUtc:   `${hh(firedAt.getUTCHours())}:${hh(firedAt.getUTCMinutes())}Z`,
    status:    a.status,
    notes:     a.notes ?? '',
    actionLog: [],
  }
}

const NAV_ROUTES = {
  dashboard:  '/admin/ops',
  mapstudio:  '/admin/map-studio',
  unit:       '/admin/unit',
  feed:       '/admin/feed',
  accounts:   '/admin/accounts',
  logs:       '/admin/logs',
  alerts:     '/admin/alerts',
  triggers:   '/admin/triggers',
  testing:    '/admin/testing',
  admin:      '/admin/settings',
}

const SETTINGS_SECTION_LABELS = {
  members:   'Members',
  devices:   'Devices',
  vehicles:  'Vehicles',
  geofences: 'Geofences',
  roles:     'Roles & access',
}

function screenFromPath(pathname) {
  if (pathname.startsWith('/admin/map-studio')) return 'mapstudio'
  if (pathname.startsWith('/admin/unit'))       return 'unit'
  if (pathname.startsWith('/admin/feed'))       return 'feed'
  if (pathname.startsWith('/admin/accounts'))   return 'accounts'
  if (pathname.startsWith('/admin/logs'))       return 'logs'
  if (pathname.startsWith('/admin/alerts'))     return 'alerts'
  if (pathname.startsWith('/admin/triggers'))   return 'triggers'
  if (pathname.startsWith('/admin/testing'))    return 'testing'
  if (pathname.startsWith('/admin/settings'))   return 'admin'
  if (pathname.startsWith('/admin/ops'))        return 'dashboard'
  return 'dashboard'
}

const PERM_ROUTES = [
  { path: '/admin/ops',        perm: 'ops'      },
  { path: '/admin/map-studio', perm: 'ops'      },
  { path: '/admin/unit',       perm: 'units'    },
  { path: '/admin/feed',       perm: 'feed'     },
  { path: '/admin/accounts',   perm: 'accounts' },
  { path: '/admin/logs',       perm: 'logs'     },
  { path: '/admin/alerts',     perm: 'ops'      },
  { path: '/admin/triggers',   perm: 'admin'    },
  { path: '/admin/testing',    perm: 'admin'    },
  { path: '/admin/settings',   perm: 'admin'    },
]

function RequirePermission({ perm, children }) {
  const { can, dbUser } = useAuth()
  if (!dbUser) return null
  if (!can(perm)) return <NoAccess />
  return children
}

function NoAccess() {
  return (
    <div className="admin-stub">
      <span className="admin-stub__title">Access denied</span>
      <span className="admin-stub__sub">You don't have permission to view this page</span>
    </div>
  )
}

export default function AdminShell() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const screen    = screenFromPath(location.pathname)
  const { accounts } = useAccounts()
  const { can }   = useAuth()

  const defaultPath = PERM_ROUTES.find(r => can(r.perm))?.path ?? '/admin/ops'

  // ── alert state ────────────────────────────────────────────
  const [alerts,    setAlerts]    = useState([])
  const [alertOpen, setAlertOpen] = useState(false)

  const activeAlerts = alerts.filter(a => a.status === 'active')
  const hasDuress    = activeAlerts.some(a => a.level === 'duress')

  useEffect(() => {
    // Load any already-active alerts on mount
    apiFetch(apiUrl('/api/alerts/active'))
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return
        const live = data.map(dbAlertToModal)
        if (live.length > 0) { setAlerts(live); setAlertOpen(true) }
      })
      .catch(() => {})

    // SSE — listen for new alerts fired in real time
    const token = getToken()
    const url = apiUrl(`/api/live${token ? `?token=${encodeURIComponent(token)}` : ''}`)
    const es = new EventSource(url)

    es.onmessage = e => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'alert') {
          const modal = dbAlertToModal(msg.alert)
          setAlerts(prev => prev.some(a => a.id === modal.id) ? prev : [...prev, modal])
          setAlertOpen(true)
        }
      } catch {}
    }

    return () => es.close()
  }, [])

  function handleAlertAction(alertId, entry) {
    setAlerts(p => p.map(a => a.id !== alertId ? a : {
      ...a, actionLog: [...a.actionLog, entry],
    }))
  }
  function handleAlertFalseAlarm(alertId) {
    setAlerts(p => p.map(a => a.id !== alertId ? a : { ...a, status: 'false_alarm' }))
    const remaining = activeAlerts.filter(a => a.id !== alertId)
    if (remaining.length === 0) setAlertOpen(false)
    apiFetch(apiUrl(`/api/alerts/${alertId}`), {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'false_alarm' }),
    }).catch(() => {})
  }
  function handleAlertNotes(alertId, notes) {
    setAlerts(p => p.map(a => a.id !== alertId ? a : { ...a, notes }))
  }

  const fleetStatus = useMemo(() => {
    const duressCount = activeAlerts.filter(a => a.level === 'duress').length
    const allUnits    = accounts.flatMap(a => a.units ?? [])
    const unitWarn    = allUnits.filter(u => u.status === 'warning').length
    const warnCount   = activeAlerts.filter(a => a.level === 'warning').length + unitWarn
    if (duressCount > 0)
      return { level: 'duress',  text: `${duressCount} DURESS ACTIVE`, color: '#F43F5E' }
    if (warnCount > 0)
      return { level: 'warning', text: `${warnCount} WARNING${warnCount > 1 ? 'S' : ''}`, color: '#FB923C' }
    return { level: 'secure', text: 'ALL SECURE', color: '#22D3EE' }
  }, [activeAlerts, accounts])

  const crumb = useMemo(() => {
    const path = location.pathname
    const bc   = (segs) => ({ breadcrumb: segs })
    const leaf  = (label) => ({ label, to: null })
    const link  = (label, to) => ({ label, to })

    // ── unit detail ──────────────────────────────
    const principalMatch = path.match(/^\/admin\/unit\/principal\/(.+)$/)
    const vehicleMatch   = path.match(/^\/admin\/unit\/vehicle\/(.+)$/)
    if (principalMatch || vehicleMatch) {
      const unitId = principalMatch?.[1] ?? vehicleMatch?.[1]
      let unitName = unitId
      for (const acc of accounts) {
        const found = acc.units?.find(u => u.id === unitId)
        if (found) { unitName = found.name; break }
      }
      return bc([link('Units', '/admin/unit'), leaf(unitName)])
    }

    // ── unit list ────────────────────────────────
    if (path === '/admin/unit') return bc([leaf('Units')])

    // ── accounts ─────────────────────────────────
    if (path.startsWith('/admin/accounts')) {
      const parts = path.replace('/admin/accounts', '').split('/').filter(Boolean)

      if (parts.length === 0) return bc([leaf('Accounts')])

      const segs = [link('Accounts', '/admin/accounts')]
      const acc  = accounts.find(a => a.id === parts[0])

      if (!acc) return bc([...segs, leaf(parts[0])])
      segs.push(parts.length === 1 ? leaf(acc.name) : link(acc.name, `/admin/accounts/${acc.id}`))

      if (parts.length >= 2) {
        const grp = acc.groups.find(g => g.id === parts[1])
        segs.push(grp ? leaf(grp.name) : leaf(parts[1]))
      }

      return bc(segs)
    }

    // ── map studio ───────────────────────────────
    if (path.startsWith('/admin/map-studio')) return bc([leaf('Map Studio')])

    // ── feed ─────────────────────────────────────
    if (path.startsWith('/admin/feed')) return bc([leaf('Feed')])

    // ── triggers ──────────────────────────────────
    if (path.startsWith('/admin/alerts'))   return bc([leaf('Alert Management')])
    if (path.startsWith('/admin/triggers')) return bc([leaf('Alert Triggers')])
    if (path.startsWith('/admin/testing'))  return bc([leaf('Simulation Testing')])

    // ── settings ─────────────────────────────────
    if (path.startsWith('/admin/settings')) {
      const settingsRoot = link('Organization', '/admin/settings')
      const sectionMatch = path.match(/\/settings\/(\w+)/)
      const section      = sectionMatch?.[1] ?? 'members'
      const sectionLabel = SETTINGS_SECTION_LABELS[section] ?? 'Settings'

      if (path.match(/\/settings\/members\/new$/))
        return bc([settingsRoot, link('Members', '/admin/settings/members'), leaf('Invite Member')])
      if (path.match(/\/settings\/members\/.+$/))
        return bc([settingsRoot, link('Members', '/admin/settings/members'), leaf('Edit Member')])
      if (path.match(/\/settings\/roles\/new$/))
        return bc([settingsRoot, link('Roles & Access', '/admin/settings/roles'), leaf('New Role')])
      if (path.match(/\/settings\/roles\/.+$/))
        return bc([settingsRoot, link('Roles & Access', '/admin/settings/roles'), leaf('Edit Role')])
      if (path.match(/\/settings\/devices\/new$/))
        return bc([settingsRoot, link('Devices', '/admin/settings/devices'), leaf('Provision Device')])
      if (path.match(/\/settings\/vehicles\/new$/))
        return bc([settingsRoot, link('Vehicles', '/admin/settings/vehicles'), leaf('Add Vehicle')])
      if (path.match(/\/settings\/geofences\/new$/))
        return bc([settingsRoot, link('Geofences', '/admin/settings/geofences'), leaf('New Geofence')])
      if (sectionMatch)
        return bc([settingsRoot, leaf(sectionLabel)])

      return bc([leaf('Organization')])
    }

    // ── top-level pages ───────────────────────────
    const TOP_LABELS = {
      dashboard:  'Live Operations',
      mapstudio:  'Map Studio',
      unit:       'Units',
      feed:       'Feed',
      accounts:   'Accounts',
      alerts:     'Alert Management',
      triggers:   'Alert Triggers',
      testing:    'Simulation Testing',
      admin:      'Organization',
    }
    return bc([leaf(TOP_LABELS[screen] ?? 'Live Operations')])
  }, [location.pathname, screen, accounts])

  return (
    <div className="admin-shell">
      <NavRail screen={screen} onNav={key => navigate(NAV_ROUTES[key])} />
      <div className="admin-body">
        <TopBar
          crumb={crumb}
          fleetStatus={fleetStatus}
          onStatusClick={activeAlerts.length > 0 ? () => setAlertOpen(true) : undefined}
        />
        <main className="admin-content">
          <Routes>
            <Route path="/"          element={<Navigate to={defaultPath} replace />} />
            <Route path="/ops"       element={<RequirePermission perm="ops"><Dashboard /></RequirePermission>} />
            <Route path="/unit"                element={<RequirePermission perm="units"><UnitList /></RequirePermission>} />
            <Route path="/unit/principal/:id" element={<RequirePermission perm="units"><PrincipalDetail /></RequirePermission>} />
            <Route path="/unit/vehicle/:id"   element={<RequirePermission perm="units"><VehicleDetail /></RequirePermission>} />
            <Route path="/feed"      element={<RequirePermission perm="feed"><Feed /></RequirePermission>} />
            <Route path="/accounts"                                                element={<RequirePermission perm="accounts"><AccountList /></RequirePermission>} />
            <Route path="/accounts/:accountId"             element={<RequirePermission perm="accounts"><AccountDetail /></RequirePermission>} />
            <Route path="/accounts/:accountId/:groupId"    element={<RequirePermission perm="accounts"><GroupDetail /></RequirePermission>} />
            <Route path="/logs"      element={<RequirePermission perm="logs"><LogsPage /></RequirePermission>} />
            <Route path="/map-studio" element={<RequirePermission perm="ops"><MapStudioPage /></RequirePermission>} />
            <Route path="/alerts"    element={<RequirePermission perm="ops"><AlertsPage /></RequirePermission>} />
            <Route path="/triggers"  element={<RequirePermission perm="admin"><TriggersPage /></RequirePermission>} />
            <Route path="/testing"   element={<RequirePermission perm="admin"><TestingPage /></RequirePermission>} />
            <Route path="/settings/*" element={<RequirePermission perm="admin"><OrgSettings /></RequirePermission>} />
            <Route path="*"          element={<AdminStub />} />
          </Routes>
        </main>
      </div>

      {alertOpen && activeAlerts.length > 0 && (
        <AlertModal
          alerts={activeAlerts}
          onAction={handleAlertAction}
          onFalseAlarm={handleAlertFalseAlarm}
          onAcknowledge={() => setAlertOpen(false)}
          onUpdateNotes={handleAlertNotes}
        />
      )}
    </div>
  )
}

function AdminStub() {
  return (
    <div className="admin-stub">
      <span className="admin-stub__title">Coming soon</span>
      <span className="admin-stub__sub">This section is under construction</span>
    </div>
  )
}
