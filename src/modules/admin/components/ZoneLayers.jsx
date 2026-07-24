import { useState, useEffect, useMemo } from 'react'
import { Source, Layer } from 'react-map-gl/mapbox'
import { apiFetch, apiUrl } from '../../../shared/utils/api'

const RISK_COLORS = {
  low:      '#22c55e',
  medium:   '#f59e0b',
  high:     '#f97316',
  critical: '#ef4444',
}

export default function ZoneLayers() {
  const [zones, setZones] = useState([])

  useEffect(() => {
    apiFetch(apiUrl('/api/zones'))
      .then(r => r.json())
      .then(data => setZones(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  const geojson = useMemo(() => ({
    type: 'FeatureCollection',
    features: zones.filter(z => z.geometry && z.enabled).map(z => ({
      type:       'Feature',
      id:         z.id,
      geometry:   z.geometry,
      properties: { color: RISK_COLORS[z.riskLevel] ?? RISK_COLORS.low },
    })),
  }), [zones])

  return (
    <Source id="global-zones" type="geojson" data={geojson}>
      <Layer id="global-zones-fill" type="fill"
        paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': 0.15 }} />
      <Layer id="global-zones-outline" type="line"
        paint={{ 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 0.75 }} />
    </Source>
  )
}
