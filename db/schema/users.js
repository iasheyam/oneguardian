import { pgTable, uuid, text, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id:           uuid('id').primaryKey().defaultRandom(),
  cognitoSub:   text('cognito_sub').unique(),
  name:         text('name').notNull(),
  email:        text('email').notNull().unique(),
  phone:        text('phone'),
  type:         text('type').notNull().default('internal'),
  role:         text('role').notNull().default('Operator'),
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
  subjectId:   uuid('subject_id').references(() => users.id, { onDelete: 'set null' }),
  metadata:    jsonb('metadata'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const invitations = pgTable('invitations', {
  id:         uuid('id').primaryKey().defaultRandom(),
  email:      text('email').notNull().unique(),
  name:       text('name').notNull(),
  type:       text('type').notNull().default('internal'),
  role:       text('role').notNull().default('Operator'),
  invitedBy:  uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
  invitedAt:  timestamp('invited_at',  { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  status:     text('status').notNull().default('pending'),
})
