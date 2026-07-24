const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

// Returns normalized suggestions: [{ placeId, name, context }]
export async function searchGoogle(query, sessionToken) {
  if (!query.trim()) return []
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': [
        'suggestions.placePrediction.placeId',
        'suggestions.placePrediction.structuredFormat',
        'suggestions.placePrediction.text',
      ].join(','),
    },
    body: JSON.stringify({ input: query, sessionToken }),
  })
  const data = await res.json()
  if (!data.suggestions) return []
  return data.suggestions.map(s => {
    const p = s.placePrediction
    return {
      placeId: p.placeId,
      name:    p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
      context: p.structuredFormat?.secondaryText?.text ?? '',
    }
  })
}

// Returns { location: { latitude, longitude }, viewport: { low, high } } or null
export async function retrieveGoogle(placeId) {
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'location,viewport,displayName,formattedAddress',
      },
    }
  )
  const data = await res.json()
  if (data.error) return null
  return data
}

// Convert Google viewport to [minLng, minLat, maxLng, maxLat] for fitBounds
export function viewportToBbox(viewport) {
  if (!viewport?.low || !viewport?.high) return null
  const { low, high } = viewport
  return [low.longitude, low.latitude, high.longitude, high.latitude]
}

// Reverse geocode lat/lng → human-readable address string
export async function reverseGeocode(lat, lng) {
  const res  = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${API_KEY}`
  )
  const data = await res.json()
  if (data.status !== 'OK' || !data.results?.[0]) return null
  return data.results[0].formatted_address
}

// Resolve IANA timezone ID from coordinates (e.g. "America/Guatemala")
export async function getTimezoneId(lat, lng) {
  const ts  = Math.floor(Date.now() / 1000)
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${ts}&key=${API_KEY}`
  )
  const data = await res.json()
  if (data.status !== 'OK') return null
  return data.timeZoneId
}
