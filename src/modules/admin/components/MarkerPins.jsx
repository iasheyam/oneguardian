import { useState, useEffect } from 'react'
import { Marker } from 'react-map-gl/mapbox'
import { apiFetch, apiUrl } from '../../../shared/utils/api'

const RISK_COLORS = {
  low:      '#22c55e',
  medium:   '#f59e0b',
  high:     '#f97316',
  critical: '#ef4444',
}

function MarkerPin({ color }) {
  return (
    <svg width="20" height="26" viewBox="0 0 20 26" fill="none" style={{ display: 'block' }}>
      <path d="M10 0C4.477 0 0 4.477 0 10c0 7.5 10 16 10 16S20 17.5 20 10C20 4.477 15.523 0 10 0z"
        fill={color} />
      <circle cx="10" cy="10" r="4" fill="white" fillOpacity="0.9" />
    </svg>
  )
}

export default function MarkerPins({ extra = [] }) {
  const [markers, setMarkers] = useState([])

  useEffect(() => {
    apiFetch(apiUrl('/api/markers'))
      .then(r => r.json())
      .then(data => setMarkers(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  const all = [...markers, ...extra]

  return all.filter(m => m.enabled !== false).map(m => (
    <Marker key={m.id} longitude={m.longitude} latitude={m.latitude} anchor="bottom">
      <div title={`${m.name}${m.category ? ` · ${m.category}` : ''}`}
        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))', cursor: 'default' }}>
        <MarkerPin color={RISK_COLORS[m.riskLevel] ?? RISK_COLORS.low} />
      </div>
    </Marker>
  ))
}
