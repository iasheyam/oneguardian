import { useState, useEffect } from 'react'
import './TopBar.css'

function pad(n) { return String(n).padStart(2, '0') }

export default function TopBar({ crumb, fleetStatus }) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const zulu  = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}Z`
  const local = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

  const isAlert = fleetStatus.level === 'duress'

  return (
    <header className="top-bar">
      <div className="top-bar__crumb">
        <span className="top-bar__title">{crumb?.title}</span>
        <span className="top-bar__sub">{crumb?.sub}</span>
      </div>

      <div className="top-bar__right">
        <div
          className="status-pill"
          style={{
            color: fleetStatus.color,
            borderColor: `color-mix(in srgb, ${fleetStatus.color} 35%, transparent)`,
            background:   `color-mix(in srgb, ${fleetStatus.color} 10%, transparent)`,
          }}
        >
          <span
            className={`status-pill__dot${isAlert ? ' blink' : ''}`}
            style={{ background: fleetStatus.color, boxShadow: `0 0 8px ${fleetStatus.color}` }}
          />
          <span className="status-pill__text">{fleetStatus.text}</span>
        </div>

        <div className="top-bar__clock">
          <span className="clock-zulu">{zulu}</span>
          <span className="clock-local">{local} LT</span>
        </div>
      </div>
    </header>
  )
}
