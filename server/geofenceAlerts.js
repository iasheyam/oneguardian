import { db } from '../db/index.js'
import { triggers, alerts } from '../db/schema/alerts.js'
import { zones } from '../db/schema/zones.js'
import { principals, vehicles } from '../db/schema/accounts.js'
import { eq, inArray, sql } from 'drizzle-orm'
import { broadcast, broadcastToAccount } from './sse.js'
import { getDeviceEntry } from './triggerEngine.js'

// ── zone trigger cache ────────────────────────────────────────────────────────
// Map: `${triggerType}|${riskLevel}` → trigger row
const zoneTriggerCache = new Map()

// ── geofence → zone cache ─────────────────────────────────────────────────────
// Map: traccarGeofenceId (integer) → { id, name, riskLevel, enabled }
const zoneGeofenceCache = new Map()

// ── cooldown ──────────────────────────────────────────────────────────────────
// Map: `${triggerId}:${unitId}` → lastFiredAt ms
const cooldownMap = new Map()

function cooldownPassed(triggerId, unitId, cooldownSeconds) {
  if (cooldownSeconds === 0) return true
  const key  = `${triggerId}:${unitId}`
  const last = cooldownMap.get(key)
  if (!last) return true
  return Date.now() - last >= (cooldownSeconds ?? 900) * 1000
}

function markFired(triggerId, unitId) {
  cooldownMap.set(`${triggerId}:${unitId}`, Date.now())
}

// ── cache bootstrap ───────────────────────────────────────────────────────────

export async function loadZoneTriggerCache() {
  try {
    const zoneTriggers = await db.select().from(triggers)
      .where(inArray(triggers.triggerType, ['zone_entry', 'zone_exit']))

    zoneTriggerCache.clear()
    for (const t of zoneTriggers) {
      const riskLevel = t.conditions?.riskLevel
      if (riskLevel) zoneTriggerCache.set(`${t.triggerType}|${riskLevel}`, t)
    }

    const allZones = await db.select({
      id:                zones.id,
      name:              zones.name,
      riskLevel:         zones.riskLevel,
      enabled:           zones.enabled,
      traccarGeofenceId: zones.traccarGeofenceId,
    }).from(zones)

    zoneGeofenceCache.clear()
    for (const z of allZones) {
      if (z.traccarGeofenceId) zoneGeofenceCache.set(z.traccarGeofenceId, z)
    }

    console.log(`[geofenceAlerts] loaded — ${zoneTriggerCache.size} zone triggers, ${zoneGeofenceCache.size} synced zones`)
  } catch (err) {
    console.error('[geofenceAlerts] loadZoneTriggerCache failed:', err.message)
  }
}

// Call after POST/PATCH zone to keep the in-memory lookup current.
export function refreshZoneInCache(zone) {
  if (!zone.traccarGeofenceId) return
  if (zone.enabled === false) {
    zoneGeofenceCache.delete(zone.traccarGeofenceId)
  } else {
    zoneGeofenceCache.set(zone.traccarGeofenceId, {
      id:                zone.id,
      name:              zone.name,
      riskLevel:         zone.riskLevel,
      enabled:           zone.enabled,
      traccarGeofenceId: zone.traccarGeofenceId,
    })
  }
}

// Call after DELETE zone.
export function removeZoneFromCache(traccarGeofenceId) {
  if (traccarGeofenceId) zoneGeofenceCache.delete(traccarGeofenceId)
}

// ── event handler ─────────────────────────────────────────────────────────────
// Called from traccar.js for every geofenceEnter / geofenceExit WebSocket event.
// pos is the device's current position from positionCache (may be null).

export async function handleGeofenceEvent(event, pos) {
  const { type, deviceId, geofenceId } = event

  const zone = zoneGeofenceCache.get(geofenceId)
  if (!zone || !zone.enabled) return

  const triggerType = type === 'geofenceEnter' ? 'zone_entry' : 'zone_exit'
  const trigger = zoneTriggerCache.get(`${triggerType}|${zone.riskLevel}`)
  if (!trigger || !trigger.enabled) return

  const deviceEntry = getDeviceEntry(deviceId)
  if (!deviceEntry) return

  const { unitId, unitType, accountId } = deviceEntry

  if (!cooldownPassed(trigger.id, unitId, trigger.cooldownSeconds)) return
  markFired(trigger.id, unitId)

  try {
    const snapshot = pos
      ? { speed: pos.speed, latitude: pos.latitude, longitude: pos.longitude, attributes: pos.attributes ?? {} }
      : { speed: null, latitude: null, longitude: null, attributes: {} }

    let unitName = null
    try {
      if (unitType === 'principal') {
        const [p] = await db.select({ name: principals.name }).from(principals).where(eq(principals.id, unitId)).limit(1)
        unitName = p?.name ?? null
      } else {
        const [v] = await db.select({ callsign: vehicles.callsign }).from(vehicles).where(eq(vehicles.id, unitId)).limit(1)
        unitName = v?.callsign ?? null
      }
    } catch {}

    const [alert] = await db.insert(alerts).values({
      triggerId:    trigger.id,
      unitId,
      unitType,
      severity:     trigger.severity,
      position:     sql`${JSON.stringify(snapshot)}::jsonb`,
      isSimulation: false,
      firedAt:      new Date(),
      updatedAt:    new Date(),
    }).returning()

    const alertPayload = {
      ...alert,
      triggerName:   trigger.name,
      triggerType:   trigger.triggerType,
      zoneName:      zone.name,
      zoneRiskLevel: zone.riskLevel,
      unitName,
    }

    broadcast({ type: 'alert', alert: alertPayload })
    if (accountId) broadcastToAccount(accountId, { type: 'alert', alert: alertPayload })

    console.log(`[geofenceAlerts] ${trigger.name} → unit ${unitId} (zone: ${zone.name})`)
  } catch (err) {
    console.error('[geofenceAlerts] persist failed:', err.message)
  }
}
