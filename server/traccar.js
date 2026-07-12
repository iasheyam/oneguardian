import WebSocket from 'ws'

const TRACCAR_URL  = process.env.TRACCAR_URL
const TRACCAR_USER = process.env.TRACCAR_USER
const TRACCAR_PASS = process.env.TRACCAR_PASS

const basicAuth = Buffer.from(`${TRACCAR_USER}:${TRACCAR_PASS}`).toString('base64')

// Latest position per Traccar device ID
const positionCache = new Map()

// Connected SSE clients
const sseClients = new Set()

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`
  for (const res of sseClients) {
    try { res.write(msg) } catch {}
  }
}

// Traccar WebSocket requires a session cookie, not Basic Auth
async function getSessionCookie() {
  const res = await fetch(`${TRACCAR_URL}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `email=${encodeURIComponent(TRACCAR_USER)}&password=${encodeURIComponent(TRACCAR_PASS)}`,
  })
  if (!res.ok) throw new Error(`Traccar login failed: ${res.status}`)
  const cookie = res.headers.get('set-cookie')
  if (!cookie) throw new Error('No session cookie in Traccar login response')
  return cookie.split(';')[0] // just the JSESSIONID=... part
}

async function connect() {
  let cookie
  try {
    cookie = await getSessionCookie()
    console.log('[traccar] session obtained')
  } catch (err) {
    console.error('[traccar] login error:', err.message)
    setTimeout(connect, 5000)
    return
  }

  const wsUrl = TRACCAR_URL.replace(/^http/, 'ws')
  const ws = new WebSocket(`${wsUrl}/api/socket`, {
    headers: { Cookie: cookie },
  })

  ws.on('open', () => console.log('[traccar] WebSocket connected'))

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw)

      if (msg.positions?.length) {
        for (const pos of msg.positions) {
          positionCache.set(pos.deviceId, pos)
        }
        broadcast({ type: 'positions', positions: msg.positions })
      }

      if (msg.devices?.length) {
        broadcast({ type: 'devices', devices: msg.devices })
      }

      if (msg.events?.length) {
        broadcast({ type: 'events', events: msg.events })
      }
    } catch (err) {
      console.error('[traccar] parse error:', err.message)
    }
  })

  ws.on('close', () => {
    console.log('[traccar] WebSocket closed — reconnecting in 5s')
    setTimeout(connect, 5000)
  })

  ws.on('error', err => console.error('[traccar] WebSocket error:', err.message))
}

export function startTraccar() {
  if (!TRACCAR_URL || !TRACCAR_USER || !TRACCAR_PASS) {
    console.warn('[traccar] Missing env vars — skipping Traccar connection')
    return
  }
  connect()
}

export function getPositionCache() {
  return Object.fromEntries(positionCache)
}

export function addSseClient(res) {
  sseClients.add(res)
}

export function removeSseClient(res) {
  sseClients.delete(res)
}

export async function createTraccarDevice(name, uniqueId) {
  const res = await fetch(`${TRACCAR_URL}/api/devices`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, uniqueId }),
  })
  if (!res.ok) throw new Error(`Traccar create device failed: ${res.status}`)
  return res.json()
}

export async function deleteTraccarDevice(traccarId) {
  const res = await fetch(`${TRACCAR_URL}/api/devices/${traccarId}`, {
    method: 'DELETE',
    headers: { Authorization: `Basic ${basicAuth}` },
  })
  if (!res.ok) throw new Error(`Traccar delete device failed: ${res.status}`)
}

export async function fetchTraccarDevices() {
  const res = await fetch(`${TRACCAR_URL}/api/devices`, {
    headers: { Authorization: `Basic ${basicAuth}` },
  })
  if (!res.ok) throw new Error(`Traccar responded ${res.status}`)
  return res.json()
}

export async function fetchTraccarPositions(deviceId, from, to) {
  const url = new URL(`${TRACCAR_URL}/api/positions`)
  url.searchParams.set('deviceId', deviceId)
  if (from) url.searchParams.set('from', from)
  if (to)   url.searchParams.set('to',   to)
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${basicAuth}` },
  })
  if (!res.ok) throw new Error(`Traccar responded ${res.status}`)
  return res.json()
}
