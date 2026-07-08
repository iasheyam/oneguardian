import { useMemo } from 'react'
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import NavRail from './NavRail'
import TopBar from './TopBar'
import Dashboard from '../pages/Dashboard'
import UnitList from '../pages/UnitList'
import UnitDetail from '../pages/UnitDetail'
import OrgSettings from '../pages/OrgSettings'
import { FleetGroups, FleetSubgroups, FleetVehicles } from '../pages/Fleets'
import Feed from '../pages/Feed'
import { mockFleets } from '../data/mockFleets'
import { mockUnits } from '../data/mockUnits'
import './AdminShell.css'

const NAV_ROUTES = {
  dashboard: '/admin',
  unit:      '/admin/unit',
  feed:      '/admin/feed',
  fleet:     '/admin/fleets',
  admin:     '/admin/settings',
}

const CRUMBS = {
  dashboard: { title: 'Live Operations',  sub: 'Dallas · TX Sector · 7 units deployed' },
  unit:      { title: 'Units',            sub: 'All vehicles & people' },
  feed:      { title: 'Feed',             sub: 'Live camera feeds from all devices' },
  fleet:     { title: 'Fleets',           sub: 'Fleet groups & subgroups' },
  admin:     { title: 'Organization',     sub: 'Members · devices · settings' },
}

const SETTINGS_SECTION_LABELS = {
  members:   'Members',
  devices:   'Devices',
  vehicles:  'Vehicles',
  geofences: 'Geofences',
  roles:     'Roles & access',
}

function screenFromPath(pathname) {
  if (pathname.startsWith('/admin/unit')) return 'unit'
  if (pathname.startsWith('/admin/feed'))     return 'feed'
  if (pathname.startsWith('/admin/fleets'))   return 'fleet'
  if (pathname.startsWith('/admin/settings')) return 'admin'
  return 'dashboard'
}

export default function AdminShell() {
  const location = useLocation()
  const navigate  = useNavigate()
  const screen    = screenFromPath(location.pathname)

  const fleetStatus = useMemo(() => {
    const hasDuress = mockUnits.some(u => u.status === 'duress')
    const warnCount = mockUnits.filter(u => u.status === 'warning').length
    if (hasDuress) return { level: 'duress',  text: '1 DURESS ACTIVE',   color: '#F2495B' }
    if (warnCount) return { level: 'warning', text: `${warnCount} WARNING`, color: '#E0A63C' }
    return               { level: 'secure',  text: 'ALL SECURE',          color: '#37C2B8' }
  }, [])

  const crumb = useMemo(() => {
    const path = location.pathname

    const unitMatch = path.match(/^\/admin\/unit\/(.+)$/)
    if (unitMatch) {
      const unit = mockUnits.find(u => u.id === unitMatch[1])
      return {
        title: 'Unit Detail',
        sub: unit ? `${unit.id} · ${unit.callsign} · ${unit.principal}` : unitMatch[1],
      }
    }

    if (path.startsWith('/admin/fleets')) {
      const parts = path.replace('/admin/fleets', '').split('/').filter(Boolean)
      if (parts.length >= 2) {
        const fleet = mockFleets.find(f => f.id === parts[0])
        const sg    = fleet?.subgroups.find(s => s.id === parts[1])
        const sgName = sg?.name ?? (parts[1] === 'direct' ? 'All Vehicles' : parts[1])
        return { title: 'Fleets', sub: fleet ? `${fleet.name} · ${sgName}` : parts[1] }
      }
      if (parts.length === 1) {
        const fleet = mockFleets.find(f => f.id === parts[0])
        return { title: 'Fleets', sub: fleet?.name ?? parts[0] }
      }
      return { title: 'Fleets', sub: 'All groups' }
    }

    if (path.startsWith('/admin/settings')) {
      if (path.match(/\/settings\/members\/new$/))
        return { title: 'Organization', sub: 'Members · Invite member' }
      if (path.match(/\/settings\/roles\/new$/))
        return { title: 'Organization', sub: 'Roles & access · New role' }
      if (path.match(/\/settings\/roles\/.+$/))
        return { title: 'Organization', sub: 'Roles & access · Edit role' }
      if (path.match(/\/settings\/devices\/new$/))
        return { title: 'Organization', sub: 'Devices · Provision device' }
      if (path.match(/\/settings\/vehicles\/new$/))
        return { title: 'Organization', sub: 'Vehicles · Add vehicle' }
      if (path.match(/\/settings\/geofences\/new$/))
        return { title: 'Organization', sub: 'Geofences · New geofence' }
      const sectionMatch = path.match(/\/settings\/(\w+)/)
      const section = sectionMatch?.[1] ?? 'members'
      return { title: 'Organization', sub: SETTINGS_SECTION_LABELS[section] ?? 'Settings' }
    }

    return CRUMBS[screen] ?? CRUMBS.dashboard
  }, [location.pathname, screen])

  return (
    <div className="admin-shell">
      <NavRail screen={screen} onNav={key => navigate(NAV_ROUTES[key])} />
      <div className="admin-body">
        <TopBar crumb={crumb} fleetStatus={fleetStatus} />
        <main className="admin-content">
          <Routes>
            <Route path="/"          element={<Dashboard units={mockUnits} />} />
            <Route path="/unit"      element={<UnitList   units={mockUnits} />} />
            <Route path="/unit/:id"  element={<UnitDetail units={mockUnits} />} />
            <Route path="/feed"          element={<Feed />} />
            <Route path="/fleets"                          element={<FleetGroups />} />
            <Route path="/fleets/:fleetId"               element={<FleetSubgroups />} />
            <Route path="/fleets/:fleetId/:subgroupId"   element={<FleetVehicles />} />
            <Route path="/settings/*" element={<OrgSettings />} />
            <Route path="*"          element={<AdminStub screen={screen} />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function AdminStub({ screen }) {
  return (
    <div className="admin-stub">
      <span className="admin-stub__title">{CRUMBS[screen]?.title ?? 'Coming soon'}</span>
      <span className="admin-stub__sub">Coming soon</span>
    </div>
  )
}
