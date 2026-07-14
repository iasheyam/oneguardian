import { CognitoJwtVerifier } from 'aws-jwt-verify'
import { db } from '../db/index.js'
import { users, rolePermissions } from '../db/schema/users.js'
import { eq } from 'drizzle-orm'

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  tokenUse:   'access',
  clientId:   process.env.VITE_COGNITO_CLIENT_ID,
})

export async function authenticate(req, res, next) {
  // Accept Bearer header (normal requests) or ?token query param (SSE / EventSource)
  let token = null
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    token = header.slice(7)
  } else if (typeof req.query.token === 'string') {
    token = req.query.token
  }

  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  try {
    let payload
    try {
      payload = await verifier.verify(token)
    } catch (err) {
      console.error('[auth] JWT verify failed:', err.message)
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const [user] = await db
      .select({ id: users.id, roleId: users.roleId })
      .from(users)
      .where(eq(users.cognitoSub, payload.sub))
      .limit(1)

    if (!user) {
      return res.status(401).json({ error: 'User not provisioned' })
    }

    let permissions = []
    if (user.roleId) {
      const rows = await db
        .select({ permission: rolePermissions.permission })
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, user.roleId))
      permissions = rows.map(r => r.permission)
    }

    req.caller = { id: user.id, roleId: user.roleId, permissions }
    next()
  } catch (err) {
    console.error('[auth] authenticate error:', err)
    next(err)
  }
}

export function requirePermission(key) {
  return [
    authenticate,
    (req, res, next) => {
      if (!req.caller.permissions.includes(key)) {
        return res.status(403).json({ error: `Requires '${key}' permission` })
      }
      next()
    },
  ]
}
