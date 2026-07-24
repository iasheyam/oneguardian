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
import { users, invitations, employeeProfiles, activityLogs, roles, rolePermissions } from '../db/schema/users.js'
import { accounts, principals, vehicles, groups, groupMembers, devices, userScopeAssignments } from '../db/schema/accounts.js'
import { triggers, triggerUnits, alerts } from '../db/schema/alerts.js'
import { places, plans, planUnits, planLegs } from '../db/schema/plans.js'
import { zones } from '../db/schema/zones.js'
import { markers } from '../db/schema/markers.js'
import { eq, and, or, getTableColumns, desc, inArray, ne, sql, isNotNull, gte, lte } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { trackEvent } from './trackEvent.js'
import { startTraccar, getPositionCache, fetchTraccarDevices, fetchTraccarPositions, createTraccarDevice, deleteTraccarDevice } from './traccar.js'
import { upsertGeofenceForZone, upsertGeofenceForPlace, deleteGeofence, linkGeofenceToAllDevices, linkGeofenceToAccountDevices, linkDeviceToAllGeofences } from './traccarGeofence.js'
import { addSseClient, removeSseClient, addClientSseClient, removeClientSseClient } from './sse.js'
import { loadTriggerCache, refreshUnitInCache, evaluatePositionTriggers, getDeviceAccount } from './triggerEngine.js'
import { loadZoneTriggerCache, refreshZoneInCache, removeZoneFromCache } from './geofenceAlerts.js'
import { authenticate, requirePermission } from './auth.js'
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

    // Resolve roleId: use invitation's roleId, else fall back to Operator
    let resolvedRoleId = invitation?.roleId ?? null
    if (!resolvedRoleId) {
      const [op] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, 'Operator')).limit(1)
      resolvedRoleId = op?.id ?? null
    }

    const [newUser] = await db.insert(users).values({
      cognitoSub,
      name:         invitation?.name ?? name ?? email,
      email,
      type:         invitation?.type ?? 'internal',
      roleId:       resolvedRoleId,
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

app.get('/api/me', authenticate, async (req, res) => {
  try {
    const [user] = await db
      .select({ ...getTableColumns(users), role: roles.name, roleColor: roles.color })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.id, req.caller.id))
      .limit(1)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const [principal] = await db
      .select({ id: principals.id, accountId: principals.accountId })
      .from(principals)
      .where(eq(principals.userId, req.caller.id))
      .limit(1)

    res.json({
      ...user,
      permissions:  req.caller.permissions,
      principalId:  principal?.id        ?? null,
      accountId:    principal?.accountId ?? null,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/users', ...requirePermission('admin'), async (req, res) => {
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

    // Resolve roleId: use provided roleId or fall back to Operator
    let inviteRoleId = req.body.roleId ?? null
    if (!inviteRoleId) {
      const [op] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, 'Operator')).limit(1)
      inviteRoleId = op?.id ?? null
    }

    const [invitation] = await db.insert(invitations).values({
      email,
      name,
      type:     req.body.type ?? 'internal',
      roleId:   inviteRoleId,
      invitedBy,
    }).returning()

    trackEvent({
      event:       'user.invite_sent',
      description: `${inviterName ?? 'System'} invited ${name}`,
      actorId:     invitedBy,
      metadata:    { email, roleId: invitation.roleId, type: invitation.type },
    })

    res.json({ id: invitation.id, name, email, roleId: invitation.roleId, status: 'pending' })
  } catch (err) {
    if (err.name === 'UsernameExistsException' || err.cause?.code === '23505') {
      return res.status(409).json({ error: 'A user with this email already exists.' })
    }
    console.error('AdminCreateUser error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/users/:id', ...requirePermission('admin'), async (req, res) => {
  const { id } = req.params
  const { name, email, phone, roleId, twoFactor, jobTitle, department, employeeId, actorSub } = req.body
  try {
    const [current] = await db.select().from(users).where(eq(users.id, id)).limit(1)
    if (!current) return res.status(404).json({ error: 'User not found.' })

    let actorId   = null
    let actorName = null
    if (actorSub) {
      const [actor] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.cognitoSub, actorSub)).limit(1)
      actorId   = actor?.id   ?? null
      actorName = actor?.name ?? null
    }

    // Resolve old and new role names for change tracking
    let currentRoleName = null
    if (current.roleId) {
      const [cr] = await db.select({ name: roles.name }).from(roles).where(eq(roles.id, current.roleId)).limit(1)
      currentRoleName = cr?.name ?? null
    }
    let newRoleName = undefined
    if (roleId !== undefined) {
      const [roleRow] = await db.select({ name: roles.name }).from(roles).where(eq(roles.id, roleId)).limit(1)
      if (!roleRow) return res.status(400).json({ error: 'Invalid roleId' })
      newRoleName = roleRow.name
    }

    const [updated] = await db.update(users)
      .set({
        ...(name      !== undefined && { name }),
        ...(email     !== undefined && { email }),
        ...(phone     !== undefined && { phone }),
        ...(roleId    !== undefined && { roleId }),
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

    if (newRoleName !== undefined && newRoleName !== currentRoleName) {
      trackEvent({
        event:       'member.role_changed',
        description: `${actorName ?? 'System'} changed role of ${current.name} from ${currentRoleName ?? 'none'} to ${newRoleName}`,
        actorId,
        subjectId:   id,
        metadata:    { from: currentRoleName, to: newRoleName },
      })
    }

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

app.get('/api/users', ...requirePermission('admin'), async (req, res) => {
  try {
    const result = await db
      .select({
        ...getTableColumns(users),
        role:       roles.name,
        roleColor:  roles.color,
        jobTitle:   employeeProfiles.jobTitle,
        department: employeeProfiles.department,
        employeeId: employeeProfiles.employeeId,
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .leftJoin(employeeProfiles, eq(employeeProfiles.userId, users.id))
    res.json(result)
  } catch (err) {
    console.error('Get users error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/invitations/:id/resend', ...requirePermission('admin'), async (req, res) => {
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

app.get('/api/invitations', ...requirePermission('admin'), async (req, res) => {
  try {
    const result = await db
      .select({
        id:         invitations.id,
        email:      invitations.email,
        name:       invitations.name,
        type:       invitations.type,
        roleId:     invitations.roleId,
        invitedBy:  invitations.invitedBy,
        invitedAt:  invitations.invitedAt,
        acceptedAt: invitations.acceptedAt,
        status:     invitations.status,
        role:       roles.name,
        roleColor:  roles.color,
      })
      .from(invitations)
      .leftJoin(roles, eq(invitations.roleId, roles.id))
      .where(eq(invitations.status, 'pending'))
    res.json(result)
  } catch (err) {
    console.error('Get invitations error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/users/:id/logs', ...requirePermission('logs'), async (req, res) => {
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

app.get('/api/logs', ...requirePermission('logs'), async (req, res) => {
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

async function buildAccount(account, scope = null) {
  const id = account.id
  const ps = scope
    ? (scope.principalIds.size ? await db.select().from(principals).where(and(eq(principals.accountId, id), inArray(principals.id, [...scope.principalIds]))) : [])
    : await db.select().from(principals).where(eq(principals.accountId, id))
  const vs = scope
    ? (scope.vehicleIds.size ? await db.select().from(vehicles).where(and(eq(vehicles.accountId, id), inArray(vehicles.id, [...scope.vehicleIds]))) : [])
    : await db.select().from(vehicles).where(eq(vehicles.accountId, id))
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

  const linkedUserIds = ps.map(p => p.userId).filter(Boolean)
  const linkedUsers = linkedUserIds.length
    ? await db.select({ id: users.id, name: users.name, email: users.email })
        .from(users).where(inArray(users.id, linkedUserIds))
    : []
  const userById = new Map(linkedUsers.map(u => [u.id, u]))

  const units = [
    ...ps.map(p => {
      const assignedUser = p.userId ? (userById.get(p.userId) ?? null) : null
      return {
        id: p.id, type: 'person',
        name: p.name, role: p.role, phone: p.phone, email: p.email,
        status: p.status, photoKey: p.photoKey,
        primaryDeviceId: p.primaryDeviceId ?? null,
        userId:    p.userId ?? null,
        userEmail: assignedUser?.email ?? null,
        userName:  assignedUser?.name ?? null,
        devices: allDevices.filter(d => d.principalId === p.id).map(serializeDevice),
        emergency: {
          dob: p.dob, height: p.height, bloodGroup: p.bloodGroup,
          allergies: p.allergies, conditions: p.conditions, medications: p.medications,
          contactName: p.emergContactName, contactPhone: p.emergContactPhone,
          contactRelation: p.emergContactRelation,
        },
      }
    }),
    ...vs.map(v => ({
      id: v.id, type: 'vehicle',
      name: v.callsign, make: v.make, model: v.model,
      plate: v.plate, armorLevel: v.armorLevel,
      status: v.status, photoKey: v.photoKey,
      primaryDeviceId: v.primaryDeviceId ?? null,
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

/* ── roles ────────────────────────────────────────────────────── */
app.get('/api/roles', ...requirePermission('admin'), async (req, res) => {
  try {
    const allRoles = await db.select().from(roles).orderBy(roles.createdAt)
    const allPerms = await db.select().from(rolePermissions)
    res.json(allRoles.map(r => ({
      ...r,
      permissions: allPerms.filter(p => p.roleId === r.id).map(p => p.permission),
    })))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.post('/api/roles', ...requirePermission('admin'), async (req, res) => {
  const { name, description, color, permissions = [] } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
  try {
    const [role] = await db.insert(roles)
      .values({ name: name.trim(), description, color: color ?? '#66727A', isSystem: false })
      .returning()
    if (permissions.length > 0) {
      await db.insert(rolePermissions).values(permissions.map(p => ({ roleId: role.id, permission: p })))
    }
    trackEvent({ event: 'role.created', description: `${req.caller.name} created role "${role.name}"`, actorId: req.caller.id, subjectId: role.id })
    res.json({ ...role, permissions })
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A role with this name already exists' })
    console.error(err); res.status(500).json({ error: err.message })
  }
})

app.patch('/api/roles/:id', ...requirePermission('admin'), async (req, res) => {
  const { id } = req.params
  const { name, description, color, permissions } = req.body
  try {
    const [existing] = await db.select().from(roles).where(eq(roles.id, id)).limit(1)
    if (!existing) return res.status(404).json({ error: 'Role not found' })
    if (existing.isSystem && name !== undefined && name.trim() !== existing.name) {
      return res.status(403).json({ error: 'Cannot rename a system role' })
    }

    const [updated] = await db.update(roles).set({
      ...(!existing.isSystem && name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description }),
      ...(color       !== undefined && { color }),
    }).where(eq(roles.id, id)).returning()

    if (permissions !== undefined) {
      await db.delete(rolePermissions).where(eq(rolePermissions.roleId, id))
      if (permissions.length > 0) {
        await db.insert(rolePermissions).values(permissions.map(p => ({ roleId: id, permission: p })))
      }
    }

    const perms = await db.select().from(rolePermissions).where(eq(rolePermissions.roleId, id))
    trackEvent({ event: 'role.updated', description: `${req.caller.name} updated role "${updated.name}"`, actorId: req.caller.id, subjectId: updated.id })
    res.json({ ...updated, permissions: perms.map(p => p.permission) })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.delete('/api/roles/:id', ...requirePermission('admin'), async (req, res) => {
  const { id } = req.params
  try {
    const [existing] = await db.select().from(roles).where(eq(roles.id, id)).limit(1)
    if (!existing) return res.status(404).json({ error: 'Role not found' })
    if (existing.isSystem) return res.status(403).json({ error: 'Cannot delete a system role' })
    const [userWithRole] = await db.select({ id: users.id }).from(users).where(eq(users.roleId, id)).limit(1)
    if (userWithRole) return res.status(409).json({ error: 'Cannot delete a role that is assigned to active users' })
    await db.delete(roles).where(eq(roles.id, id))
    trackEvent({ event: 'role.deleted', description: `${req.caller.name} deleted role "${existing.name}"`, actorId: req.caller.id, subjectId: existing.id })
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

/* ── user lookup by email ─────────────────────────────────────── */
app.get('/api/users/by-email', ...requirePermission('accounts'), async (req, res) => {
  const { email } = req.query
  if (!email) return res.status(400).json({ error: 'email query param required' })
  try {
    const [user] = await db.select({ id: users.id, name: users.name, email: users.email })
      .from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1)
    if (!user) return res.status(404).json({ error: 'No user found with this email address.' })
    res.json(user)
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

/* ── user scope assignments ───────────────────────────────────── */
const VALID_SCOPE_TYPES = new Set(['principal', 'vehicle'])

app.get('/api/users/:userId/assignments', ...requirePermission('admin'), async (req, res) => {
  try {
    const rows = await db.select().from(userScopeAssignments)
      .where(eq(userScopeAssignments.userId, req.params.userId))
      .orderBy(userScopeAssignments.createdAt)
    res.json(rows)
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.post('/api/users/:userId/assignments', ...requirePermission('admin'), async (req, res) => {
  const { accountId, scopeType, scopeId } = req.body
  if (!VALID_SCOPE_TYPES.has(scopeType)) return res.status(400).json({ error: 'Invalid scopeType' })
  if (!accountId) return res.status(400).json({ error: 'accountId is required' })
  if (!scopeId)   return res.status(400).json({ error: 'scopeId is required' })
  try {
    const [row] = await db.insert(userScopeAssignments)
      .values({ userId: req.params.userId, accountId, scopeType, scopeId })
      .onConflictDoNothing()
      .returning()
    if (!row) return res.status(409).json({ error: 'Assignment already exists' })
    const [targetUser, unit] = await Promise.all([
      db.select({ name: users.name }).from(users).where(eq(users.id, req.params.userId)).limit(1),
      scopeType === 'principal'
        ? db.select({ name: principals.name }).from(principals).where(eq(principals.id, scopeId)).limit(1)
        : db.select({ name: vehicles.callsign }).from(vehicles).where(eq(vehicles.id, scopeId)).limit(1),
    ])
    trackEvent({ event: 'member.scope_assigned', description: `${req.caller.name} granted "${targetUser[0]?.name}" access to "${unit[0]?.name}"`, actorId: req.caller.id, subjectId: req.params.userId, metadata: { scopeType, scopeId, accountId } })
    res.json(row)
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.delete('/api/users/:userId/assignments/:assignmentId', ...requirePermission('admin'), async (req, res) => {
  try {
    const [existing] = await db.select().from(userScopeAssignments)
      .where(and(eq(userScopeAssignments.id, req.params.assignmentId), eq(userScopeAssignments.userId, req.params.userId)))
      .limit(1)
    if (!existing) return res.status(404).json({ error: 'Assignment not found' })
    await db.delete(userScopeAssignments)
      .where(and(
        eq(userScopeAssignments.id, req.params.assignmentId),
        eq(userScopeAssignments.userId, req.params.userId),
      ))
    const [targetUser, unit] = await Promise.all([
      db.select({ name: users.name }).from(users).where(eq(users.id, req.params.userId)).limit(1),
      existing.scopeType === 'principal'
        ? db.select({ name: principals.name }).from(principals).where(eq(principals.id, existing.scopeId)).limit(1)
        : db.select({ name: vehicles.callsign }).from(vehicles).where(eq(vehicles.id, existing.scopeId)).limit(1),
    ])
    trackEvent({ event: 'member.scope_removed', description: `${req.caller.name} removed "${targetUser[0]?.name}"'s access to "${unit[0]?.name}"`, actorId: req.caller.id, subjectId: req.params.userId, metadata: { scopeType: existing.scopeType, scopeId: existing.scopeId } })
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

/* ── accounts ─────────────────────────────────────────────────── */
// GET is open to any authenticated user (ops/units need fleet data to function)
// Mutating routes require the 'accounts' permission
app.get('/api/accounts', authenticate, async (req, res) => {
  try {
    // Admins (accounts permission) see everything
    if (req.caller.permissions.includes('accounts')) {
      const accs = await db.select().from(accounts).orderBy(desc(accounts.createdAt))
      return res.json(await Promise.all(accs.map(a => buildAccount(a))))
    }

    // Scoped users: only units explicitly assigned to them
    const assignments = await db.select().from(userScopeAssignments)
      .where(eq(userScopeAssignments.userId, req.caller.id))

    if (assignments.length === 0) return res.json([])

    const scopeByAccount = {}
    for (const a of assignments) {
      if (!scopeByAccount[a.accountId]) {
        scopeByAccount[a.accountId] = { principalIds: new Set(), vehicleIds: new Set() }
      }
      if (a.scopeType === 'principal') scopeByAccount[a.accountId].principalIds.add(a.scopeId)
      if (a.scopeType === 'vehicle')   scopeByAccount[a.accountId].vehicleIds.add(a.scopeId)
    }

    const accs = await db.select().from(accounts)
      .where(inArray(accounts.id, Object.keys(scopeByAccount)))
      .orderBy(desc(accounts.createdAt))
    res.json(await Promise.all(accs.map(a => buildAccount(a, scopeByAccount[a.id]))))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.post('/api/accounts', ...requirePermission('accounts'), async (req, res) => {
  const { name, type, industry, status, contactName, contactEmail, contactPhone } = req.body
  try {
    const [acc] = await db.insert(accounts).values({ name, type, industry, status, contactName, contactEmail, contactPhone }).returning()
    trackEvent({ event: 'account.created', description: `${req.caller.name} created account "${acc.name}"`, actorId: req.caller.id, subjectId: acc.id })
    res.json(await buildAccount(acc))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.patch('/api/accounts/:id', ...requirePermission('accounts'), async (req, res) => {
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
    trackEvent({ event: 'account.updated', description: `${req.caller.name} updated account "${acc.name}"`, actorId: req.caller.id, subjectId: acc.id })
    res.json(await buildAccount(acc))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.delete('/api/accounts/:id', ...requirePermission('accounts'), async (req, res) => {
  try {
    const [existing] = await db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(eq(accounts.id, req.params.id)).limit(1)
    if (!existing) return res.status(404).json({ error: 'Account not found' })
    await db.delete(accounts).where(eq(accounts.id, req.params.id))
    trackEvent({ event: 'account.deleted', description: `${req.caller.name} deleted account "${existing.name}"`, actorId: req.caller.id, subjectId: existing.id })
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

/* ── principals ───────────────────────────────────────────────── */
app.post('/api/accounts/:accountId/principals', ...requirePermission('accounts'), async (req, res) => {
  const { name, role, phone, email, status, emergency } = req.body
  try {
    const [p] = await db.insert(principals).values({
      accountId: req.params.accountId, name, role, phone, email, status: status ?? 'normal',
      dob: emergency?.dob, height: emergency?.height, bloodGroup: emergency?.bloodGroup,
      allergies: emergency?.allergies, conditions: emergency?.conditions, medications: emergency?.medications,
      emergContactName: emergency?.contactName, emergContactPhone: emergency?.contactPhone,
      emergContactRelation: emergency?.contactRelation,
    }).returning()
    trackEvent({ event: 'unit.created', description: `${req.caller.name} created principal "${p.name}"`, actorId: req.caller.id, subjectId: p.id })
    res.json({ id: p.id, type: 'person', name: p.name, role: p.role, phone: p.phone, email: p.email, status: p.status, devices: [], emergency: emergency ?? {} })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.patch('/api/accounts/:accountId/principals/:id', ...requirePermission('accounts'), async (req, res) => {
  const { name, role, phone, email, status, userId, emergency } = req.body
  try {
    const [p] = await db.update(principals).set({
      ...(name   !== undefined && { name }),
      ...(role   !== undefined && { role }),
      ...(phone  !== undefined && { phone }),
      ...(email  !== undefined && { email }),
      ...(status !== undefined && { status }),
      ...(userId !== undefined && { userId: userId || null }), // null clears the link
      ...(emergency !== undefined && {
        dob: emergency.dob, height: emergency.height, bloodGroup: emergency.bloodGroup,
        allergies: emergency.allergies, conditions: emergency.conditions, medications: emergency.medications,
        emergContactName: emergency.contactName, emergContactPhone: emergency.contactPhone,
        emergContactRelation: emergency.contactRelation,
      }),
      updatedAt: new Date(),
    }).where(eq(principals.id, req.params.id)).returning()
    if (userId !== undefined) {
      if (userId) {
        trackEvent({ event: 'unit.user_linked', description: `${req.caller.name} linked user to principal "${p.name}"`, actorId: req.caller.id, subjectId: p.id, metadata: { userId } })
      } else {
        trackEvent({ event: 'unit.user_unlinked', description: `${req.caller.name} unlinked user from principal "${p.name}"`, actorId: req.caller.id, subjectId: p.id })
      }
    } else {
      trackEvent({ event: 'unit.updated', description: `${req.caller.name} updated principal "${p.name}"`, actorId: req.caller.id, subjectId: p.id })
    }
    res.json({ id: p.id, type: 'person', name: p.name, role: p.role, phone: p.phone, email: p.email, status: p.status, userId: p.userId ?? null, devices: [], emergency: emergency ?? {} })
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'principals_user_id_unique') {
      return res.status(409).json({ error: 'This user is already linked to another principal.' })
    }
    console.error(err); res.status(500).json({ error: err.message })
  }
})

app.delete('/api/accounts/:accountId/principals/:id', ...requirePermission('accounts'), async (req, res) => {
  try {
    const [existing] = await db.select({ id: principals.id, name: principals.name }).from(principals).where(eq(principals.id, req.params.id)).limit(1)
    if (!existing) return res.status(404).json({ error: 'Principal not found' })
    await db.delete(principals).where(eq(principals.id, req.params.id))
    trackEvent({ event: 'unit.deleted', description: `${req.caller.name} deleted principal "${existing.name}"`, actorId: req.caller.id, subjectId: existing.id })
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

/* ── vehicles ─────────────────────────────────────────────────── */
app.post('/api/accounts/:accountId/vehicles', ...requirePermission('accounts'), async (req, res) => {
  const { name, make, model, plate, armorLevel, status } = req.body
  try {
    const [v] = await db.insert(vehicles).values({
      accountId: req.params.accountId, callsign: name, make, model, plate, armorLevel, status: status ?? 'normal',
    }).returning()
    trackEvent({ event: 'unit.created', description: `${req.caller.name} created vehicle "${v.callsign}"`, actorId: req.caller.id, subjectId: v.id })
    res.json({ id: v.id, type: 'vehicle', name: v.callsign, make: v.make, model: v.model, plate: v.plate, armorLevel: v.armorLevel, status: v.status, devices: [] })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.patch('/api/accounts/:accountId/vehicles/:id', ...requirePermission('accounts'), async (req, res) => {
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
    trackEvent({ event: 'unit.updated', description: `${req.caller.name} updated vehicle "${v.callsign}"`, actorId: req.caller.id, subjectId: v.id })
    res.json({ id: v.id, type: 'vehicle', name: v.callsign, make: v.make, model: v.model, plate: v.plate, armorLevel: v.armorLevel, status: v.status, devices: [] })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.delete('/api/accounts/:accountId/vehicles/:id', ...requirePermission('accounts'), async (req, res) => {
  try {
    const [existing] = await db.select({ id: vehicles.id, callsign: vehicles.callsign }).from(vehicles).where(eq(vehicles.id, req.params.id)).limit(1)
    if (!existing) return res.status(404).json({ error: 'Vehicle not found' })
    await db.delete(vehicles).where(eq(vehicles.id, req.params.id))
    trackEvent({ event: 'unit.deleted', description: `${req.caller.name} deleted vehicle "${existing.callsign}"`, actorId: req.caller.id, subjectId: existing.id })
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

/* ── groups ───────────────────────────────────────────────────── */
app.post('/api/accounts/:accountId/groups', ...requirePermission('accounts'), async (req, res) => {
  try {
    const [g] = await db.insert(groups).values({ accountId: req.params.accountId, name: req.body.name }).returning()
    trackEvent({ event: 'group.created', description: `${req.caller.name} created group "${g.name}"`, actorId: req.caller.id, subjectId: g.id })
    res.json({ id: g.id, name: g.name, unitIds: [] })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.patch('/api/accounts/:accountId/groups/:id', ...requirePermission('accounts'), async (req, res) => {
  try {
    const [existing] = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, req.params.id)).limit(1)
    const [g] = await db.update(groups).set({ name: req.body.name }).where(eq(groups.id, req.params.id)).returning()
    if (existing) {
      trackEvent({ event: 'group.renamed', description: `${req.caller.name} renamed group "${existing.name}" to "${g.name}"`, actorId: req.caller.id, subjectId: g.id, metadata: { from: existing.name, to: g.name } })
    }
    res.json({ id: g.id, name: g.name })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.delete('/api/accounts/:accountId/groups/:id', ...requirePermission('accounts'), async (req, res) => {
  try {
    const [existing] = await db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.id, req.params.id)).limit(1)
    if (!existing) return res.status(404).json({ error: 'Group not found' })
    await db.delete(groups).where(eq(groups.id, req.params.id))
    trackEvent({ event: 'group.deleted', description: `${req.caller.name} deleted group "${existing.name}"`, actorId: req.caller.id, subjectId: existing.id })
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

/* ── group members ────────────────────────────────────────────── */
app.post('/api/accounts/:accountId/groups/:groupId/members', ...requirePermission('accounts'), async (req, res) => {
  const { principalId, vehicleId } = req.body
  try {
    await db.insert(groupMembers).values({ groupId: req.params.groupId, principalId: principalId ?? null, vehicleId: vehicleId ?? null })
    const [grp, unit] = await Promise.all([
      db.select({ name: groups.name }).from(groups).where(eq(groups.id, req.params.groupId)).limit(1),
      principalId
        ? db.select({ name: principals.name }).from(principals).where(eq(principals.id, principalId)).limit(1)
        : db.select({ name: vehicles.callsign }).from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1),
    ])
    trackEvent({ event: 'group.member_added', description: `${req.caller.name} added "${unit[0]?.name}" to group "${grp[0]?.name}"`, actorId: req.caller.id, subjectId: req.params.groupId })
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.delete('/api/accounts/:accountId/groups/:groupId/members', ...requirePermission('accounts'), async (req, res) => {
  const { principalId, vehicleId } = req.body
  try {
    if (principalId) {
      await db.delete(groupMembers).where(and(eq(groupMembers.groupId, req.params.groupId), eq(groupMembers.principalId, principalId)))
    } else if (vehicleId) {
      await db.delete(groupMembers).where(and(eq(groupMembers.groupId, req.params.groupId), eq(groupMembers.vehicleId, vehicleId)))
    }
    const [grp, unit] = await Promise.all([
      db.select({ name: groups.name }).from(groups).where(eq(groups.id, req.params.groupId)).limit(1),
      principalId
        ? db.select({ name: principals.name }).from(principals).where(eq(principals.id, principalId)).limit(1)
        : vehicleId
          ? db.select({ name: vehicles.callsign }).from(vehicles).where(eq(vehicles.id, vehicleId)).limit(1)
          : Promise.resolve([]),
    ])
    trackEvent({ event: 'group.member_removed', description: `${req.caller.name} removed "${unit[0]?.name}" from group "${grp[0]?.name}"`, actorId: req.caller.id, subjectId: req.params.groupId })
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

/* ── devices ──────────────────────────────────────────────────── */
app.post('/api/accounts/:accountId/units/:unitId/devices', ...requirePermission('accounts'), async (req, res) => {
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

    if (traccarDeviceId) {
      linkDeviceToAllGeofences(traccarDeviceId, req.params.accountId).catch(err =>
        console.warn('[devices] geofence link failed:', err.message)
      )
    }

    trackEvent({ event: 'device.created', description: `${req.caller.name} added device "${d.name}"`, actorId: req.caller.id, subjectId: d.id })
    res.json(serializeDevice(d))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.patch('/api/accounts/:accountId/units/:unitId/devices/:deviceId', ...requirePermission('accounts'), async (req, res) => {
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
    trackEvent({ event: 'device.updated', description: `${req.caller.name} updated device "${d.name}"`, actorId: req.caller.id, subjectId: d.id })
    res.json(serializeDevice(d))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.delete('/api/accounts/:accountId/units/:unitId/devices/:deviceId', ...requirePermission('accounts'), async (req, res) => {
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
    trackEvent({ event: 'device.deleted', description: `${req.caller.name} deleted device "${d?.name}"`, actorId: req.caller.id, subjectId: req.params.deviceId })
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.patch('/api/accounts/:accountId/units/:unitId/primary-device', ...requirePermission('accounts'), async (req, res) => {
  const { unitId } = req.params
  const { deviceId } = req.body   // null to clear
  try {
    const [p] = await db.select().from(principals).where(eq(principals.id, unitId)).limit(1)
    if (p) {
      const [updated] = await db.update(principals).set({ primaryDeviceId: deviceId ?? null }).where(eq(principals.id, unitId)).returning()
      const desc = deviceId
        ? `${req.caller.name} set primary device for "${p.name}" to device ${deviceId}`
        : `${req.caller.name} cleared primary device for "${p.name}"`
      trackEvent({ event: 'unit.primary_device_set', description: desc, actorId: req.caller.id, subjectId: unitId })
      return res.json({ primaryDeviceId: updated.primaryDeviceId })
    }
    const [updated] = await db.update(vehicles).set({ primaryDeviceId: deviceId ?? null }).where(eq(vehicles.id, unitId)).returning()
    const desc = deviceId
      ? `${req.caller.name} set primary device for "${updated.callsign}" to device ${deviceId}`
      : `${req.caller.name} cleared primary device for "${updated.callsign}"`
    trackEvent({ event: 'unit.primary_device_set', description: desc, actorId: req.caller.id, subjectId: unitId })
    res.json({ primaryDeviceId: updated.primaryDeviceId })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

/* ── places ───────────────────────────────────────────────────── */
function serializePlace(p) {
  return {
    id: p.id, name: p.name, address: p.address, mapboxId: p.mapboxId,
    latitude: p.latitude, longitude: p.longitude, radius: p.radius, color: p.color,
    synced: p.traccarGeofenceId != null,
  }
}

app.get('/api/accounts/:accountId/places', ...requirePermission('accounts'), async (req, res) => {
  try {
    const rows = await db.select().from(places).where(eq(places.accountId, req.params.accountId))
    res.json(rows.map(serializePlace))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.post('/api/accounts/:accountId/places', ...requirePermission('accounts'), async (req, res) => {
  const { name, address, mapboxId, latitude, longitude, radius, color } = req.body
  if (!name?.trim())     return res.status(400).json({ error: 'name is required' })
  if (latitude  == null) return res.status(400).json({ error: 'latitude is required' })
  if (longitude == null) return res.status(400).json({ error: 'longitude is required' })
  try {
    const [p] = await db.insert(places).values({
      accountId: req.params.accountId,
      name: name.trim(), address, mapboxId,
      latitude, longitude,
      radius: radius ?? 150,
      color:  color  ?? '#2563eb',
    }).returning()

    let traccarGeofenceId = null
    try {
      traccarGeofenceId = await upsertGeofenceForPlace(p)
      await db.update(places).set({ traccarGeofenceId }).where(eq(places.id, p.id))
      await linkGeofenceToAccountDevices(traccarGeofenceId, req.params.accountId)
    } catch (err) {
      console.warn('[places] Traccar sync failed (place saved without sync):', err.message)
    }

    trackEvent({ event: 'place.created', description: `${req.caller.name} created place "${p.name}"`, actorId: req.caller.id, subjectId: p.id })
    res.json(serializePlace({ ...p, traccarGeofenceId }))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.patch('/api/accounts/:accountId/places/:placeId', ...requirePermission('accounts'), async (req, res) => {
  const { name, address, mapboxId, latitude, longitude, radius, color } = req.body
  try {
    const [p] = await db.update(places).set({
      ...(name      !== undefined && { name: name.trim() }),
      ...(address   !== undefined && { address }),
      ...(mapboxId  !== undefined && { mapboxId }),
      ...(latitude  !== undefined && { latitude }),
      ...(longitude !== undefined && { longitude }),
      ...(radius    !== undefined && { radius }),
      ...(color     !== undefined && { color }),
      updatedAt: new Date(),
    }).where(and(eq(places.id, req.params.placeId), eq(places.accountId, req.params.accountId))).returning()
    if (!p) return res.status(404).json({ error: 'Place not found' })

    // Re-sync if anything that affects the Traccar geofence changed
    const geofenceAffected = name !== undefined || latitude !== undefined || longitude !== undefined || radius !== undefined
    if (geofenceAffected) {
      try {
        const traccarGeofenceId = await upsertGeofenceForPlace(p)
        if (!p.traccarGeofenceId) {
          await db.update(places).set({ traccarGeofenceId }).where(eq(places.id, p.id))
          await linkGeofenceToAccountDevices(traccarGeofenceId, req.params.accountId)
          p.traccarGeofenceId = traccarGeofenceId
        }
      } catch (err) {
        console.warn('[places] Traccar re-sync failed:', err.message)
      }
    }

    trackEvent({ event: 'place.updated', description: `${req.caller.name} updated place "${p.name}"`, actorId: req.caller.id, subjectId: p.id })
    res.json(serializePlace(p))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.delete('/api/accounts/:accountId/places/:placeId', ...requirePermission('accounts'), async (req, res) => {
  try {
    const [existing] = await db.select().from(places)
      .where(and(eq(places.id, req.params.placeId), eq(places.accountId, req.params.accountId)))
      .limit(1)
    if (!existing) return res.status(404).json({ error: 'Place not found' })

    if (existing.traccarGeofenceId) {
      try {
        await deleteGeofence(existing.traccarGeofenceId)
      } catch (err) {
        console.warn('[places] Traccar delete failed:', err.message)
      }
    }

    await db.delete(places).where(eq(places.id, req.params.placeId))
    trackEvent({ event: 'place.deleted', description: `${req.caller.name} deleted place "${existing.name}"`, actorId: req.caller.id, subjectId: existing.id })
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

/* ── zones ────────────────────────────────────────────────────── */
function serializeZone(z) {
  return {
    id:          z.id,
    name:        z.name,
    description: z.description,
    geometry:    z.geometry,
    riskLevel:   z.riskLevel,
    enabled:     z.enabled,
    synced:      z.traccarGeofenceId != null,
    createdAt:   z.createdAt,
    updatedAt:   z.updatedAt,
  }
}

app.get('/api/zones', ...requirePermission('ops'), async (req, res) => {
  try {
    const rows = await db.select().from(zones).orderBy(zones.createdAt)
    res.json(rows.map(serializeZone))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.post('/api/zones', ...requirePermission('mapstudio'), async (req, res) => {
  const { name, description, geometry, riskLevel } = req.body
  if (!name?.trim())  return res.status(400).json({ error: 'name is required' })
  if (!geometry)      return res.status(400).json({ error: 'geometry is required' })
  try {
    const [zone] = await db.insert(zones).values({
      name:        name.trim(),
      description: description?.trim() || null,
      geometry,
      riskLevel:   riskLevel ?? 'low',
    }).returning()

    // Sync to Traccar and link to every registered device
    let traccarGeofenceId = null
    try {
      traccarGeofenceId = await upsertGeofenceForZone(zone)
      await db.update(zones).set({ traccarGeofenceId }).where(eq(zones.id, zone.id))
      await linkGeofenceToAllDevices(traccarGeofenceId)
    } catch (err) {
      console.warn('[zones] Traccar sync failed (zone saved without sync):', err.message)
    }

    const finalZone = { ...zone, traccarGeofenceId }
    refreshZoneInCache(finalZone)
    trackEvent({ event: 'zone.created', description: `${req.caller.name} created zone "${zone.name}"`, actorId: req.caller.id, subjectId: zone.id })
    res.json(serializeZone(finalZone))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.patch('/api/zones/:id', ...requirePermission('mapstudio'), async (req, res) => {
  const { name, description, geometry, riskLevel, enabled } = req.body
  try {
    const [existing] = await db.select().from(zones).where(eq(zones.id, req.params.id)).limit(1)
    if (!existing) return res.status(404).json({ error: 'Zone not found' })

    const [zone] = await db.update(zones).set({
      ...(name        !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(geometry    !== undefined && { geometry }),
      ...(riskLevel   !== undefined && { riskLevel }),
      ...(enabled     !== undefined && { enabled }),
      updatedAt: new Date(),
    }).where(eq(zones.id, req.params.id)).returning()

    // Re-sync to Traccar if name or geometry changed
    if (name !== undefined || geometry !== undefined) {
      try {
        const traccarGeofenceId = await upsertGeofenceForZone(zone)
        if (!zone.traccarGeofenceId) {
          await db.update(zones).set({ traccarGeofenceId }).where(eq(zones.id, zone.id))
          await linkGeofenceToAllDevices(traccarGeofenceId)
          zone.traccarGeofenceId = traccarGeofenceId
        }
      } catch (err) {
        console.warn('[zones] Traccar re-sync failed:', err.message)
      }
    }

    refreshZoneInCache(zone)
    trackEvent({ event: 'zone.updated', description: `${req.caller.name} updated zone "${zone.name}"`, actorId: req.caller.id, subjectId: zone.id })
    res.json(serializeZone(zone))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.delete('/api/zones/:id', ...requirePermission('mapstudio'), async (req, res) => {
  try {
    const [existing] = await db.select().from(zones).where(eq(zones.id, req.params.id)).limit(1)
    if (!existing) return res.status(404).json({ error: 'Zone not found' })

    removeZoneFromCache(existing.traccarGeofenceId)

    // Remove from Traccar first (cascades device links automatically)
    if (existing.traccarGeofenceId) {
      try {
        await deleteGeofence(existing.traccarGeofenceId)
      } catch (err) {
        console.warn('[zones] Traccar delete failed:', err.message)
      }
    }

    await db.delete(zones).where(eq(zones.id, req.params.id))
    trackEvent({ event: 'zone.deleted', description: `${req.caller.name} deleted zone "${existing.name}"`, actorId: req.caller.id, subjectId: existing.id })
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

/* ── markers ──────────────────────────────────────────────────── */
function serializeMarker(m) {
  return {
    id: m.id, name: m.name, description: m.description,
    category: m.category, riskLevel: m.riskLevel,
    latitude: m.latitude, longitude: m.longitude,
    enabled: m.enabled, createdAt: m.createdAt,
  }
}

app.get('/api/markers', ...requirePermission('ops'), async (req, res) => {
  try {
    const rows = await db.select().from(markers).orderBy(markers.createdAt)
    res.json(rows.map(serializeMarker))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.post('/api/markers', ...requirePermission('mapstudio'), async (req, res) => {
  const { name, description, category, riskLevel, latitude, longitude } = req.body
  if (!name?.trim())   return res.status(400).json({ error: 'name is required' })
  if (latitude  == null) return res.status(400).json({ error: 'latitude is required' })
  if (longitude == null) return res.status(400).json({ error: 'longitude is required' })
  try {
    const [m] = await db.insert(markers).values({
      name: name.trim(), description: description?.trim() || null,
      category: category ?? 'Other', riskLevel: riskLevel ?? 'low',
      latitude, longitude,
    }).returning()
    trackEvent({ event: 'marker.created', description: `${req.caller.name} created marker "${m.name}"`, actorId: req.caller.id, subjectId: m.id })
    res.json(serializeMarker(m))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.patch('/api/markers/:id', ...requirePermission('mapstudio'), async (req, res) => {
  const { name, description, category, riskLevel, enabled } = req.body
  try {
    const [m] = await db.update(markers).set({
      ...(name        !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(category    !== undefined && { category }),
      ...(riskLevel   !== undefined && { riskLevel }),
      ...(enabled     !== undefined && { enabled }),
      updatedAt: new Date(),
    }).where(eq(markers.id, req.params.id)).returning()
    if (!m) return res.status(404).json({ error: 'Marker not found' })
    trackEvent({ event: 'marker.updated', description: `${req.caller.name} updated marker "${m.name}"`, actorId: req.caller.id, subjectId: m.id })
    res.json(serializeMarker(m))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.delete('/api/markers/:id', ...requirePermission('mapstudio'), async (req, res) => {
  try {
    const [existing] = await db.select({ id: markers.id, name: markers.name }).from(markers).where(eq(markers.id, req.params.id)).limit(1)
    if (!existing) return res.status(404).json({ error: 'Marker not found' })
    await db.delete(markers).where(eq(markers.id, req.params.id))
    trackEvent({ event: 'marker.deleted', description: `${req.caller.name} deleted marker "${existing.name}"`, actorId: req.caller.id, subjectId: existing.id })
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

/* ── plans ────────────────────────────────────────────────────── */
function serializeLeg(l) {
  return {
    id:                  l.id,
    legOrder:            l.legOrder,
    originPlaceId:       l.originPlaceId,
    destinationPlaceId:  l.destinationPlaceId,
    daysOfWeek:          l.daysOfWeek,
    windowStart:         l.windowStart,
    windowEnd:           l.windowEnd,
    arrivalAt:           l.arrivalAt,
    departureAt:         l.departureAt,
  }
}

function serializePlan(plan, units, legs) {
  return {
    id:        plan.id,
    name:      plan.name,
    type:      plan.type,
    enabled:   plan.enabled,
    notes:     plan.notes,
    units:     units.map(u => ({ unitId: u.unitId, unitType: u.unitType })),
    legs:      legs.map(serializeLeg),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  }
}

function buildLegValues(planId, leg, index) {
  return {
    planId,
    legOrder:           leg.legOrder ?? index,
    originPlaceId:      leg.originPlaceId      ?? null,
    destinationPlaceId: leg.destinationPlaceId ?? null,
    daysOfWeek:         leg.daysOfWeek         ?? null,
    windowStart:        leg.windowStart        ?? null,
    windowEnd:          leg.windowEnd          ?? null,
    arrivalAt:          leg.arrivalAt   ? new Date(leg.arrivalAt)   : null,
    departureAt:        leg.departureAt ? new Date(leg.departureAt) : null,
  }
}

app.get('/api/accounts/:accountId/plans', ...requirePermission('accounts'), async (req, res) => {
  try {
    const rows = await db.select().from(plans).where(eq(plans.accountId, req.params.accountId))
    if (rows.length === 0) return res.json([])
    const planIds = rows.map(p => p.id)
    const [unitRows, legRows] = await Promise.all([
      db.select().from(planUnits).where(inArray(planUnits.planId, planIds)),
      db.select().from(planLegs).where(inArray(planLegs.planId, planIds)).orderBy(planLegs.legOrder),
    ])
    const byPlanUnits = new Map()
    const byPlanLegs  = new Map()
    for (const u of unitRows) {
      if (!byPlanUnits.has(u.planId)) byPlanUnits.set(u.planId, [])
      byPlanUnits.get(u.planId).push(u)
    }
    for (const l of legRows) {
      if (!byPlanLegs.has(l.planId)) byPlanLegs.set(l.planId, [])
      byPlanLegs.get(l.planId).push(l)
    }
    res.json(rows.map(p => serializePlan(p, byPlanUnits.get(p.id) ?? [], byPlanLegs.get(p.id) ?? [])))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.post('/api/accounts/:accountId/plans', ...requirePermission('accounts'), async (req, res) => {
  const { name, type, enabled, notes, units = [], legs = [] } = req.body
  if (!name?.trim())    return res.status(400).json({ error: 'name is required' })
  if (!units.length)    return res.status(400).json({ error: 'at least one unit is required' })
  try {
    const [plan] = await db.insert(plans).values({
      accountId: req.params.accountId,
      name:    name.trim(),
      type:    type    ?? 'recurring',
      enabled: enabled !== false,
      notes:   notes   ?? null,
    }).returning()
    const [insertedUnits, insertedLegs] = await Promise.all([
      db.insert(planUnits).values(units.map(u => ({ planId: plan.id, unitId: u.unitId, unitType: u.unitType }))).returning(),
      legs.length > 0
        ? db.insert(planLegs).values(legs.map((l, i) => buildLegValues(plan.id, l, i))).returning()
        : Promise.resolve([]),
    ])
    trackEvent({ event: 'plan.created', description: `${req.caller.name} created plan "${plan.name}"`, actorId: req.caller.id, subjectId: plan.id })
    res.json(serializePlan(plan, insertedUnits, insertedLegs))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.patch('/api/accounts/:accountId/plans/:planId', ...requirePermission('accounts'), async (req, res) => {
  const { name, type, enabled, notes, units, legs } = req.body
  const { accountId, planId } = req.params
  try {
    const [plan] = await db.update(plans).set({
      ...(name    !== undefined && { name: name.trim() }),
      ...(type    !== undefined && { type }),
      ...(enabled !== undefined && { enabled }),
      ...(notes   !== undefined && { notes }),
      updatedAt: new Date(),
    }).where(and(eq(plans.id, planId), eq(plans.accountId, accountId))).returning()
    if (!plan) return res.status(404).json({ error: 'Plan not found' })

    const [currentUnits, currentLegs] = await Promise.all([
      units !== undefined
        ? db.delete(planUnits).where(eq(planUnits.planId, planId))
            .then(() => units.length > 0
              ? db.insert(planUnits).values(units.map(u => ({ planId, unitId: u.unitId, unitType: u.unitType }))).returning()
              : [])
        : db.select().from(planUnits).where(eq(planUnits.planId, planId)),
      legs !== undefined
        ? db.delete(planLegs).where(eq(planLegs.planId, planId))
            .then(() => legs.length > 0
              ? db.insert(planLegs).values(legs.map((l, i) => buildLegValues(planId, l, i))).returning()
              : [])
        : db.select().from(planLegs).where(eq(planLegs.planId, planId)).orderBy(planLegs.legOrder),
    ])
    trackEvent({ event: 'plan.updated', description: `${req.caller.name} updated plan "${plan.name}"`, actorId: req.caller.id, subjectId: plan.id })
    res.json(serializePlan(plan, currentUnits, currentLegs))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.delete('/api/accounts/:accountId/plans/:planId', ...requirePermission('accounts'), async (req, res) => {
  try {
    const [existing] = await db.select({ id: plans.id, name: plans.name }).from(plans)
      .where(and(eq(plans.id, req.params.planId), eq(plans.accountId, req.params.accountId))).limit(1)
    if (!existing) return res.status(404).json({ error: 'Plan not found' })
    await db.delete(plans).where(and(eq(plans.id, req.params.planId), eq(plans.accountId, req.params.accountId)))
    trackEvent({ event: 'plan.deleted', description: `${req.caller.name} deleted plan "${existing.name}"`, actorId: req.caller.id, subjectId: existing.id })
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

/* ── traccar ──────────────────────────────────────────────────── */
app.use('/api/traccar', ...requirePermission('ops'))

/* ── client API ───────────────────────────────────────────────── */

async function requireClientPrincipal(req, res, next) {
  try {
    const [principal] = await db
      .select({ id: principals.id, accountId: principals.accountId })
      .from(principals)
      .where(eq(principals.userId, req.caller.id))
      .limit(1)
    if (!principal) return res.status(403).json({ error: 'No principal linked to this user. Contact Telematics Guardian support.' })
    req.clientPrincipal = principal
    next()
  } catch (err) { res.status(500).json({ error: err.message }) }
}

app.get('/api/client/account', authenticate, requireClientPrincipal, async (req, res) => {
  const { accountId } = req.clientPrincipal
  try {
    const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1)
    if (!account) return res.status(404).json({ error: 'Account not found' })

    const [accountPrincipals, accountVehicles] = await Promise.all([
      db.select({ id: principals.id, name: principals.name, status: principals.status })
        .from(principals).where(eq(principals.accountId, accountId)),
      db.select({ id: vehicles.id, callsign: vehicles.callsign, status: vehicles.status })
        .from(vehicles).where(eq(vehicles.accountId, accountId)),
    ])

    res.json({
      id:    account.id,
      name:  account.name,
      type:  account.type,
      units: [
        ...accountPrincipals.map(p => ({ id: p.id, type: 'person',  name: p.name,     status: p.status })),
        ...accountVehicles  .map(v => ({ id: v.id, type: 'vehicle', name: v.callsign, status: v.status })),
      ],
    })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.get('/api/client/units/:id', authenticate, requireClientPrincipal, async (req, res) => {
  const { id } = req.params
  const { accountId } = req.clientPrincipal
  try {
    const [principal] = await db.select().from(principals)
      .where(and(eq(principals.id, id), eq(principals.accountId, accountId))).limit(1)

    if (principal) {
      const unitDevices = await db.select().from(devices).where(eq(devices.principalId, id))
      return res.json({
        id:              principal.id,
        type:            'person',
        name:            principal.name,
        role:            principal.role,
        phone:           principal.phone,
        status:          principal.status,
        primaryDeviceId: principal.primaryDeviceId ?? null,
        devices:         unitDevices.map(serializeDevice),
        emergency: {
          bloodGroup:      principal.bloodGroup,
          dob:             principal.dob,
          height:          principal.height,
          allergies:       principal.allergies,
          conditions:      principal.conditions,
          medications:     principal.medications,
          contactName:     principal.emergContactName,
          contactPhone:    principal.emergContactPhone,
          contactRelation: principal.emergContactRelation,
        },
      })
    }

    const [vehicle] = await db.select().from(vehicles)
      .where(and(eq(vehicles.id, id), eq(vehicles.accountId, accountId))).limit(1)

    if (vehicle) {
      const unitDevices = await db.select().from(devices).where(eq(devices.vehicleId, id))
      return res.json({
        id:              vehicle.id,
        type:            'vehicle',
        name:            vehicle.callsign,
        make:            vehicle.make,
        model:           vehicle.model,
        plate:           vehicle.plate,
        armorLevel:      vehicle.armorLevel,
        status:          vehicle.status,
        primaryDeviceId: vehicle.primaryDeviceId ?? null,
        devices:         unitDevices.map(serializeDevice),
      })
    }

    res.status(404).json({ error: 'Unit not found or not in your account' })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.get('/api/client/live', authenticate, requireClientPrincipal, (req, res) => {
  const { accountId } = req.clientPrincipal

  res.setHeader('Content-Type',      'text/event-stream')
  res.setHeader('Cache-Control',     'no-cache')
  res.setHeader('Connection',        'keep-alive')
  res.setHeader('X-Accel-Buffering','no')
  res.flushHeaders()

  // Snapshot: only positions belonging to this account's devices
  const allPositions = getPositionCache()
  const accountPositions = {}
  for (const [deviceId, pos] of Object.entries(allPositions)) {
    if (getDeviceAccount(parseInt(deviceId, 10)) === accountId) {
      accountPositions[deviceId] = pos
    }
  }
  res.write(`data: ${JSON.stringify({ type: 'snapshot', positions: accountPositions })}\n\n`)

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 30000)

  addClientSseClient(res, accountId)
  req.on('close', () => {
    clearInterval(heartbeat)
    removeClientSseClient(res, accountId)
  })
})

/* ── client device registration ───────────────────────────────── */
app.get('/api/client/principal/devices', authenticate, requireClientPrincipal, async (req, res) => {
  const principalId = req.clientPrincipal.id
  try {
    const [[principal], devs] = await Promise.all([
      db.select({ primaryDeviceId: principals.primaryDeviceId }).from(principals).where(eq(principals.id, principalId)).limit(1),
      db.select().from(devices).where(eq(devices.principalId, principalId)),
    ])
    res.json({ primaryDeviceId: principal?.primaryDeviceId ?? null, devices: devs.map(serializeDevice) })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.post('/api/client/principal/devices', authenticate, requireClientPrincipal, async (req, res) => {
  const { name, type, uniqueId, model, imei } = req.body
  if (!name?.trim())     return res.status(400).json({ error: 'name is required' })
  if (!uniqueId?.trim()) return res.status(400).json({ error: 'uniqueId is required' })

  const principalId = req.clientPrincipal.id
  try {
    let traccarDeviceId = null
    try {
      const td = await createTraccarDevice(name.trim(), uniqueId.trim())
      traccarDeviceId = String(td.id)
    } catch (err) {
      console.warn('[traccar] Could not register device in Traccar:', err.message)
    }

    const [d] = await db.insert(devices).values({
      principalId,
      name:            name.trim(),
      type:            type ?? 'phone',
      model:           model ?? null,
      imei:            imei  ?? null,
      status:          'online',
      traccarDeviceId,
    }).returning()

    // Auto-set as primary device if principal has none yet
    const [p] = await db.select({ primaryDeviceId: principals.primaryDeviceId })
      .from(principals).where(eq(principals.id, principalId)).limit(1)
    if (p && !p.primaryDeviceId) {
      await db.update(principals).set({ primaryDeviceId: d.id }).where(eq(principals.id, principalId))
    }

    if (traccarDeviceId) {
      linkDeviceToAllGeofences(traccarDeviceId, req.clientPrincipal.accountId).catch(err =>
        console.warn('[devices] geofence link failed:', err.message)
      )
    }

    await refreshUnitInCache(principalId)
    res.json(serializeDevice(d))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.patch('/api/client/principal/primary-device', authenticate, requireClientPrincipal, async (req, res) => {
  const { deviceId } = req.body
  const principalId = req.clientPrincipal.id
  try {
    if (deviceId) {
      const [d] = await db.select({ id: devices.id }).from(devices)
        .where(and(eq(devices.id, deviceId), eq(devices.principalId, principalId))).limit(1)
      if (!d) return res.status(404).json({ error: 'Device not found on your principal' })
    }
    const [p] = await db.update(principals)
      .set({ primaryDeviceId: deviceId ?? null, updatedAt: new Date() })
      .where(eq(principals.id, principalId)).returning()
    res.json({ primaryDeviceId: p.primaryDeviceId })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.patch('/api/client/principal/devices/:deviceId', authenticate, requireClientPrincipal, async (req, res) => {
  const { name, model } = req.body
  const principalId = req.clientPrincipal.id
  try {
    const [existing] = await db.select({ id: devices.id }).from(devices)
      .where(and(eq(devices.id, req.params.deviceId), eq(devices.principalId, principalId))).limit(1)
    if (!existing) return res.status(404).json({ error: 'Device not found on your principal' })

    const [d] = await db.update(devices).set({
      ...(name  !== undefined && { name }),
      ...(model !== undefined && { model }),
      updatedAt: new Date(),
    }).where(eq(devices.id, req.params.deviceId)).returning()
    res.json(serializeDevice(d))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

/* ── client places ────────────────────────────────────────────── */
app.get('/api/client/places', authenticate, requireClientPrincipal, async (req, res) => {
  const { accountId } = req.clientPrincipal
  try {
    const rows = await db.select().from(places).where(eq(places.accountId, accountId)).orderBy(places.createdAt)
    res.json(rows.map(serializePlace))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.post('/api/client/places', authenticate, requireClientPrincipal, async (req, res) => {
  const { accountId } = req.clientPrincipal
  const { name, address, mapboxId, latitude, longitude, radius, color } = req.body
  if (!name?.trim())     return res.status(400).json({ error: 'name is required' })
  if (latitude  == null) return res.status(400).json({ error: 'latitude is required' })
  if (longitude == null) return res.status(400).json({ error: 'longitude is required' })
  try {
    const [p] = await db.insert(places).values({
      accountId,
      name: name.trim(), address, mapboxId,
      latitude, longitude,
      radius: radius ?? 150,
      color:  color  ?? '#2563eb',
    }).returning()

    let traccarGeofenceId = null
    try {
      traccarGeofenceId = await upsertGeofenceForPlace(p)
      await db.update(places).set({ traccarGeofenceId }).where(eq(places.id, p.id))
      await linkGeofenceToAccountDevices(traccarGeofenceId, accountId)
    } catch (err) {
      console.warn('[places] Traccar sync failed (place saved without sync):', err.message)
    }

    res.json(serializePlace({ ...p, traccarGeofenceId }))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.patch('/api/client/places/:placeId', authenticate, requireClientPrincipal, async (req, res) => {
  const { accountId } = req.clientPrincipal
  const { name, address, mapboxId, latitude, longitude, radius, color } = req.body
  try {
    const [p] = await db.update(places).set({
      ...(name      !== undefined && { name: name.trim() }),
      ...(address   !== undefined && { address }),
      ...(mapboxId  !== undefined && { mapboxId }),
      ...(latitude  !== undefined && { latitude }),
      ...(longitude !== undefined && { longitude }),
      ...(radius    !== undefined && { radius }),
      ...(color     !== undefined && { color }),
      updatedAt: new Date(),
    }).where(and(eq(places.id, req.params.placeId), eq(places.accountId, accountId))).returning()
    if (!p) return res.status(404).json({ error: 'Place not found' })

    const geofenceAffected = name !== undefined || latitude !== undefined || longitude !== undefined || radius !== undefined
    if (geofenceAffected) {
      try {
        const traccarGeofenceId = await upsertGeofenceForPlace(p)
        if (!p.traccarGeofenceId) {
          await db.update(places).set({ traccarGeofenceId }).where(eq(places.id, p.id))
          await linkGeofenceToAccountDevices(traccarGeofenceId, accountId)
          p.traccarGeofenceId = traccarGeofenceId
        }
      } catch (err) {
        console.warn('[places] Traccar re-sync failed:', err.message)
      }
    }

    res.json(serializePlace(p))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.delete('/api/client/places/:placeId', authenticate, requireClientPrincipal, async (req, res) => {
  const { accountId } = req.clientPrincipal
  try {
    const [existing] = await db.select().from(places)
      .where(and(eq(places.id, req.params.placeId), eq(places.accountId, accountId)))
      .limit(1)
    if (!existing) return res.status(404).json({ error: 'Place not found' })

    if (existing.traccarGeofenceId) {
      try {
        await deleteGeofence(existing.traccarGeofenceId)
      } catch (err) {
        console.warn('[places] Traccar delete failed:', err.message)
      }
    }

    await db.delete(places).where(eq(places.id, req.params.placeId))
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

/* ── client plans ─────────────────────────────────────────────── */
app.get('/api/client/plans', authenticate, requireClientPrincipal, async (req, res) => {
  const { accountId } = req.clientPrincipal
  try {
    const rows = await db.select().from(plans).where(eq(plans.accountId, accountId))
    if (rows.length === 0) return res.json([])

    const planIds = rows.map(p => p.id)
    const [unitRows, legRows] = await Promise.all([
      db.select().from(planUnits).where(inArray(planUnits.planId, planIds)),
      db.select().from(planLegs).where(inArray(planLegs.planId, planIds)).orderBy(planLegs.legOrder),
    ])

    // Resolve place names for all legs in one query
    const placeIds = [...new Set(
      legRows.flatMap(l => [l.originPlaceId, l.destinationPlaceId].filter(Boolean))
    )]
    const placeRows = placeIds.length
      ? await db.select({ id: places.id, name: places.name }).from(places).where(inArray(places.id, placeIds))
      : []
    const placeMap = new Map(placeRows.map(p => [p.id, p.name]))

    const byPlanUnits = new Map()
    const byPlanLegs  = new Map()
    for (const u of unitRows) {
      if (!byPlanUnits.has(u.planId)) byPlanUnits.set(u.planId, [])
      byPlanUnits.get(u.planId).push(u)
    }
    for (const l of legRows) {
      if (!byPlanLegs.has(l.planId)) byPlanLegs.set(l.planId, [])
      byPlanLegs.get(l.planId).push(l)
    }

    res.json(rows.map(p => ({
      ...serializePlan(p, byPlanUnits.get(p.id) ?? [], []),
      legs: (byPlanLegs.get(p.id) ?? []).map(l => ({
        ...serializeLeg(l),
        originPlaceName:      l.originPlaceId      ? (placeMap.get(l.originPlaceId)      ?? null) : null,
        destinationPlaceName: l.destinationPlaceId ? (placeMap.get(l.destinationPlaceId) ?? null) : null,
      })),
    })))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.post('/api/client/plans', authenticate, requireClientPrincipal, async (req, res) => {
  const { accountId } = req.clientPrincipal
  const { name, type, enabled, notes, units = [], legs = [] } = req.body
  if (!name?.trim())  return res.status(400).json({ error: 'name is required' })
  if (!units.length)  return res.status(400).json({ error: 'at least one unit is required' })
  try {
    // Verify all specified units belong to this account
    const principalUnitIds = units.filter(u => u.unitType === 'principal').map(u => u.unitId)
    const vehicleUnitIds   = units.filter(u => u.unitType === 'vehicle').map(u => u.unitId)
    const [validPrincipals, validVehicles] = await Promise.all([
      principalUnitIds.length
        ? db.select({ id: principals.id }).from(principals)
            .where(and(inArray(principals.id, principalUnitIds), eq(principals.accountId, accountId)))
        : Promise.resolve([]),
      vehicleUnitIds.length
        ? db.select({ id: vehicles.id }).from(vehicles)
            .where(and(inArray(vehicles.id, vehicleUnitIds), eq(vehicles.accountId, accountId)))
        : Promise.resolve([]),
    ])
    const validIds = new Set([...validPrincipals.map(r => r.id), ...validVehicles.map(r => r.id)])
    if ([...principalUnitIds, ...vehicleUnitIds].some(id => !validIds.has(id))) {
      return res.status(400).json({ error: 'One or more units do not belong to your account' })
    }

    const [plan] = await db.insert(plans).values({
      accountId,
      name:    name.trim(),
      type:    type    ?? 'recurring',
      enabled: enabled !== false,
      notes:   notes   ?? null,
    }).returning()

    const [insertedUnits, insertedLegs] = await Promise.all([
      db.insert(planUnits).values(units.map(u => ({ planId: plan.id, unitId: u.unitId, unitType: u.unitType }))).returning(),
      legs.length > 0
        ? db.insert(planLegs).values(legs.map((l, i) => buildLegValues(plan.id, l, i))).returning()
        : Promise.resolve([]),
    ])
    res.json(serializePlan(plan, insertedUnits, insertedLegs))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.patch('/api/client/plans/:planId', authenticate, requireClientPrincipal, async (req, res) => {
  const { accountId } = req.clientPrincipal
  const { planId } = req.params
  const { name, type, enabled, notes, units, legs } = req.body
  try {
    const [plan] = await db.update(plans).set({
      ...(name    !== undefined && { name: name.trim() }),
      ...(type    !== undefined && { type }),
      ...(enabled !== undefined && { enabled }),
      ...(notes   !== undefined && { notes }),
      updatedAt: new Date(),
    }).where(and(eq(plans.id, planId), eq(plans.accountId, accountId))).returning()
    if (!plan) return res.status(404).json({ error: 'Plan not found' })

    if (units !== undefined && units.length > 0) {
      const principalUnitIds = units.filter(u => u.unitType === 'principal').map(u => u.unitId)
      const vehicleUnitIds   = units.filter(u => u.unitType === 'vehicle').map(u => u.unitId)
      const [validPrincipals, validVehicles] = await Promise.all([
        principalUnitIds.length
          ? db.select({ id: principals.id }).from(principals)
              .where(and(inArray(principals.id, principalUnitIds), eq(principals.accountId, accountId)))
          : Promise.resolve([]),
        vehicleUnitIds.length
          ? db.select({ id: vehicles.id }).from(vehicles)
              .where(and(inArray(vehicles.id, vehicleUnitIds), eq(vehicles.accountId, accountId)))
          : Promise.resolve([]),
      ])
      const validIds = new Set([...validPrincipals.map(r => r.id), ...validVehicles.map(r => r.id)])
      if ([...principalUnitIds, ...vehicleUnitIds].some(id => !validIds.has(id))) {
        return res.status(400).json({ error: 'One or more units do not belong to your account' })
      }
    }

    const [currentUnits, currentLegs] = await Promise.all([
      units !== undefined
        ? db.delete(planUnits).where(eq(planUnits.planId, planId))
            .then(() => units.length > 0
              ? db.insert(planUnits).values(units.map(u => ({ planId, unitId: u.unitId, unitType: u.unitType }))).returning()
              : [])
        : db.select().from(planUnits).where(eq(planUnits.planId, planId)),
      legs !== undefined
        ? db.delete(planLegs).where(eq(planLegs.planId, planId))
            .then(() => legs.length > 0
              ? db.insert(planLegs).values(legs.map((l, i) => buildLegValues(planId, l, i))).returning()
              : [])
        : db.select().from(planLegs).where(eq(planLegs.planId, planId)).orderBy(planLegs.legOrder),
    ])
    res.json(serializePlan(plan, currentUnits, currentLegs))
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

app.delete('/api/client/plans/:planId', authenticate, requireClientPrincipal, async (req, res) => {
  const { accountId } = req.clientPrincipal
  try {
    const [existing] = await db.select({ id: plans.id }).from(plans)
      .where(and(eq(plans.id, req.params.planId), eq(plans.accountId, accountId)))
      .limit(1)
    if (!existing) return res.status(404).json({ error: 'Plan not found' })

    await db.delete(plans).where(eq(plans.id, req.params.planId))
    res.json({ ok: true })
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }) }
})

/* ── operator live feed ───────────────────────────────────────── */
app.get('/api/live', authenticate, (req, res) => {
  res.setHeader('Content-Type',       'text/event-stream')
  res.setHeader('Cache-Control',      'no-cache')
  res.setHeader('Connection',         'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  res.write(`data: ${JSON.stringify({ type: 'snapshot', positions: getPositionCache() })}\n\n`)

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 30000)

  addSseClient(res)
  req.on('close', () => {
    clearInterval(heartbeat)
    removeSseClient(res)
  })
})

app.get('/api/traccar/devices', async (req, res) => {
  try {
    res.json(await fetchTraccarDevices())
  } catch (err) {
    console.error('[traccar] devices error:', err.message)
    res.status(502).json({ error: err.message })
  }
})

app.get('/api/triggers', ...requirePermission('triggers'), async (req, res) => {
  try {
    const rows = await db.select().from(triggers).orderBy(triggers.triggerType, triggers.severity)
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/triggers/:id', ...requirePermission('triggers'), async (req, res) => {
  const { name, severity, unitType, source, enabled, cooldownSeconds, conditions } = req.body
  console.log('[PATCH /api/triggers/:id] body:', req.body)
  try {
    const [updated] = await db.update(triggers)
      .set({
        name,
        severity,
        unitType,
        source,
        enabled,
        cooldownSeconds: cooldownSeconds ?? null,
        conditions:      sql`${JSON.stringify(conditions ?? {})}::jsonb`,
        updatedAt:       new Date(),
      })
      .where(eq(triggers.id, req.params.id))
      .returning()
    if (!updated) return res.status(404).json({ error: 'Trigger not found' })
    trackEvent({ event: 'trigger.updated', description: `${req.caller.name} updated trigger "${updated.name}"`, actorId: req.caller.id, subjectId: updated.id })
    res.json(updated)
    loadTriggerCache().catch(err => console.error('[triggerEngine] reload after patch failed:', err.message))
  } catch (err) {
    console.error('[PATCH /api/triggers/:id] error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/triggers/for-unit', ...requirePermission('triggers'), async (req, res) => {
  const { unitId, unitType } = req.query
  if (!unitId || !unitType) return res.status(400).json({ error: 'unitId and unitType required' })
  try {
    const rows = await db.select().from(triggers)
      .where(or(eq(triggers.unitType, unitType), eq(triggers.unitType, 'both')))
      .orderBy(triggers.triggerType, triggers.severity)

    const assignments = await db.select({ triggerId: triggerUnits.triggerId })
      .from(triggerUnits)
      .where(eq(triggerUnits.unitId, unitId))

    const assignedIds = new Set(assignments.map(a => a.triggerId))
    res.json(rows.map(t => ({ ...t, assigned: t.isUniversal || assignedIds.has(t.id) })))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/trigger-units', ...requirePermission('triggers'), async (req, res) => {
  const { triggerId, unitId, unitType } = req.body
  if (!triggerId || !unitId || !unitType) return res.status(400).json({ error: 'triggerId, unitId, unitType required' })
  try {
    await db.insert(triggerUnits).values({ triggerId, unitId, unitType }).onConflictDoNothing()
    refreshUnitInCache(unitId).catch(err => console.error('[triggerEngine] refresh failed:', err.message))
    const [trig, unit] = await Promise.all([
      db.select({ name: triggers.name }).from(triggers).where(eq(triggers.id, triggerId)).limit(1),
      unitType === 'principal'
        ? db.select({ name: principals.name }).from(principals).where(eq(principals.id, unitId)).limit(1)
        : db.select({ name: vehicles.callsign }).from(vehicles).where(eq(vehicles.id, unitId)).limit(1),
    ])
    trackEvent({ event: 'trigger.unit_assigned', description: `${req.caller.name} assigned trigger "${trig[0]?.name}" to "${unit[0]?.name}"`, actorId: req.caller.id, subjectId: triggerId })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/trigger-units', ...requirePermission('triggers'), async (req, res) => {
  const { triggerId, unitId, unitType } = req.body
  if (!triggerId || !unitId) return res.status(400).json({ error: 'triggerId and unitId required' })
  try {
    await db.delete(triggerUnits)
      .where(and(eq(triggerUnits.triggerId, triggerId), eq(triggerUnits.unitId, unitId)))
    refreshUnitInCache(unitId).catch(err => console.error('[triggerEngine] refresh failed:', err.message))
    const [trig, unit] = await Promise.all([
      db.select({ name: triggers.name }).from(triggers).where(eq(triggers.id, triggerId)).limit(1),
      unitType === 'principal'
        ? db.select({ name: principals.name }).from(principals).where(eq(principals.id, unitId)).limit(1)
        : unitType === 'vehicle'
          ? db.select({ name: vehicles.callsign }).from(vehicles).where(eq(vehicles.id, unitId)).limit(1)
          : Promise.resolve([]),
    ])
    trackEvent({ event: 'trigger.unit_unassigned', description: `${req.caller.name} unassigned trigger "${trig[0]?.name}" from "${unit[0]?.name}"`, actorId: req.caller.id, subjectId: triggerId })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ── alerts ─────────────────────────────────────────────────────────────────

app.get('/api/alerts/active', ...requirePermission('alerts'), async (req, res) => {
  try {
    const rows = await db.select({
      ...getTableColumns(alerts),
      triggerName:     triggers.name,
      triggerType:     triggers.triggerType,
      vehicleCallsign: vehicles.callsign,
      principalName:   principals.name,
    }).from(alerts)
      .leftJoin(triggers,   eq(alerts.triggerId, triggers.id))
      .leftJoin(vehicles,   and(eq(alerts.unitId, vehicles.id),   eq(alerts.unitType, 'vehicle')))
      .leftJoin(principals, and(eq(alerts.unitId, principals.id), eq(alerts.unitType, 'principal')))
      .where(eq(alerts.status, 'active'))
      .orderBy(desc(alerts.firedAt))

    const data = rows.map(({ vehicleCallsign, principalName, ...rest }) => ({
      ...rest,
      unitName: vehicleCallsign ?? principalName ?? null,
    }))
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/alerts', ...requirePermission('alerts'), async (req, res) => {
  const { status, severity, unitType, simulation, from, to, limit = 200, offset = 0 } = req.query
  try {
    const conditions = []
    if (status)              conditions.push(eq(alerts.status,       status))
    if (severity)            conditions.push(eq(alerts.severity,     severity))
    if (unitType)            conditions.push(eq(alerts.unitType,     unitType))
    if (simulation === 'true')  conditions.push(eq(alerts.isSimulation, true))
    if (simulation === 'false') conditions.push(eq(alerts.isSimulation, false))
    if (from)                conditions.push(gte(alerts.firedAt,    new Date(from)))
    if (to)                  conditions.push(lte(alerts.firedAt,    new Date(to)))

    const rows = await db.select({
      ...getTableColumns(alerts),
      triggerName:      triggers.name,
      triggerType:      triggers.triggerType,
      vehicleCallsign:  vehicles.callsign,
      principalName:    principals.name,
    }).from(alerts)
      .leftJoin(triggers,   eq(alerts.triggerId, triggers.id))
      .leftJoin(vehicles,   and(eq(alerts.unitId, vehicles.id),   eq(alerts.unitType, 'vehicle')))
      .leftJoin(principals, and(eq(alerts.unitId, principals.id), eq(alerts.unitType, 'principal')))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(alerts.firedAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset))

    const data = rows.map(({ vehicleCallsign, principalName, ...rest }) => ({
      ...rest,
      unitName: vehicleCallsign ?? principalName ?? null,
    }))
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/alerts/:id', ...requirePermission('alerts'), async (req, res) => {
  const { status, notes } = req.body
  const now = new Date()
  try {
    const updates = { updatedAt: now }
    if (notes !== undefined) updates.notes = notes

    if (status === 'acknowledged') {
      updates.status         = 'acknowledged'
      updates.acknowledgedBy = req.caller.id
      updates.acknowledgedAt = now
    } else if (status === 'resolved' || status === 'false_alarm') {
      updates.status     = status
      updates.resolvedBy = req.caller.id
      updates.resolvedAt = now
    } else if (status) {
      updates.status = status
    }

    const [updated] = await db.update(alerts)
      .set(updates)
      .where(eq(alerts.id, req.params.id))
      .returning()
    if (!updated) return res.status(404).json({ error: 'Alert not found' })
    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── dev / simulation endpoints ─────────────────────────────────────────────

app.get('/api/dev/simulatable-units', ...requirePermission('testing'), async (req, res) => {
  try {
    const devRows = await db.select({
      traccarDeviceId: devices.traccarDeviceId,
      vehicleId:       devices.vehicleId,
      principalId:     devices.principalId,
    }).from(devices).where(isNotNull(devices.traccarDeviceId))

    const vehicleIds   = devRows.filter(d => d.vehicleId).map(d => d.vehicleId)
    const principalIds = devRows.filter(d => d.principalId).map(d => d.principalId)

    const [vehicleRows, principalRows] = await Promise.all([
      vehicleIds.length
        ? db.select({ id: vehicles.id, callsign: vehicles.callsign }).from(vehicles).where(inArray(vehicles.id, vehicleIds))
        : Promise.resolve([]),
      principalIds.length
        ? db.select({ id: principals.id, name: principals.name }).from(principals).where(inArray(principals.id, principalIds))
        : Promise.resolve([]),
    ])

    const vehicleMap   = new Map(vehicleRows.map(v => [v.id, v.callsign]))
    const principalMap = new Map(principalRows.map(p => [p.id, p.name]))

    const units = devRows
      .map(d => ({
        traccarDeviceId: parseInt(d.traccarDeviceId, 10),
        unitId:   d.vehicleId ?? d.principalId,
        unitType: d.vehicleId ? 'vehicle' : 'principal',
        name: d.vehicleId
          ? (vehicleMap.get(d.vehicleId)     ?? 'Unknown Vehicle')
          : (principalMap.get(d.principalId) ?? 'Unknown Principal'),
      }))
      .filter(u => !isNaN(u.traccarDeviceId))

    res.json(units)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/dev/simulate-positions', ...requirePermission('testing'), async (req, res) => {
  const { positions } = req.body
  if (!Array.isArray(positions) || positions.length === 0)
    return res.status(400).json({ error: 'positions array required' })
  try {
    const collector = []
    evaluatePositionTriggers(positions, collector, true)
    res.json({ ok: true, results: collector })
  } catch (err) {
    res.status(500).json({ error: err.message })
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

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server] Express error handler:', err)
  res.status(500).json({ error: 'Internal server error' })
})

process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason)
})

app.listen(PORT, () => {
  console.log(`API server → http://localhost:${PORT}`)
  startTraccar()
  loadTriggerCache().catch(err => console.error('[startup] loadTriggerCache failed:', err.message))
  loadZoneTriggerCache().catch(err => console.error('[startup] loadZoneTriggerCache failed:', err.message))
})
