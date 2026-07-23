import { db } from '../db/index.js'
import { triggers, triggerUnits, alerts } from '../db/schema/alerts.js'
import { devices, principals, vehicles } from '../db/schema/accounts.js'
import { eq, and, isNotNull, inArray, sql } from 'drizzle-orm'
import { broadcast, broadcastToAccount } from './sse.js'

// ── trigger cache ──────────────────────────────────────────────────────────
// Map: traccarDeviceId (number) → { unitId, unitType, accountId, triggers[] }
const triggerCache = new Map()

// ── unit → account lookup ──────────────────────────────────────────────────
// Map: unitId (uuid) → accountId (uuid)
const unitAccountCache = new Map()

export function getDeviceAccount(traccarDeviceId) {
  return triggerCache.get(traccarDeviceId)?.accountId ?? null
}

export function getDeviceEntry(traccarDeviceId) {
  const entry = triggerCache.get(traccarDeviceId)
  if (!entry) return null
  return { unitId: entry.unitId, unitType: entry.unitType, accountId: entry.accountId }
}

// ── cooldown tracking ──────────────────────────────────────────────────────
// Map: `${triggerId}:${unitId}` → lastFiredAt (ms timestamp)
const cooldownMap = new Map()

// ── EVALUATORS ─────────────────────────────────────────────────────────────
// Pure functions: (position, conditions) → boolean
// position shape from Traccar: { deviceId, speed, latitude, longitude, attributes: { ... } }

const EVALUATORS = {

  // ── Comparison triggers ────────────────────────────────────────────────────
  speed:            (pos, cond) => compare(pos.speed,                    cond),
  fuel:             (pos, cond) => compare(pos.attributes?.fuel,         cond),
  engine_temp:      (pos, cond) => compare(pos.attributes?.temp1,        cond),
  tracker_battery:  (pos, cond) => compare(pos.attributes?.batteryLevel, cond),
  cabin_temp:       (pos, cond) => compareRange(pos.attributes?.temp2,   cond),

  // ── Alarm flags — device firmware sets the alarm attribute ────────────────
  panic_button:        (pos) => pos.attributes?.alarm === 'sos',
  crash_detection:     (pos) => pos.attributes?.alarm === 'crash',
  rollover_detection:  (pos) => pos.attributes?.alarm === 'accident',
  gps_jamming:         (pos) => pos.attributes?.alarm === 'jamming',
  device_tampered:     (pos) => pos.attributes?.alarm === 'tampering',
  fall_detection:      (pos) => pos.attributes?.alarm === 'fall',
  duress_code:         (pos) => pos.attributes?.alarm === 'duress',
  loss_of_power:       (pos) => pos.attributes?.alarm === 'powerCut',
  low_tire_pressure:   (pos) => pos.attributes?.alarm === 'lowTirePressure',
  check_engine:        (pos) => pos.attributes?.alarm === 'checkEngine',
  door_open_moving:    (pos, cond) =>
    (pos.attributes?.door === true || pos.attributes?.door1 === true) &&
    pos.speed > (cond?.min_speed_kmh ?? 5),

  // ── TODO: Duration triggers ───────────────────────────────────────────────
  // Evaluated on a 30s interval, not on position updates.
  // Needs a motion-state cache tracking lastMovedAt, lastSeenAt, ignitionOn per unit.
  motionless:             null,
  device_offline:         null,
  idle_engine:            null,
  ignition_outside_hours: null,
  unauthorized_movement:  null,

  // ── TODO: Biometric triggers ──────────────────────────────────────────────
  // Come from a separate wearable data stream, not GPS positions.
  // Implement when we integrate biometric device support.
  heart_rate:       null,
  blood_pressure:   null,
  blood_oxygen:     null,
  wearable_battery: null,

  // ── TODO: Geofence triggers ───────────────────────────────────────────────
  // Needs geofence polygon data + point-in-polygon computation.
  // Implement when we add the geofences table.
  red_zone_entry: null,

  // ── TODO: Scheduled triggers ──────────────────────────────────────────────
  maintenance_due: null,
}

// ── comparison helpers ─────────────────────────────────────────────────────

function compare(value, cond) {
  if (value == null || !cond?.operator) return false
  switch (cond.operator) {
    case '>':  return value >  cond.value
    case '>=': return value >= cond.value
    case '<':  return value <  cond.value
    case '<=': return value <= cond.value
    case '==': return value === cond.value
    default:   return false
  }
}

function compareRange(value, cond) {
  if (value == null) return false
  if (cond.min !== undefined && value < cond.min) return true
  if (cond.max !== undefined && value > cond.max) return true
  return false
}

// ── cooldown ───────────────────────────────────────────────────────────────

function cooldownPassed(triggerId, unitId, cooldownSeconds) {
  if (cooldownSeconds === 0) return true // 0 = always fire
  const key  = `${triggerId}:${unitId}`
  const last = cooldownMap.get(key)
  if (!last) return true
  const threshold = (cooldownSeconds ?? 900) * 1000 // null = default 15 min
  return Date.now() - last >= threshold
}

function markFired(triggerId, unitId) {
  cooldownMap.set(`${triggerId}:${unitId}`, Date.now())
}

// ── fire alert ─────────────────────────────────────────────────────────────

function fireAlert(trigger, unitId, unitType, pos, isSimulation = false) {
  markFired(trigger.id, unitId)
  persistAlert(trigger, unitId, unitType, pos, isSimulation)
}

async function persistAlert(trigger, unitId, unitType, pos, isSimulation = false) {
  try {
    const snapshot = { speed: pos.speed, latitude: pos.latitude, longitude: pos.longitude, attributes: pos.attributes ?? {} }
    const [alert] = await db.insert(alerts).values({
      triggerId:    trigger.id,
      unitId,
      unitType,
      severity:     trigger.severity,
      position:     sql`${JSON.stringify(snapshot)}::jsonb`,
      isSimulation,
      firedAt:      new Date(),
      updatedAt:    new Date(),
    }).returning()
    const alertPayload = { ...alert, triggerName: trigger.name, triggerType: trigger.triggerType }
    broadcast({ type: 'alert', alert: alertPayload })
    const accountId = unitAccountCache.get(unitId)
    if (accountId) broadcastToAccount(accountId, { type: 'alert', alert: alertPayload })
  } catch (err) {
    console.error('[triggerEngine] persistAlert failed:', err.message)
  }
}

// ── position evaluator — called on every Traccar position update ───────────

// collector: optional array — filled with per-position results (used by simulation)
// isSimulation: marks persisted alerts as simulation in the DB
export function evaluatePositionTriggers(positions, collector = null, isSimulation = false) {
  for (const pos of positions) {
    const entry = triggerCache.get(pos.deviceId)
    if (!entry) {
      collector?.push({ deviceId: pos.deviceId, notInCache: true, fired: [], cooldown: [] })
      continue
    }

    const { unitId, unitType, triggers: unitTriggers } = entry
    const posResult = collector
      ? { deviceId: pos.deviceId, unitId, unitType, notInCache: false, fired: [], cooldown: [] }
      : null

    for (const trigger of unitTriggers) {
      if (!trigger.enabled) continue
      const evaluator = EVALUATORS[trigger.triggerType]
      if (!evaluator) continue
      if (!evaluator(pos, trigger.conditions)) continue

      if (cooldownPassed(trigger.id, unitId, trigger.cooldownSeconds)) {
        fireAlert(trigger, unitId, unitType, pos, isSimulation)
        posResult?.fired.push({ id: trigger.id, name: trigger.name, severity: trigger.severity, triggerType: trigger.triggerType })
      } else {
        posResult?.cooldown.push({ id: trigger.id, name: trigger.name, severity: trigger.severity, triggerType: trigger.triggerType })
      }
    }

    if (posResult) collector.push(posResult)
  }
}

// ── TODO: evaluateDurationTriggers ────────────────────────────────────────
// export function evaluateDurationTriggers() { ... }
// Call on setInterval(evaluateDurationTriggers, 30_000) from traccar.js.

// ── TODO: evaluateBiometricTriggers ──────────────────────────────────────
// export function evaluateBiometricTriggers(unitId, data) { ... }
// Call when biometric payload arrives from wearable integration.

// ── cache bootstrap ────────────────────────────────────────────────────────

export async function loadTriggerCache() {
  try {
    const allDevices = await db.select({
      traccarDeviceId: devices.traccarDeviceId,
      vehicleId:       devices.vehicleId,
      principalId:     devices.principalId,
    }).from(devices).where(isNotNull(devices.traccarDeviceId))

    if (allDevices.length === 0) {
      console.log('[triggerEngine] no devices with Traccar IDs — cache empty')
      return
    }

    const universalTriggers = await db.select().from(triggers)
      .where(and(eq(triggers.isUniversal, true), eq(triggers.enabled, true)))

    const assignments = await db.select({
      unitId:    triggerUnits.unitId,
      triggerId: triggerUnits.triggerId,
    }).from(triggerUnits)

    const customTriggers = await db.select().from(triggers)
      .where(and(eq(triggers.isUniversal, false), eq(triggers.enabled, true)))
    const customById = new Map(customTriggers.map(t => [t.id, t]))

    // Fetch accountIds for all units
    const vehicleIds   = allDevices.filter(d => d.vehicleId).map(d => d.vehicleId)
    const principalIds = allDevices.filter(d => d.principalId).map(d => d.principalId)
    const [vehicleAccounts, principalAccounts] = await Promise.all([
      vehicleIds.length
        ? db.select({ id: vehicles.id, accountId: vehicles.accountId }).from(vehicles).where(inArray(vehicles.id, vehicleIds))
        : Promise.resolve([]),
      principalIds.length
        ? db.select({ id: principals.id, accountId: principals.accountId }).from(principals).where(inArray(principals.id, principalIds))
        : Promise.resolve([]),
    ])
    const unitToAccount = new Map([
      ...vehicleAccounts.map(v => [v.id, v.accountId]),
      ...principalAccounts.map(p => [p.id, p.accountId]),
    ])

    triggerCache.clear()
    unitAccountCache.clear()

    for (const dev of allDevices) {
      const traccarId = parseInt(dev.traccarDeviceId, 10)
      if (isNaN(traccarId)) continue

      const unitId   = dev.vehicleId ?? dev.principalId
      const unitType = dev.vehicleId ? 'vehicle' : 'principal'
      if (!unitId) continue

      const accountId = unitToAccount.get(unitId) ?? null
      unitAccountCache.set(unitId, accountId)

      const universal = universalTriggers.filter(t =>
        t.unitType === unitType || t.unitType === 'both'
      )
      const custom = assignments
        .filter(a => a.unitId === unitId)
        .map(a => customById.get(a.triggerId))
        .filter(t => t && (t.unitType === unitType || t.unitType === 'both'))

      triggerCache.set(traccarId, { unitId, unitType, accountId, triggers: [...universal, ...custom] })
    }

    const total = [...triggerCache.values()].reduce((n, e) => n + e.triggers.length, 0)
    console.log(`[triggerEngine] loaded — ${triggerCache.size} devices, ${total} trigger slots`)
  } catch (err) {
    console.error('[triggerEngine] loadTriggerCache failed:', err.message)
  }
}

// Call after POST/DELETE /api/trigger-units to keep cache in sync
export async function refreshUnitInCache(unitId) {
  try {
    const unitDevices = await db.select({
      traccarDeviceId: devices.traccarDeviceId,
      vehicleId:       devices.vehicleId,
      principalId:     devices.principalId,
    }).from(devices).where(isNotNull(devices.traccarDeviceId))
      .then(rows => rows.filter(d => d.vehicleId === unitId || d.principalId === unitId))

    if (unitDevices.length === 0) return

    const universalTriggers = await db.select().from(triggers)
      .where(and(eq(triggers.isUniversal, true), eq(triggers.enabled, true)))

    const assignments = await db.select({ triggerId: triggerUnits.triggerId })
      .from(triggerUnits).where(eq(triggerUnits.unitId, unitId))

    const customTriggers = assignments.length
      ? await db.select().from(triggers)
          .where(and(eq(triggers.isUniversal, false), eq(triggers.enabled, true)))
      : []
    const customById = new Map(customTriggers.map(t => [t.id, t]))

    // Refresh accountId for this unit
    let accountId = unitAccountCache.get(unitId)
    if (!accountId) {
      const [p] = await db.select({ accountId: principals.accountId }).from(principals).where(eq(principals.id, unitId)).limit(1)
      const [v] = !p ? await db.select({ accountId: vehicles.accountId }).from(vehicles).where(eq(vehicles.id, unitId)).limit(1) : [null]
      accountId = p?.accountId ?? v?.accountId ?? null
    }
    if (accountId) unitAccountCache.set(unitId, accountId)

    for (const dev of unitDevices) {
      const traccarId = parseInt(dev.traccarDeviceId, 10)
      if (isNaN(traccarId)) continue

      const unitType  = dev.vehicleId ? 'vehicle' : 'principal'
      const universal = universalTriggers.filter(t => t.unitType === unitType || t.unitType === 'both')
      const custom    = assignments
        .map(a => customById.get(a.triggerId))
        .filter(t => t && (t.unitType === unitType || t.unitType === 'both'))

      triggerCache.set(traccarId, { unitId, unitType, accountId, triggers: [...universal, ...custom] })
    }
  } catch (err) {
    console.error('[triggerEngine] refreshUnitInCache failed:', err.message)
  }
}
