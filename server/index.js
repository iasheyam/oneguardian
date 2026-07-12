import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })

import express from 'express'
import cors from 'cors'
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { db } from '../db/index.js'
import { users, invitations, employeeProfiles, activityLogs } from '../db/schema/users.js'
import { accounts, principals, vehicles, groups, groupMembers, devices } from '../db/schema/accounts.js'
import { eq, and, or, getTableColumns, desc, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { trackEvent } from './trackEvent.js'
import { startTraccar, getPositionCache, addSseClient, removeSseClient, fetchTraccarDevices, fetchTraccarPositions, createTraccarDevice, deleteTraccarDevice } from './traccar.js'
import { randomUUID } from 'node:crypto'

const app  = express()
const PORT = process.env.PORT || 3001

const cognito = new CognitoIdentityProviderClient({
  region: process.env.OG_REGION,
  credentials: {
    accessKeyId:     process.env.OG_ACCESS_KEY_ID,
    secretAccessKey: process.env.OG_SECRET_ACCESS_KEY,
  },
})

app.use(cors({
  origin: [
    'http://localhost:5173',
    process.env.FRONTEND_URL,
  ].filter(Boolean),
}))
app.use(express.json())

// Called after every successful Cognito login to provision the user in our DB
app.post('/api/auth/provision', async (req, res) => {
  const { cognitoSub, name, email } = req.body
  if (!cognitoSub || !email) {
    return res.status(400).json({ error: 'cognitoSub and email are required.' })
  }

  try {
    // If user exists, just update last login time
    const [existing] = await db.select().from(users).where(eq(users.cognitoSub, cognitoSub)).limit(1)
    if (existing) {
      const [updated] = await db.update(users)
        .set({ lastActiveAt: new Date() })
        .where(eq(users.id, existing.id))
        .returning()
      trackEvent({ event: 'user.login', description: `${existing.name} signed in`, actorId: existing.id })
      return res.json(updated)
    }

    // Pull role + name from the pending invitation if one exists
    const [invitation] = await db.select().from(invitations)
      .where(and(eq(invitations.email, email), eq(invitations.status, 'pending')))
      .limit(1)

    const [newUser] = await db.insert(users).values({
      cognitoSub,
      name:         invitation?.name ?? name ?? email,
      email,
      type:         invitation?.type ?? 'internal',
      role:         invitation?.role ?? 'Operator',
      addedBy:      invitation?.invitedBy ?? null,
      lastActiveAt: new Date(),
    }).returning()

    // Mark the invitation as accepted
    if (invitation) {
      await db.update(invitations)
        .set({ status: 'accepted', acceptedAt: new Date() })
        .where(eq(invitations.id, invitation.id))
    }

    trackEvent({ event: 'user.account_activated', description: `${newUser.name} activated their account`, actorId: newUser.id })
    res.json(newUser)
  } catch (err) {
    console.error('Provision error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/users', async (req, res) => {
  const { name, email, inviterSub } = req.body
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required.' })
  }

  try {
    // Resolve the inviter's internal UUID and name from their Cognito sub
    let invitedBy   = null
    let inviterName = null
    if (inviterSub) {
      const [inviter] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.cognitoSub, inviterSub)).limit(1)
      invitedBy   = inviter?.id   ?? null
      inviterName = inviter?.name ?? null
    }

    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Username: email,
      UserAttributes: [
        { Name: 'name',           Value: name  },
        { Name: 'email',          Value: email },
        { Name: 'email_verified', Value: 'true' },
      ],
      DesiredDeliveryMediums: ['EMAIL'],
    }))

    const [invitation] = await db.insert(invitations).values({
      email,
      name,
      type:      req.body.type ?? 'internal',
      role:      req.body.role ?? 'Operator',
      invitedBy,
    }).returning()

    trackEvent({
      event:       'user.invite_sent',
      description: `${inviterName ?? 'System'} invited ${name}`,
      actorId:     invitedBy,
      metadata:    { email, role: invitation.role, type: invitation.type },
    })

    res.json({
      id:     invitation.id,
      name,
      email,
      role:   invitation.role,
      status: 'pending',
    })
  } catch (err) {
    if (err.name === 'UsernameExistsException' || err.cause?.code === '23505') {
      return res.status(409).json({ error: 'A user with this email already exists.' })
    }
    console.error('AdminCreateUser error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/users/:id', async (req, res) => {
  const { id } = req.params
  const { name, email, phone, role, twoFactor, jobTitle, department, employeeId, actorSub } = req.body
  try {
    // Fetch current user before update so we can detect role changes
    const [current] = await db.select().from(users).where(eq(users.id, id)).limit(1)
    if (!current) return res.status(404).json({ error: 'User not found.' })

    // Resolve actor from their Cognito sub
    let actorId   = null
    let actorName = null
    if (actorSub) {
      const [actor] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.cognitoSub, actorSub)).limit(1)
      actorId   = actor?.id   ?? null
      actorName = actor?.name ?? null
    }

    const [updated] = await db.update(users)
      .set({
        ...(name      !== undefined && { name }),
        ...(email     !== undefined && { email }),
        ...(phone     !== undefined && { phone }),
        ...(role      !== undefined && { role }),
        ...(twoFactor !== undefined && { twoFactor }),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning()

    if (jobTitle !== undefined || department !== undefined || employeeId !== undefined) {
      await db.insert(employeeProfiles)
        .values({ userId: id, jobTitle, department, employeeId })
        .onConflictDoUpdate({
          target: employeeProfiles.userId,
          set: {
            ...(jobTitle    !== undefined && { jobTitle }),
            ...(department  !== undefined && { department }),
            ...(employeeId  !== undefined && { employeeId }),
          },
        })
    }

    // Track role change separately with from/to metadata
    if (role !== undefined && role !== current.role) {
      trackEvent({
        event:       'member.role_changed',
        description: `${actorName ?? 'System'} changed role of ${current.name} from ${current.role} to ${role}`,
        actorId,
        subjectId:   id,
        metadata:    { from: current.role, to: role },
      })
    }

    // Track general profile update (for any non-role field changes)
    const profileFields = [name, email, phone, twoFactor, jobTitle, department, employeeId]
      .map((v, i) => v !== undefined ? ['name','email','phone','twoFactor','jobTitle','department','employeeId'][i] : null)
      .filter(Boolean)
    if (profileFields.length > 0) {
      trackEvent({
        event:       'member.updated',
        description: `${actorName ?? 'System'} updated profile of ${current.name}`,
        actorId,
        subjectId:   id,
        metadata:    { fields: profileFields },
      })
    }

    res.json(updated)
  } catch (err) {
    console.error('Update user error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/users', async (req, res) => {
  try {
    const result = await db
      .select({
        ...getTableColumns(users),
        jobTitle:   employeeProfiles.jobTitle,
        department: employeeProfiles.department,
        employeeId: employeeProfiles.employeeId,
      })
      .from(users)
      .leftJoin(employeeProfiles, eq(employeeProfiles.userId, users.id))
    res.json(result)
  } catch (err) {
    console.error('Get users error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/invitations/:id/resend', async (req, res) => {
  try {
    const [invitation] = await db.select().from(invitations).where(eq(invitations.id, req.params.id)).limit(1)
    if (!invitation) return res.status(404).json({ error: 'Invitation not found.' })

    await cognito.send(new AdminCreateUserCommand({
      UserPoolId:    process.env.COGNITO_USER_POOL_ID,
      Username:      invitation.email,
      MessageAction: 'RESEND',
    }))

    trackEvent({
      event:       'user.invite_sent',
      description: `Invitation resent to ${invitation.name} (${invitation.email})`,
      metadata:    { email: invitation.email, role: invitation.role, resend: true },
    })

    res.json({ ok: true })
  } catch (err) {
    console.error('Resend invite error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/invitations', async (req, res) => {
  try {
    const result = await db.select().from(invitations).where(eq(invitations.status, 'pending'))
    res.json(result)
  } catch (err) {
    console.error('Get invitations error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/users/:id/logs', async (req, res) => {
  try {
    const { id } = req.params
    const actor   = alias(users, 'actor')
    const subject = alias(users, 'subject')

    const rows = await db
      .select({
        id:          activityLogs.id,
        event:       activityLogs.event,
        description: activityLogs.description,
        createdAt:   activityLogs.createdAt,
        actorId:     activityLogs.actorId,
        actorName:   actor.name,
        subjectId:   activityLogs.subjectId,
        subjectName: subject.name,
      })
      .from(activityLogs)
      .leftJoin(actor,   eq(activityLogs.actorId,   actor.id))
      .leftJoin(subject, eq(activityLogs.subjectId, subject.id))
      .where(or(eq(activityLogs.actorId, id), eq(activityLogs.subjectId, id)))
      .orderBy(desc(activityLogs.createdAt))
      .limit(100)

    res.json(rows.map(r => ({
      id:          r.id,
      event:       r.event,
      description: r.description,
      createdAt:   r.createdAt,
      actor:   r.actorId   ? { id: r.actorId,   name: r.actorName   } : null,
      subject: r.subjectId ? { id: r.subjectId, name: r.subjectName } : null,
    })))
  } catch (err) {
    console.error('Get user logs error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/logs', async (req, res) => {
  try {
    const actor   = alias(users, 'actor')
    const subject = alias(users, 'subject')

    const rows = await db
      .select({
        id:          activityLogs.id,
        event:       activityLogs.event,
        description: activityLogs.description,
        metadata:    activityLogs.metadata,
        createdAt:   activityLogs.createdAt,
        actorId:     activityLogs.actorId,
        actorName:   actor.name,
        subjectId:   activityLogs.subjectId,
        subjectName: subject.name,
      })
      .from(activityLogs)
      .leftJoin(actor,   eq(activityLogs.actorId,   actor.id))
      .leftJoin(subject, eq(activityLogs.subjectId, subject.id))
      .orderBy(desc(activityLogs.createdAt))
      .limit(500)

    res.json(rows.map(r => ({
      id:          r.id,
      event:       r.event,
      description: r.description,
      metadata:    r.metadata,
      createdAt:   r.createdAt,
      actor:   r.actorId   ? { id: r.actorId,   name: r.actorName   } : null,
      subject: r.subjectId ? { id: r.subjectId, name: r.subjectName } : null,
    })))
  } catch (err) {
    console.error('Get logs error:', err)
    res.status(500).json({ error: err.message })
  }
})

/* ── accounts helpers ─────────────────────────────────────────── */
function serializeDevice(d) {
  return {
    id: d.id, name: d.name, type: d.type, model: d.model, serial: d.serial,
    imei: d.imei, firmware: d.firmware, status: d.status, traccarDeviceId: d.traccarDeviceId,
  }
}

async function buildAccount(account) {
  const id = account.id
  const ps  = await db.select().from(principals).where(eq(principals.accountId, id))
  const vs  = await db.select().from(vehicles).where(eq(vehicles.accountId, id))
  const gs  = await db.select().from(groups).where(eq(groups.accountId, id))
  const gms = gs.length
    ? await db.select().from(groupMembers).where(inArray(groupMembers.groupId, gs.map(g => g.id)))
    : []

  const devConditions = []
  if (ps.length) devConditions.push(inArray(devices.principalId, ps.map(p => p.id)))
  if (vs.length) devConditions.push(inArray(devices.vehicleId,   vs.map(v => v.id)))
  const allDevices = devConditions.length
    ? await db.select().from(devices).where(or(...devConditions))
    : []

  const units = [
    ...ps.map(p => ({
      id: p.id, type: 'person',
      name: p.name, role: p.role, phone: p.phone, email: p.email,
      status: p.status, photoKey: p.photoKey,
      devices: allDevices.filter(d => d.principalId === p.id).map(serializeDevice),
      emergency: {
        dob: p.dob, height: p.height, bloodGroup: p.bloodGroup,
        allergies: p.allergies, conditions: p.conditions, medications: p.medications,
        contactName: p.emergContactName, contactPhone: p.emergContactPhone,
        contactRelation: p.emergContactRelation,
      },
    })),
    ...vs.map(v => ({
      id: v.id, type: 'vehicle',
      name: v.callsign, make: v.make, model: v.model,
      plate: v.plate, armorLevel: v.armorLevel,
      status: v.status, photoKey: v.photoKey,
      devices: allDevices.filter(d => d.vehicleId === v.id).map(serializeDevice),
    })),
  ]

  return {
    ...account,
    contact: { name: account.contactName, email: account.contactEmail, phone: account.contactPhone },
    units,
    groups: gs.map(g => ({
      id: g.id, name: g.name,
      unitIds: gms.filter(m => m.groupId === g.id).map(m => m.principalId ?? m.vehicleId).filter(Boolean),
    })),
  }
}

/* ── accounts ─────────────────────────────────────────────────── */
app.get('/api/accounts', async (req, res) => {
  try {
    const accs = await db.select().from(accounts).orderBy(desc(accounts.createdAt))
    const full = await Promise.all(accs.map(buildAccount))
    res.json(full)
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.post('/api/accounts', async (req, res) => {
  const { name, type, industry, status, contactName, contactEmail, contactPhone } = req.body
  try {
    const [acc] = await db.insert(accounts).values({ name, type, industry, status, contactName, contactEmail, contactPhone }).returning()
    res.json(await buildAccount(acc))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.patch('/api/accounts/:id', async (req, res) => {
  const { name, type, industry, status, contactName, contactEmail, contactPhone } = req.body
  try {
    const [acc] = await db.update(accounts).set({
      ...(name         !== undefined && { name }),
      ...(type         !== undefined && { type }),
      ...(industry     !== undefined && { industry }),
      ...(status       !== undefined && { status }),
      ...(contactName  !== undefined && { contactName }),
      ...(contactEmail !== undefined && { contactEmail }),
      ...(contactPhone !== undefined && { contactPhone }),
      updatedAt: new Date(),
    }).where(eq(accounts.id, req.params.id)).returning()
    res.json(await buildAccount(acc))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.delete('/api/accounts/:id', async (req, res) => {
  try {
    await db.delete(accounts).where(eq(accounts.id, req.params.id))
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

/* ── principals ───────────────────────────────────────────────── */
app.post('/api/accounts/:accountId/principals', async (req, res) => {
  const { name, role, phone, email, status, emergency } = req.body
  try {
    const [p] = await db.insert(principals).values({
      accountId: req.params.accountId, name, role, phone, email, status: status ?? 'normal',
      dob: emergency?.dob, height: emergency?.height, bloodGroup: emergency?.bloodGroup,
      allergies: emergency?.allergies, conditions: emergency?.conditions, medications: emergency?.medications,
      emergContactName: emergency?.contactName, emergContactPhone: emergency?.contactPhone,
      emergContactRelation: emergency?.contactRelation,
    }).returning()
    res.json({ id: p.id, type: 'person', name: p.name, role: p.role, phone: p.phone, email: p.email, status: p.status, devices: [], emergency: emergency ?? {} })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.patch('/api/accounts/:accountId/principals/:id', async (req, res) => {
  const { name, role, phone, email, status, emergency } = req.body
  try {
    const [p] = await db.update(principals).set({
      ...(name   !== undefined && { name }),
      ...(role   !== undefined && { role }),
      ...(phone  !== undefined && { phone }),
      ...(email  !== undefined && { email }),
      ...(status !== undefined && { status }),
      ...(emergency !== undefined && {
        dob: emergency.dob, height: emergency.height, bloodGroup: emergency.bloodGroup,
        allergies: emergency.allergies, conditions: emergency.conditions, medications: emergency.medications,
        emergContactName: emergency.contactName, emergContactPhone: emergency.contactPhone,
        emergContactRelation: emergency.contactRelation,
      }),
      updatedAt: new Date(),
    }).where(eq(principals.id, req.params.id)).returning()
    res.json({ id: p.id, type: 'person', name: p.name, role: p.role, phone: p.phone, email: p.email, status: p.status, devices: [], emergency: emergency ?? {} })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.delete('/api/accounts/:accountId/principals/:id', async (req, res) => {
  try {
    await db.delete(principals).where(eq(principals.id, req.params.id))
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

/* ── vehicles ─────────────────────────────────────────────────── */
app.post('/api/accounts/:accountId/vehicles', async (req, res) => {
  const { name, make, model, plate, armorLevel, status } = req.body
  try {
    const [v] = await db.insert(vehicles).values({
      accountId: req.params.accountId, callsign: name, make, model, plate, armorLevel, status: status ?? 'normal',
    }).returning()
    res.json({ id: v.id, type: 'vehicle', name: v.callsign, make: v.make, model: v.model, plate: v.plate, armorLevel: v.armorLevel, status: v.status, devices: [] })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.patch('/api/accounts/:accountId/vehicles/:id', async (req, res) => {
  const { name, make, model, plate, armorLevel, status } = req.body
  try {
    const [v] = await db.update(vehicles).set({
      ...(name       !== undefined && { callsign: name }),
      ...(make       !== undefined && { make }),
      ...(model      !== undefined && { model }),
      ...(plate      !== undefined && { plate }),
      ...(armorLevel !== undefined && { armorLevel }),
      ...(status     !== undefined && { status }),
      updatedAt: new Date(),
    }).where(eq(vehicles.id, req.params.id)).returning()
    res.json({ id: v.id, type: 'vehicle', name: v.callsign, make: v.make, model: v.model, plate: v.plate, armorLevel: v.armorLevel, status: v.status, devices: [] })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.delete('/api/accounts/:accountId/vehicles/:id', async (req, res) => {
  try {
    await db.delete(vehicles).where(eq(vehicles.id, req.params.id))
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

/* ── groups ───────────────────────────────────────────────────── */
app.post('/api/accounts/:accountId/groups', async (req, res) => {
  try {
    const [g] = await db.insert(groups).values({ accountId: req.params.accountId, name: req.body.name }).returning()
    res.json({ id: g.id, name: g.name, unitIds: [] })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.patch('/api/accounts/:accountId/groups/:id', async (req, res) => {
  try {
    const [g] = await db.update(groups).set({ name: req.body.name }).where(eq(groups.id, req.params.id)).returning()
    res.json({ id: g.id, name: g.name })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.delete('/api/accounts/:accountId/groups/:id', async (req, res) => {
  try {
    await db.delete(groups).where(eq(groups.id, req.params.id))
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

/* ── group members ────────────────────────────────────────────── */
app.post('/api/accounts/:accountId/groups/:groupId/members', async (req, res) => {
  const { principalId, vehicleId } = req.body
  try {
    await db.insert(groupMembers).values({ groupId: req.params.groupId, principalId: principalId ?? null, vehicleId: vehicleId ?? null })
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.delete('/api/accounts/:accountId/groups/:groupId/members', async (req, res) => {
  const { principalId, vehicleId } = req.body
  try {
    if (principalId) {
      await db.delete(groupMembers).where(and(eq(groupMembers.groupId, req.params.groupId), eq(groupMembers.principalId, principalId)))
    } else if (vehicleId) {
      await db.delete(groupMembers).where(and(eq(groupMembers.groupId, req.params.groupId), eq(groupMembers.vehicleId, vehicleId)))
    }
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

/* ── devices ──────────────────────────────────────────────────── */
app.post('/api/accounts/:accountId/units/:unitId/devices', async (req, res) => {
  const { unitId } = req.params
  const { name, type, model, serial, imei, firmware, status } = req.body
  try {
    const [p] = await db.select().from(principals).where(eq(principals.id, unitId)).limit(1)

    let traccarDeviceId = null
    try {
      const uniqueId = imei || serial || randomUUID()
      const td = await createTraccarDevice(name, uniqueId)
      traccarDeviceId = String(td.id)
    } catch (err) {
      console.warn('[traccar] Could not register device in Traccar:', err.message)
    }

    const [d] = await db.insert(devices).values({
      principalId: p ? unitId : null,
      vehicleId:   p ? null   : unitId,
      name, type: type ?? 'gps', model, serial, imei, firmware,
      status: status ?? 'online', traccarDeviceId,
    }).returning()
    res.json(serializeDevice(d))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.patch('/api/accounts/:accountId/units/:unitId/devices/:deviceId', async (req, res) => {
  const { name, type, model, serial, imei, firmware, status, traccarDeviceId } = req.body
  try {
    const [d] = await db.update(devices).set({
      ...(name             !== undefined && { name }),
      ...(type             !== undefined && { type }),
      ...(model            !== undefined && { model }),
      ...(serial           !== undefined && { serial }),
      ...(imei             !== undefined && { imei }),
      ...(firmware         !== undefined && { firmware }),
      ...(status           !== undefined && { status }),
      ...(traccarDeviceId  !== undefined && { traccarDeviceId }),
      updatedAt: new Date(),
    }).where(eq(devices.id, req.params.deviceId)).returning()
    res.json(serializeDevice(d))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.delete('/api/accounts/:accountId/units/:unitId/devices/:deviceId', async (req, res) => {
  try {
    const [d] = await db.select().from(devices).where(eq(devices.id, req.params.deviceId)).limit(1)
    if (d?.traccarDeviceId) {
      try {
        await deleteTraccarDevice(Number(d.traccarDeviceId))
      } catch (err) {
        console.warn('[traccar] Could not remove device from Traccar:', err.message)
      }
    }
    await db.delete(devices).where(eq(devices.id, req.params.deviceId))
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

/* ── traccar ──────────────────────────────────────────────────── */
app.get('/api/live', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection',    'keep-alive')
  res.flushHeaders()

  // Send current position cache immediately on connect
  res.write(`data: ${JSON.stringify({ type: 'snapshot', positions: getPositionCache() })}\n\n`)

  addSseClient(res)
  req.on('close', () => removeSseClient(res))
})

app.get('/api/traccar/devices', async (req, res) => {
  try {
    res.json(await fetchTraccarDevices())
  } catch (err) {
    console.error('[traccar] devices error:', err.message)
    res.status(502).json({ error: err.message })
  }
})

app.get('/api/traccar/positions/:deviceId', async (req, res) => {
  try {
    const { from, to } = req.query
    res.json(await fetchTraccarPositions(req.params.deviceId, from, to))
  } catch (err) {
    console.error('[traccar] positions error:', err.message)
    res.status(502).json({ error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`API server → http://localhost:${PORT}`)
  startTraccar()
})
