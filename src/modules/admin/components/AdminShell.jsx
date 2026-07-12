import { useMemo, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAccounts } from '../contexts/AccountsContext'
import NavRail from './NavRail'
import TopBar from './TopBar'
import AlertModal from './AlertModal'
import Dashboard from '../pages/Dashboard'
import UnitList from '../pages/UnitList'
import UnitDetail from '../pages/UnitDetail'
import VehicleDetail from '../pages/VehicleDetail'
import PrincipalDetail from '../pages/PrincipalDetail'
import OrgSettings from '../pages/OrgSettings'
import LogsPage from '../pages/LogsPage'
import { AccountList, AccountDetail, GroupDetail } from '../pages/Accounts'
import Feed from '../pages/Feed'
import { mockUnits }  from '../data/mockUnits'
import { mockAlerts as seedAlerts } from '../data/mockAlerts'
import './AdminShell.css'

const NAV_ROUTES = {
  dashboard: '/admin/ops',
  unit:      '/admin/unit',
  feed:      '/admin/feed',
  accounts:  '/admin/accounts',
  logs:      '/admin/logs',
  admin:     '/admin/settings',
}

const SETTINGS_SECTION_LABELS = {
  members:   'Members',
  devices:   'Devices',
  vehicles:  'Vehicles',
  geofences: 'Geofences',
  roles:     'Roles & access',
}

function screenFromPath(pathname) {
  if (pathname.startsWith('/admin/unit'))     return 'unit'
  if (pathname.startsWith('/admin/feed'))     return 'feed'
  if (pathname.startsWith('/admin/accounts')) return 'accounts'
  if (pathname.startsWith('/admin/logs'))     return 'logs'
  if (pathname.startsWith('/admin/settings')) return 'admin'
  if (pathname.startsWith('/admin/ops'))      return 'dashboard'
  return 'dashboard'
}

export default function AdminShell() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const screen    = screenFromPath(location.pathname)
  const { accounts } = useAccounts()

  // ── alert state ────────────────────────────────────────────
  const [alerts,    setAlerts]    = useState(seedAlerts)
  const [alertOpen, setAlertOpen] = useState(false)

  const activeAlerts = alerts.filter(a => a.status === 'active')
  const hasDuress    = activeAlerts.some(a => a.level === 'duress')

  function handleAlertAction(alertId, entry) {
    setAlerts(p => p.map(a => a.id !== alertId ? a : {
      ...a, actionLog: [...a.actionLog, entry],
    }))
  }
  function handleAlertFalseAlarm(alertId) {
    setAlerts(p => p.map(a => a.id !== alertId ? a : { ...a, status: 'false_alarm' }))
    const remaining = activeAlerts.filter(a => a.id !== alertId)
    if (remaining.length === 0) setAlertOpen(false)
  }
  function handleAlertNotes(alertId, notes) {
    setAlerts(p => p.map(a => a.id !== alertId ? a : { ...a, notes }))
  }

  const fleetStatus = useMemo(() => {
    const duressCount = activeAlerts.filter(a => a.level === 'duress').length
    const unitWarn    = mockUnits.filter(u => u.status === 'warning').length
    const warnCount   = activeAlerts.filter(a => a.level === 'warning').length + unitWarn
    if (duressCount > 0)
      return { level: 'duress',  text: `${duressCount} DURESS ACTIVE`, color: '#F2495B' }
    if (warnCount > 0)
      return { level: 'warning', text: `${warnCount} WARNING${warnCount > 1 ? 'S' : ''}`, color: '#E0A63C' }
    return { level: 'secure', text: 'ALL SECURE', color: '#37C2B8' }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAlerts.length, activeAlerts.map(a => a.level + a.status).join()])

  const crumb = useMemo(() => {
    const path = location.pathname
    const bc   = (segs) => ({ breadcrumb: segs })
    const leaf  = (label) => ({ label, to: null })
    const link  = (label, to) => ({ label, to })

    // ── unit detail ──────────────────────────────
    const unitMatch = path.match(/^\/admin\/unit\/(.+)$/)
    if (unitMatch) {
      const unit = mockUnits.find(u => u.id === unitMatch[1])
      return bc([
        link('Units', '/admin/unit'),
        leaf(unit ? `${unit.id} · ${unit.callsign}` : unitMatch[1]),
      ])
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

    // ── feed ─────────────────────────────────────
    if (path.startsWith('/admin/feed')) return bc([leaf('Feed')])

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
      dashboard: 'Live Operations',
      unit:      'Units',
      feed:      'Feed',
      accounts:  'Accounts',
      admin:     'Organization',
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
            <Route path="/"          element={<Navigate to="/admin/ops" replace />} />
            <Route path="/ops"       element={<Dashboard units={mockUnits} />} />
            <Route path="/unit"                   element={<UnitList      units={mockUnits} />} />
            <Route path="/unit/principal/:id"    element={<PrincipalDetail />} />
            <Route path="/unit/vehicle/:id"      element={<VehicleDetail />} />
            <Route path="/unit/:id"              element={<UnitDetail    units={mockUnits} />} />
            <Route path="/feed"                                                    element={<Feed />} />
            <Route path="/accounts"                                                element={<AccountList />} />
            <Route path="/accounts/:accountId"             element={<AccountDetail />} />
            <Route path="/accounts/:accountId/:groupId"    element={<GroupDetail />} />
            <Route path="/logs"        element={<LogsPage />} />
            <Route path="/settings/*" element={<OrgSettings />} />
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
