import { useState, useEffect, useRef } from 'react'
import { mockFeeds } from '../data/mockFeeds'
import './Feed.css'

import { UNIT_STATUS as UNIT_STATUS_META } from '../../../shared/constants/status.js'

const COLS_OPTIONS = [2, 3, 4]

export default function Feed() {
  const [filter,   setFilter]   = useState('all')
  const [cols,     setCols]     = useState(3)
  const [selected, setSelected] = useState(null)   // feed id in fullscreen

  const liveCount    = mockFeeds.filter(f => f.status === 'live').length
  const offlineCount = mockFeeds.filter(f => f.status === 'offline').length

  const visible = mockFeeds.filter(f =>
    filter === 'all'     ? true :
    filter === 'live'    ? f.status === 'live' :
    filter === 'offline' ? f.status === 'offline' : true
  )

  return (
    <div className="feed-page">
      {/* ── toolbar ────────────────────────── */}
      <div className="feed-toolbar">
        <div className="feed-toolbar__left">
          <span className="feed-toolbar__live">● {liveCount} live</span>
          <span className="feed-toolbar__offline">{offlineCount} offline</span>
        </div>

        <div className="feed-toolbar__filters">
          {['all', 'live', 'offline'].map(f => (
            <button
              key={f}
              className={`feed-filter-btn${filter === f ? ' active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="feed-toolbar__cols">
          {COLS_OPTIONS.map(n => (
            <button
              key={n}
              className={`feed-cols-btn${cols === n ? ' active' : ''}`}
              onClick={() => setCols(n)}
              title={`${n} columns`}
            >
              <GridIcon cols={n} />
            </button>
          ))}
        </div>
      </div>

      {/* ── grid ───────────────────────────── */}
      <div
        className="feed-grid"
        style={{ '--feed-cols': cols }}
      >
        {visible.map(feed => (
          <FeedTile key={feed.id} feed={feed} onOpen={() => setSelected(feed.id)} />
        ))}
      </div>

      {/* ── fullscreen overlay ──────────────── */}
      {selected && (
        <FeedFullscreen
          feed={mockFeeds.find(f => f.id === selected)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

/* ── feed tile ────────────────────────────────────────────────── */
function FeedTile({ feed, onOpen }) {
  const isLive   = feed.status === 'live'
  const unitMeta = UNIT_STATUS_META['offline']

  return (
    <div
      className={`feed-tile${!isLive ? ' feed-tile--offline' : ''}`}
      onClick={onOpen}
    >
      <div className="feed-tile__video">

        {/* simulated camera canvas */}
        <FeedCanvas isLive={isLive} seed={feed.seed} />

        {/* scan-line overlay */}
        <div className="feed-tile__scanlines" aria-hidden />

        {/* top overlay */}
        <div className="feed-tile__top">
          <div className="feed-tile__unit-info">
            <span
              className="feed-tile__unit-dot"
              style={{
                background: unitMeta.color,
                boxShadow: isLive ? `0 0 5px ${unitMeta.color}` : 'none',
              }}
            />
            <span className="feed-tile__unit-id">{feed.unitId}</span>
            <span className="feed-tile__callsign">{feed.callsign}</span>
            <span className="feed-tile__cam">{feed.camera}</span>
          </div>
          <span className={`feed-tile__badge${isLive ? ' live' : ' offline'}`}>
            {isLive ? '● LIVE' : '✕ OFFLINE'}
          </span>
        </div>

        {/* bottom overlay */}
        <div className="feed-tile__bottom">
          <span className="feed-tile__location">—</span>
          {isLive && <FeedClock />}
        </div>

        {/* offline message */}
        {!isLive && (
          <div className="feed-tile__no-signal">
            <span className="feed-tile__no-signal-text">NO SIGNAL</span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── fullscreen overlay ───────────────────────────────────────── */
function FeedFullscreen({ feed, onClose }) {
  const isLive   = feed.status === 'live'
  const unitMeta = UNIT_STATUS_META['offline']

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="feed-fs-overlay" onClick={onClose}>
      {/* stop click inside content from closing */}
      <div className="feed-fs-content" onClick={e => e.stopPropagation()}>

        <FeedCanvas isLive={isLive} seed={feed.seed} />
        <div className="feed-tile__scanlines" aria-hidden />

        {/* top overlay */}
        <div className="feed-fs-top">
          <div className="feed-tile__unit-info">
            <span
              className="feed-tile__unit-dot"
              style={{
                background: unitMeta.color,
                boxShadow: isLive ? `0 0 6px ${unitMeta.color}` : 'none',
              }}
            />
            <span className="feed-tile__unit-id">{feed.unitId}</span>
            <span className="feed-tile__callsign">{feed.callsign}</span>
            <span className="feed-tile__cam">{feed.camera}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className={`feed-tile__badge${isLive ? ' live' : ' offline'}`}>
              {isLive ? '● LIVE' : '✕ OFFLINE'}
            </span>
            <button className="feed-fs-close" onClick={onClose} title="Close (Esc)">
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* bottom overlay */}
        <div className="feed-fs-bottom">
          <div className="feed-fs-meta">
          </div>
          {isLive && <FeedClock />}
        </div>

        {!isLive && (
          <div className="feed-tile__no-signal">
            <span className="feed-tile__no-signal-text">NO SIGNAL</span>
          </div>
        )}
      </div>
    </div>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

/* ── canvas: simulated camera noise ──────────────────────────── */
function FeedCanvas({ isLive, seed }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W   = canvas.width
    const H   = canvas.height
    let tick  = 0
    let id

    // Seed-based brightness offset so feeds look distinct
    const baseOffset = (seed % 7) * 2

    function draw() {
      const img  = ctx.createImageData(W, H)
      const data = img.data

      if (isLive) {
        // Night-vision look: dark with green-tinted noise
        const pulse = Math.sin(tick * 0.04) * 4
        for (let y = 0; y < H; y++) {
          const scanFactor = (y % 4 === 0) ? 0.78 : 1
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4
            const n = Math.random() * 50 * scanFactor
            data[i]   = ((baseOffset + n * 0.18 + pulse) | 0)  // R
            data[i+1] = ((baseOffset + n * 0.70 + pulse) | 0)  // G — green dominant
            data[i+2] = ((baseOffset + n * 0.18 + pulse) | 0)  // B
            data[i+3] = 255
          }
        }
      } else {
        // Offline: grey static
        for (let i = 0; i < data.length; i += 4) {
          const v = (Math.random() * 55 + 15) | 0
          data[i] = data[i+1] = data[i+2] = v
          data[i+3] = 255
        }
      }

      ctx.putImageData(img, 0, 0)
      tick++
      id = setTimeout(draw, 120)
    }

    draw()
    return () => clearTimeout(id)
  }, [isLive, seed])

  return <canvas ref={canvasRef} className="feed-canvas" width={320} height={180} />
}

/* ── live clock ───────────────────────────────────────────────── */
function FeedClock() {
  const fmt  = () => new Date().toLocaleTimeString('en-US', { hour12: false })
  const [t, setT] = useState(fmt)

  useEffect(() => {
    const id = setInterval(() => setT(fmt()), 1000)
    return () => clearInterval(id)
  }, [])

  return <span className="feed-tile__time">{t}</span>
}

/* ── grid icon ────────────────────────────────────────────────── */
function GridIcon({ cols }) {
  const size = 12
  const gap  = 2
  const cell = cols === 2 ? 5 : cols === 3 ? 3 : 2
  const cells = Array.from({ length: cols * cols })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${12}`} aria-hidden>
      {cells.map((_, i) => {
        const row = Math.floor(i / cols)
        const col = i % cols
        const x   = col * (cell + gap)
        const y   = row * (cell + gap)
        return <rect key={i} x={x} y={y} width={cell} height={cell} rx="0.5" fill="currentColor" />
      })}
    </svg>
  )
}
