import { eq, and, or, isNotNull } from 'drizzle-orm'
import { db, devices, principals, vehicles } from '../db/index.js'
import { zones } from '../db/schema/zones.js'
import { places } from '../db/schema/plans.js'
import { geojsonToWkt, circleToWkt } from './utils/geo.js'
import { fetchTraccarDevices } from './traccar.js'

const TRACCAR_URL  = process.env.TRACCAR_URL
const TRACCAR_USER = process.env.TRACCAR_USER
const TRACCAR_PASS = process.env.TRACCAR_PASS

function basicAuth() {
  return Buffer.from(`${TRACCAR_USER}:${TRACCAR_PASS}`).toString('base64')
}

function jsonHeaders() {
  return { Authorization: `Basic ${basicAuth()}`, 'Content-Type': 'application/json' }
}

// ─── Geofence CRUD ────────────────────────────────────────────────────────────

async function createGeofence(name, area, description = '') {
  const res = await fetch(`${TRACCAR_URL}/api/geofences`, {
    method:  'POST',
    headers: jsonHeaders(),
    body:    JSON.stringify({ name, description, area }),
  })
  if (!res.ok) throw new Error(`Traccar create geofence failed: ${res.status}`)
  const data = await res.json()
  return data.id  // integer Traccar geofence ID
}

async function updateGeofence(traccarGeofenceId, name, area, description = '') {
  const res = await fetch(`${TRACCAR_URL}/api/geofences/${traccarGeofenceId}`, {
    method:  'PUT',
    headers: jsonHeaders(),
    body:    JSON.stringify({ id: traccarGeofenceId, name, description, area }),
  })
  if (!res.ok) throw new Error(`Traccar update geofence failed: ${res.status}`)
}

export async function deleteGeofence(traccarGeofenceId) {
  if (!traccarGeofenceId) return
  const res = await fetch(`${TRACCAR_URL}/api/geofences/${traccarGeofenceId}`, {
    method:  'DELETE',
    headers: { Authorization: `Basic ${basicAuth()}` },
  })
  if (!res.ok) throw new Error(`Traccar delete geofence failed: ${res.status}`)
}

// ─── Zone sync ────────────────────────────────────────────────────────────────

// Creates or updates a Traccar geofence for a zone. Returns the traccarGeofenceId.
export async function upsertGeofenceForZone(zone) {
  const area = geojsonToWkt(zone.geometry)
  if (zone.traccarGeofenceId) {
    await updateGeofence(zone.traccarGeofenceId, zone.name, area, zone.description ?? '')
    return zone.traccarGeofenceId
  }
  return createGeofence(zone.name, area, zone.description ?? '')
}

// ─── Place sync ───────────────────────────────────────────────────────────────

// Creates or updates a Traccar geofence for a place (circle). Returns the traccarGeofenceId.
export async function upsertGeofenceForPlace(place) {
  const area = circleToWkt(place.longitude, place.latitude, place.radius)
  if (place.traccarGeofenceId) {
    await updateGeofence(place.traccarGeofenceId, place.name, area)
    return place.traccarGeofenceId
  }
  return createGeofence(place.name, area)
}

// ─── Device linking ───────────────────────────────────────────────────────────

// Link a single device to a geofence. 400 = already linked, silently ignored.
export async function linkGeofenceToDevice(traccarGeofenceId, traccarDeviceId) {
  const res = await fetch(`${TRACCAR_URL}/api/permissions`, {
    method:  'POST',
    headers: jsonHeaders(),
    body:    JSON.stringify({
      deviceId:   parseInt(traccarDeviceId, 10),
      geofenceId: traccarGeofenceId,
    }),
  })
  if (!res.ok && res.status !== 400) {
    throw new Error(`Traccar link geofence→device failed: ${res.status}`)
  }
}

// Link a new device to all existing zone geofences (global) + account place geofences.
export async function linkDeviceToAllGeofences(traccarDeviceId, accountId) {
  const [allZones, accountPlaces] = await Promise.all([
    db.select({ traccarGeofenceId: zones.traccarGeofenceId })
      .from(zones)
      .where(isNotNull(zones.traccarGeofenceId)),
    db.select({ traccarGeofenceId: places.traccarGeofenceId })
      .from(places)
      .where(and(eq(places.accountId, accountId), isNotNull(places.traccarGeofenceId))),
  ])

  const geofenceIds = [
    ...allZones.map(z => z.traccarGeofenceId),
    ...accountPlaces.map(p => p.traccarGeofenceId),
  ]

  await Promise.allSettled(
    geofenceIds.map(gid => linkGeofenceToDevice(gid, traccarDeviceId))
  )
}

// Link a geofence to every device currently in Traccar (for global zones).
export async function linkGeofenceToAllDevices(traccarGeofenceId) {
  const traccarDevices = await fetchTraccarDevices()
  await Promise.allSettled(
    traccarDevices.map(d => linkGeofenceToDevice(traccarGeofenceId, d.id))
  )
}

// Link a geofence to all devices that belong to a specific account (for places).
export async function linkGeofenceToAccountDevices(traccarGeofenceId, accountId) {
  const rows = await db
    .select({ traccarDeviceId: devices.traccarDeviceId })
    .from(devices)
    .leftJoin(principals, eq(devices.principalId, principals.id))
    .leftJoin(vehicles,   eq(devices.vehicleId,   vehicles.id))
    .where(
      and(
        or(
          eq(principals.accountId, accountId),
          eq(vehicles.accountId,   accountId),
        ),
        isNotNull(devices.traccarDeviceId),
      )
    )

  await Promise.allSettled(
    rows.map(r => linkGeofenceToDevice(traccarGeofenceId, r.traccarDeviceId))
  )
}
