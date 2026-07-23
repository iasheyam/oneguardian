const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

export async function searchMapbox(q, sessionToken) {
  if (!q.trim()) return []
  const url = `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(q)}&access_token=${MAPBOX_TOKEN}&session_token=${sessionToken}&limit=5`
  const res  = await fetch(url)
  const data = await res.json()
  return data.suggestions ?? []
}

export async function retrieveMapbox(mapboxId, sessionToken) {
  const url  = `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(mapboxId)}?access_token=${MAPBOX_TOKEN}&session_token=${sessionToken}`
  const res  = await fetch(url)
  const data = await res.json()
  return data.features?.[0] ?? null
}
