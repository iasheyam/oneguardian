// Convert GeoJSON Polygon or MultiPolygon to WKT — Traccar's geofence area format

function ringToWkt(ring) {
  return ring.map(([lng, lat]) => `${lat} ${lng}`).join(', ')
}

function polygonToWkt(coordinates) {
  return `(${coordinates.map(ring => `(${ringToWkt(ring)})`).join(', ')})`
}

export function geojsonToWkt(geometry) {
  if (geometry.type === 'Polygon') {
    return `POLYGON ${polygonToWkt(geometry.coordinates)}`
  }
  if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates.map(polygonToWkt).join(', ')
    return `MULTIPOLYGON (${polys})`
  }
  throw new Error(`Unsupported geometry type: ${geometry.type}`)
}

// Traccar's native circle format — no polygon approximation needed
export function circleToWkt(lng, lat, radiusMeters) {
  return `CIRCLE (${lat} ${lng}, ${radiusMeters})`
}
