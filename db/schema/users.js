import { pgTable, uuid, text, boolean, timestamp, jsonb, primaryKey } from 'drizzle-orm/pg-core'

export const roles = pgTable('roles', {
  id:          uuid('id').primaryKey().defaultRandom(),
  name:        text('name').notNull().unique(),
  description: text('description'),
  color:       text('color').notNull().default('#66727A'),
  isSystem:    boolean('is_system').notNull().default(false),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const rolePermissions = pgTable('role_permissions', {
  roleId:     uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permission: text('permission').notNull(),
}, t => [
  primaryKey({ columns: [t.roleId, t.permission] })
])

export const users = pgTable('users', {
  id:           uuid('id').primaryKey().defaultRandom(),
  cognitoSub:   text('cognito_sub').unique(),
  name:         text('name').notNull(),
  email:        text('email').notNull().unique(),
  phone:        text('phone'),
  type:         text('type').notNull().default('internal'),
  roleId:       uuid('role_id').references(() => roles.id, { onDelete: 'set null' }),
  twoFactor:    boolean('two_factor').notNull().default(false),
  status:       text('status').notNull().default('offline'),
  addedBy:      uuid('added_by'),
  createdAt:    timestamp('created_at',      { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at',      { withTimezone: true }).notNull().defaultNow(),
  lastActiveAt: timestamp('last_active_at',  { withTimezone: true }),
})

export const employeeProfiles = pgTable('employee_profiles', {
  userId:     uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  jobTitle:   text('job_title'),
  department: text('department'),
  employeeId: text('employee_id'),
})

export const activityLogs = pgTable('activity_logs', {
  id:          uuid('id').primaryKey().defaultRandom(),
  event:       text('event').notNull(),
  description: text('description').notNull(),
  actorId:     uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  subjectId:   uuid('subject_id'),
  metadata:    jsonb('metadata'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const invitations = pgTable('invitations', {
  id:         uuid('id').primaryKey().defaultRandom(),
  email:      text('email').notNull().unique(),
  name:       text('name').notNull(),
  type:       text('type').notNull().default('internal'),
  roleId:     uuid('role_id').references(() => roles.id, { onDelete: 'set null' }),
  invitedBy:  uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
  invitedAt:  timestamp('invited_at',  { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  status:     text('status').notNull().default('pending'),
})
