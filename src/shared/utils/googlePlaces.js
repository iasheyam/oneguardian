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
