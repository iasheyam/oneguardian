import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import './NavRail.css'

const NAV_ITEMS = [
  { key: 'dashboard',  label: 'OPS',      title: 'Live operations',       permKey: 'ops'       },
  { key: 'unit',       label: 'UNIT',     title: 'Vehicle detail',        permKey: 'units'     },
  { key: 'feed',       label: 'FEED',     title: 'Live camera feeds',     permKey: 'feed'      },
  { key: 'accounts',   label: 'ACCTS',    title: 'Account management',    permKey: 'accounts'  },
  { key: 'logs',       label: 'LOGS',     title: 'Activity logs',         permKey: 'logs'      },
  { key: 'alerts',     label: 'ALRT',     title: 'Alert management',      permKey: 'alerts'    },
  { key: 'triggers',   label: 'TRIG',     title: 'Alert triggers',        permKey: 'triggers'  },
  { key: 'testing',    label: 'TEST',     title: 'Simulation testing',    permKey: 'testing'   },
  { key: 'mapstudio',  label: 'MAP',      title: 'Map Studio',            permKey: 'mapstudio' },
  { key: 'admin',      label: 'ADMIN',    title: 'Organization settings', permKey: 'admin'     },
]

function OpsIcon()   { return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden><rect x="0" y="0" width="6.5" height="6.5" rx="1.5"/><rect x="9.5" y="0" width="6.5" height="6.5" rx="1.5"/><rect x="0" y="9.5" width="6.5" height="6.5" rx="1.5"/><rect x="9.5" y="9.5" width="6.5" height="6.5" rx="1.5"/></svg> }
function UnitIcon()  { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/></svg> }
function MediaIcon() { return <svg width="14" height="16" viewBox="0 0 14 16" fill="none" aria-hidden><path d="M1.5 1.5L12.5 8L1.5 14.5V1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg> }
function AccountsIcon() { return <svg width="14" height="16" viewBox="0 0 14 16" fill="none" aria-hidden><rect x="1" y="4.5" width="12" height="11" rx="1.25" stroke="currentColor" strokeWidth="1.4"/><path d="M4.5 4.5V3a.5.5 0 01.5-.5h4a.5.5 0 01.5.5v1.5" stroke="currentColor" strokeWidth="1.4"/><rect x="5.75" y="9.5" width="2.5" height="6" rx="0.6" fill="currentColor"/><rect x="2.5" y="6.5" width="2" height="1.75" rx="0.5" fill="currentColor"/><rect x="9.5" y="6.5" width="2" height="1.75" rx="0.5" fill="currentColor"/></svg> }
function AdminIcon() { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.22 3.22l1.41 1.41M11.37 11.37l1.41 1.41M3.22 12.78l1.41-1.41M11.37 4.63l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
function LogoutIcon() { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M11 11l3-3-3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> }
function LogsIcon() { return <svg width="15" height="14" viewBox="0 0 15 14" fill="none" aria-hidden><rect x="0.75" y="0.75" width="13.5" height="2.5" rx="1.25" stroke="currentColor" strokeWidth="1.3"/><rect x="0.75" y="5.75" width="13.5" height="2.5" rx="1.25" stroke="currentColor" strokeWidth="1.3"/><rect x="0.75" y="10.75" width="8" height="2.5" rx="1.25" stroke="currentColor" strokeWidth="1.3"/></svg> }
function TriggersIcon() { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M8 1.5C5 1.5 2.5 4 2.5 7c0 2.1 1.1 3.9 2.8 4.9V13h5.4v-1.1c1.7-1 2.8-2.8 2.8-4.9 0-3-2.5-5.5-5.5-5.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M5.5 13.5h5M8 13.5V15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M8 4.5v3.5l2 1.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg> }
function TestingIcon() { return <svg width="14" height="16" viewBox="0 0 14 16" fill="none" aria-hidden><path d="M4.5 1h5M5 1v6L1.5 13.5A1 1 0 002.4 15h9.2a1 1 0 00.9-1.5L9 7V1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="5.5" cy="11" r="1" fill="currentColor"/><circle cx="8.5" cy="12.5" r="0.7" fill="currentColor"/></svg> }
function AlertsIcon() { return <svg width="15" height="16" viewBox="0 0 15 16" fill="none" aria-hidden><path d="M7.5 1.5a4 4 0 00-4 4v3.2L2 11h11l-1.5-2.3V5.5a4 4 0 00-4-4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M5.8 11v.5a1.7 1.7 0 003.4 0V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> }
function MapStudioIcon() { return <svg width="14" height="16" viewBox="0 0 14 16" fill="none" aria-hidden><path d="M7 1C4.24 1 2 3.24 2 6C2 9.75 7 15 7 15C7 15 12 9.75 12 6C12 3.24 9.76 1 7 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><circle cx="7" cy="6" r="2" fill="currentColor"/></svg> }

const ICONS = { dashboard: OpsIcon, mapstudio: MapStudioIcon, unit: UnitIcon, feed: MediaIcon, accounts: AccountsIcon, logs: LogsIcon, alerts: AlertsIcon, triggers: TriggersIcon, testing: TestingIcon, admin: AdminIcon }

export default function NavRail({ screen, onNav }) {
  const { signOut, can } = useAuth()
  const navigate = useNavigate()

  const visibleItems = NAV_ITEMS.filter(item => can(item.permKey))

  async function handleLogout() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <nav className="nav-rail" aria-label="Main navigation">
      <div className="nav-rail__logo" aria-label="TelematicsGuardian">
        <ShieldMark />
      </div>

      <ul className="nav-rail__items" role="list">
        {visibleItems.map(item => {
          const Icon = ICONS[item.key]
          const active = screen === item.key
          return (
            <li key={item.key}>
              <button
                className={`nav-item${active ? ' active' : ''}`}
                onClick={() => onNav(item.key)}
                title={item.title}
                aria-current={active ? 'page' : undefined}
              >
                <span className="nav-item__icon"><Icon /></span>
                <span className="nav-item__label">{item.label}</span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="nav-rail__footer">
        <button className="nav-item nav-item--logout" onClick={handleLogout} title="Sign out">
          <span className="nav-item__icon"><LogoutIcon /></span>
          <span className="nav-item__label">OUT</span>
        </button>
      </div>
    </nav>
  )
}

function ShieldMark() {
  return (
    <svg width="22" height="26" viewBox="0 0 22 26" fill="none" aria-hidden>
      <path d="M11 1L2 4.5V12C2 17 6 21.5 11 24C16 21.5 20 17 20 12V4.5L11 1Z"
        stroke="#37C2B8" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M7 12.5L10 15.5L15 10" stroke="#37C2B8" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
