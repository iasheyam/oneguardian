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
import { eq, and, or, getTableColumns, desc } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { trackEvent } from './trackEvent.js'

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

app.listen(PORT, () => console.log(`API server → http://localhost:${PORT}`))
