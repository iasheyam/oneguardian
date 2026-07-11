import { db } from '../db/index.js'
import { activityLogs } from '../db/schema/users.js'

/**
 * Record an audit event in activity_logs.
 *
 * Usage:
 *   import { trackEvent } from './trackEvent.js'
 *
 *   await trackEvent({
 *     event:       'user.login',
 *     description: 'jordan@example.com signed in',
 *     actorId:     'uuid-of-the-user-who-acted',   // required — null only for system-initiated events
 *     subjectId:   null,                            // omit or null when actor IS the subject (e.g. login)
 *     metadata:    { ip: '1.2.3.4' },              // omit when no extra context is needed
 *   })
 *
 * Event key conventions:
 *   - Dot-namespaced, lowercase, underscores for spaces: "user.login", "member.role_changed"
 *   - Namespace reflects the primary resource: user | member | invitation | system
 *
 * Description conventions:
 *   - Always a complete sentence in past tense
 *   - Always use the full name of the actor and subject, never their email
 *   - Pattern: "{Actor name} {verb} {object}"
 *   - Examples:
 *       "Jordan Reyes signed in"
 *       "Admin User invited Jordan Reyes"
 *       "Admin User changed role of Jordan Reyes from Operator to Admin"
 *       "Admin User updated contact information for Jordan Reyes"
 *   - Keep it factual and specific enough for an auditor to understand without extra context
 *
 * Metadata conventions:
 *   - Use for machine-readable context that doesn't belong in the description
 *   - For value changes, always include both old and new: { from: 'Operator', to: 'Admin' }
 *   - Common keys: from, to, ip, fields (array of changed field names)
 *   - Omit metadata entirely rather than passing an empty object
 *
 * Errors are caught and logged — a failed audit write never blocks the main operation.
 */
export async function trackEvent({ event, description, actorId = null, subjectId = null, metadata = null }) {
  try {
    await db.insert(activityLogs).values({ event, description, actorId, subjectId, metadata })
  } catch (err) {
    console.error('[trackEvent] Failed to write activity log:', err)
  }
}
